import { afterEach, describe, expect, it, vi } from 'vitest'
import { childEnv, deploymentRefusal, localPorts, parseTryArgs, portHolder, siblingOrigin } from '../../scripts/try/kit.mjs'

// `pnpm try` runs on the local deployment `website/.env.local` names, and
// on nothing else: never a cloud deployment, a self-hosted one, one a
// deploy key selects, or another checkout's local deployment on the same
// ports.

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('the deployment guard', () => {
  it('runs on a local deployment, or on none yet, which it provisions', () => {
    expect(deploymentRefusal({})).toBeNull()
    expect(deploymentRefusal({ CONVEX_DEPLOYMENT: 'anonymous:anonymous-agent' })).toBeNull()
    expect(deploymentRefusal({ CONVEX_DEPLOYMENT: 'local:team-project' })).toBeNull()
  })

  it('refuses a cloud deployment, a self-hosted one and a deploy key', () => {
    expect(deploymentRefusal({ CONVEX_DEPLOYMENT: 'dev:joyous-akita-567' })).toMatch(/off this machine/)
    expect(deploymentRefusal({ CONVEX_DEPLOYMENT: 'prod:joyous-akita-567' })).toMatch(/off this machine/)
    expect(deploymentRefusal({ CONVEX_SELF_HOSTED_URL: 'http://127.0.0.1:3210' })).toMatch(/self-hosted/)
    expect(deploymentRefusal({ CONVEX_DEPLOYMENT: 'anonymous:x', CONVEX_DEPLOY_KEY: 'prod:abc|secret' })).toMatch(/deploy key/)
  })

  it('never passes a deployment the shell names on to the Convex CLI', () => {
    vi.stubEnv('CONVEX_DEPLOY_KEY', 'prod:abc|secret')
    vi.stubEnv('CONVEX_DEPLOYMENT', 'dev:joyous-akita-567')
    const env = childEnv({ EXTRA: '1' })
    expect(env.CONVEX_DEPLOY_KEY).toBeUndefined()
    expect(env.CONVEX_DEPLOYMENT).toBeUndefined()
    expect(env.EXTRA).toBe('1')
  })

  it('tells its own deployment on the port from another checkout\'s', async () => {
    const answers = (status: number) => vi.fn(async () => new Response(null, { status }))
    const env = { CONVEX_DEPLOYMENT: 'anonymous:nobody-has-this-one', CONVEX_URL: 'http://127.0.0.1:3210' }
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch failed')
    }))
    expect(await portHolder(env)).toBe('down')
    // No admin key on disk for it: a signed-in account's local deployment, trusted as is.
    vi.stubGlobal('fetch', answers(200))
    expect(await portHolder(env)).toBe('ours')
    // Its admin key: accepted by its own backend, refused by another checkout's.
    const fetch = answers(401)
    vi.stubGlobal('fetch', fetch)
    expect(await portHolder(env, 'anonymous-agent|key')).toBe('foreign')
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:3210/api/check_admin_key', expect.objectContaining({ headers: { authorization: 'Convex anonymous-agent|key' } }))
    vi.stubGlobal('fetch', answers(200))
    expect(await portHolder(env, 'anonymous-agent|key')).toBe('ours')
  })
})

describe('the kit\'s options and origins', () => {
  it('takes --lan, --tailscale and --name, and nothing else', () => {
    expect(parseTryArgs([])).toEqual({ mode: 'localhost', name: 'nuxt-backend' })
    expect(parseTryArgs(['--lan'])).toEqual({ mode: 'lan', name: 'nuxt-backend' })
    expect(parseTryArgs(['--tailscale', '--name', 'd1'])).toEqual({ mode: 'tailscale', name: 'd1' })
    expect(parseTryArgs(['--name=review'])).toMatchObject({ name: 'review' })
    expect(() => parseTryArgs(['--lan', '--tailscale'])).toThrow(/one of/)
    expect(() => parseTryArgs(['--prod'])).toThrow(/Unknown option/)
    expect(() => parseTryArgs(['--name', 'Not A Label'])).toThrow(/hostname label/)
  })

  it('serves the deployment\'s URLs beside the app, under the same proxy', () => {
    expect(siblingOrigin('https://nuxt-backend.localhost', 'api')).toBe('https://api.nuxt-backend.localhost')
    expect(siblingOrigin('https://nuxt-backend.local', 'site')).toBe('https://site.nuxt-backend.local')
    expect(siblingOrigin('https://nuxt-backend.localhost:1355', 'api')).toBe('https://api.nuxt-backend.localhost:1355')
  })

  it('reads the local deployment\'s ports from the URLs the Convex CLI wrote', () => {
    expect(localPorts({ CONVEX_URL: 'http://127.0.0.1:3210', CONVEX_SITE_URL: 'http://127.0.0.1:3211' })).toEqual({ cloud: 3210, site: 3211 })
    expect(localPorts({ CONVEX_URL: 'http://127.0.0.1:3230' })).toEqual({ cloud: 3230, site: 3231 })
    expect(localPorts({})).toBeNull()
  })
})
