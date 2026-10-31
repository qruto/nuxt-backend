import { afterEach, describe, expect, it, vi } from 'vitest'
import { backendHealth, deploymentLayerContext, readHealthHints } from '../../src/convex/integrations/health'
import { registerBackendRoutes } from '../../src/convex/integrations/http'
import { BACKEND_ENV } from '../../src/env-registry'
import { CAPABILITY_NAMES } from '../../src/capabilities'

// The backend's own health route: every app capability's state, detected from
// the env the deployment holds with the registry's own detect. The public
// sees the states and nothing else; an admin's session, or anyone on a
// deployment env push named `development`, the detail.

const CLOUD = 'https://happy-otter-123.convex.cloud'

afterEach(() => {
  vi.unstubAllEnvs()
})

/** Set the deployment's env, as the runtime has it. */
function deploymentEnv(env: Record<string, string>) {
  for (const name of [...Object.keys(BACKEND_ENV), 'CONVEX_CLOUD_URL']) vi.stubEnv(name, env[name] ?? '')
}

/** An action ctx whose caller has these claims, or none. */
function ctxOf(claims: Record<string, unknown> | null) {
  return { auth: { getUserIdentity: vi.fn(async () => claims) } } as never
}

/** The auth component's account reader, answering with this account. */
const authWith = (user: { role?: string | null, banned?: boolean, passkeyOnly?: boolean } | null) => ({ safeGetAuthUser: vi.fn(async () => user) })

const request = (query = '') => new Request(`https://happy-otter-123.convex.site/backend/health${query}`)

describe('the deployment\'s view of its own capabilities', () => {
  it('reads the names it holds by presence, the environment by value, and its kind by its URL', () => {
    const context = deploymentLayerContext({ CONVEX_CLOUD_URL: CLOUD, AUTH_SECRET: 's', EMAIL_API_KEY: 'k', BACKEND_ENVIRONMENT: 'production', BILLING_ACCESS_TOKEN: '' })
    expect([...context.deployed!].sort()).toEqual(['AUTH_SECRET', 'BACKEND_ENVIRONMENT', 'EMAIL_API_KEY'])
    expect(context.switches).toEqual({ BACKEND_ENVIRONMENT: 'production' })
    expect(context.deployment).toBe('production')
    expect(context.findings).toEqual([])
    expect(deploymentLayerContext({ CONVEX_CLOUD_URL: 'http://127.0.0.1:3210' }).deployment).toBe('local')
    expect(deploymentLayerContext({ CONVEX_CLOUD_URL: 'https://convex.acme.dev' }).deployment).toBe('self-hosted')
  })

  it('takes the environment env push named it for its kind, a dev one cloud or local by its URL', () => {
    expect(deploymentLayerContext({ CONVEX_CLOUD_URL: CLOUD, BACKEND_ENVIRONMENT: 'development' }).deployment).toBe('cloud-dev')
    expect(deploymentLayerContext({ CONVEX_CLOUD_URL: 'http://127.0.0.1:3210', BACKEND_ENVIRONMENT: 'development' }).deployment).toBe('local')
    expect(deploymentLayerContext({ CONVEX_CLOUD_URL: CLOUD, BACKEND_ENVIRONMENT: 'preview' }, { deployment: 'production' }).deployment).toBe('preview')
    expect(deploymentLayerContext({ CONVEX_CLOUD_URL: CLOUD, BACKEND_ENVIRONMENT: 'production' }, { deployment: 'cloud-dev' }).deployment).toBe('production')
    // A demo in production mode is production's kind, not a dev deployment.
    expect(deploymentLayerContext({ CONVEX_CLOUD_URL: CLOUD, BACKEND_ENVIRONMENT: 'sandbox' }, { deployment: 'cloud-dev' }).deployment).toBe('production')
  })

  it('fails monitoring when its DSN is set and does not parse, the one failure its env can show', () => {
    expect(deploymentLayerContext({ CONVEX_CLOUD_URL: CLOUD, MONITORING_DSN: 'https://k@o.test/1' }).findings).toEqual([])
    expect(deploymentLayerContext({ CONVEX_CLOUD_URL: CLOUD, MONITORING_DSN: 'not-a-dsn' }).findings).toEqual([expect.objectContaining({ id: 'deployment-monitoring-dsn', capability: 'monitoring', status: 'fail' })])
  })

  it('takes the app\'s word for a cloud deployment\'s kind, and never for a local one', () => {
    expect(deploymentLayerContext({ CONVEX_CLOUD_URL: CLOUD }, { deployment: 'cloud-dev' }).deployment).toBe('cloud-dev')
    expect(deploymentLayerContext({ CONVEX_CLOUD_URL: CLOUD }, { deployment: 'local' }).deployment).toBe('production')
    expect(deploymentLayerContext({ CONVEX_CLOUD_URL: 'http://127.0.0.1:3210' }, { deployment: 'production' }).deployment).toBe('local')
    expect(readHealthHints('https://x.test/backend/health?deployment=cloud-dev&monitoring=1')).toEqual({ deployment: 'cloud-dev', monitoring: true })
    expect(readHealthHints('https://x.test/backend/health')).toEqual({ deployment: null })
  })
})

describe('the health route', () => {
  it('shows the public every capability\'s state, and nothing of how the app is configured', async () => {
    deploymentEnv({ CONVEX_CLOUD_URL: CLOUD, AUTH_SECRET: 's', SITE_URL: 'https://app.test', EMAIL_API_KEY: 'k' })
    const health = await backendHealth(ctxOf(null), request(), authWith({ role: 'admin' }))
    expect(Object.keys(health).sort()).toEqual(['capabilities', 'status'])
    expect(Object.keys(health.capabilities)).toEqual(CAPABILITY_NAMES)
    expect(health).toMatchObject({ status: 'degraded', capabilities: { data: 'live', email: 'test', billing: 'missing', monitoring: 'missing' } })
    const text = JSON.stringify(health)
    for (const name of Object.keys(BACKEND_ENV)) expect(text).not.toContain(name)
  })

  it('adds the app\'s own report: a DSN its server sees makes monitoring live', async () => {
    deploymentEnv({ CONVEX_CLOUD_URL: CLOUD })
    expect((await backendHealth(ctxOf(null), request('?monitoring=1'))).capabilities.monitoring).toBe('live')
    expect((await backendHealth(ctxOf(null), request('?monitoring=0&deployment=cloud-dev'))).capabilities.monitoring).toBe('test')
  })

  it('gives an admin\'s session the detail, read fresh, and nobody else', async () => {
    deploymentEnv({ CONVEX_CLOUD_URL: CLOUD, AUTH_SECRET: 's', SITE_URL: 'https://app.test' })
    const session = { subject: 'user-1', sessionId: 's1' }
    const detail = await backendHealth(ctxOf(session), request(), authWith({ role: 'user,admin' }))
    expect(detail).toHaveProperty('detail')
    expect((detail as { detail: Record<string, { missingEnv: string[] }> }).detail.email!.missingEnv).toContain('EMAIL_API_KEY')
    // A plain user, a banned admin and a session without an account reader: coarse.
    for (const [claims, auth] of [
      [session, authWith({ role: 'user' })],
      [session, authWith({ role: 'admin', banned: true })],
      [session, undefined],
    ] as const) {
      expect(await backendHealth(ctxOf(claims), request(), auth)).not.toHaveProperty('detail')
    }
  })

  it('holds an admin on a sandbox to the passkey rule: a passkey-only account, signed in with a passkey', async () => {
    deploymentEnv({ CONVEX_CLOUD_URL: CLOUD, BACKEND_ENVIRONMENT: 'sandbox' })
    const code = { subject: 'user-1', sessionId: 's1', signInMethod: 'email-otp' }
    const passkey = { ...code, signInMethod: 'passkey' }
    expect(await backendHealth(ctxOf(passkey), request(), authWith({ role: 'admin' }))).not.toHaveProperty('detail')
    expect(await backendHealth(ctxOf(code), request(), authWith({ role: 'admin', passkeyOnly: true }))).not.toHaveProperty('detail')
    expect(await backendHealth(ctxOf(passkey), request(), authWith({ role: 'admin', passkeyOnly: true }))).toHaveProperty('detail')
  })

  it('reads an admin by the roles the app counts as admin', async () => {
    deploymentEnv({ CONVEX_CLOUD_URL: CLOUD })
    const session = { subject: 'user-1', sessionId: 's1' }
    expect(await backendHealth(ctxOf(session), request(), authWith({ role: 'owner' }))).not.toHaveProperty('detail')
    expect(await backendHealth(ctxOf(session), request(), authWith({ role: 'owner' }), ['owner', 'admin'])).toHaveProperty('detail')
  })

  it('gives anyone the detail on a deployment named development, a cloud one too, and a loopback URL alone is no proof', async () => {
    for (const url of ['http://127.0.0.1:3210', CLOUD]) {
      deploymentEnv({ CONVEX_CLOUD_URL: url, BACKEND_ENVIRONMENT: 'development' })
      expect(await backendHealth(ctxOf(null), request()), url).toHaveProperty('detail')
    }
    // A deployment named development is not production: its capabilities are in test.
    expect((await backendHealth(ctxOf(null), request())).capabilities.data).toBe('test')
    // A self-hosted backend on its default loopback origin, with no environment named: coarse.
    deploymentEnv({ CONVEX_CLOUD_URL: 'http://127.0.0.1:3210' })
    const health = await backendHealth(ctxOf(null), request())
    expect(health).not.toHaveProperty('detail')
    expect(health.capabilities.data).toBe('test')
  })

  it('answers failing for a capability whose env is set and unusable, with the finding as its top', async () => {
    deploymentEnv({ CONVEX_CLOUD_URL: CLOUD, BACKEND_ENVIRONMENT: 'development', MONITORING_DSN: 'not-a-dsn' })
    const health = await backendHealth(ctxOf(null), request())
    expect(health.status).toBe('failing')
    expect(health.detail?.monitoring).toMatchObject({ top: 'deployment-monitoring-dsn' })
  })

  it('is mounted by registerBackendRoutes at its fixed /backend/health', () => {
    const http = { route: vi.fn() }
    const options = {
      auth: { authComponent: { registerRoutes: vi.fn() }, createAuth: () => {}, mcp: { exchangeHandler: vi.fn() } },
      billing: { webhookHandler: vi.fn() },
      email: { webhookHandler: vi.fn() },
      ai: { httpHandler: vi.fn(), corsOrigin: 'https://app.test' },
    }
    registerBackendRoutes(http as never, { ...options, adminRoles: ['owner'] })
    const routes = http.route.mock.calls.map(([spec]) => `${(spec as { method: string }).method} ${(spec as { path: string }).path}`)
    expect(routes).toContain('GET /backend/health')
  })
})
