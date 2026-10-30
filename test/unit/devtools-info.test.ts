import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { computeDeployment, parseEnvFile } from '../../src/deployment'
import {
  buildDevtoolsInfo,
  computeDevtoolsPages,
  envTier,
  resolveBackendSource,
  type BuildDevtoolsInfoInput,
} from '../../src/devtools/info'
import { finding } from '../../src/findings'
import { resolvedBackendPages } from '../../src/pages'

describe('computeDevtoolsPages', () => {
  it('flags pages whose path an app page already occupies', () => {
    const resolved = resolvedBackendPages(undefined)
    const pages = computeDevtoolsPages(resolved, new Set(['/login', '/settings']))

    expect(pages.find(page => page.key === 'login')).toEqual(
      { key: 'login', path: '/login', auth: false, shadowed: true },
    )
    expect(pages.find(page => page.key === 'settings')).toMatchObject({ auth: true, shadowed: true })
    expect(pages.find(page => page.key === 'pricing')).toMatchObject({ path: '/pricing', shadowed: false })
  })

  it('lists every page at its path', () => {
    const resolved = resolvedBackendPages({ login: '/sign-in' })
    const pages = computeDevtoolsPages(resolved, new Set(['/sign-in']))

    expect(pages).toHaveLength(Object.keys(resolved).length)
    expect(pages.find(page => page.key === 'login')).toMatchObject({ path: '/sign-in', shadowed: true })
  })
})

describe('envTier', () => {
  it('reduces the two-tier env contract to presence booleans', () => {
    const env: Record<string, string> = { AUTH_SECRET: 'x', EMAIL_API_KEY: 'y' }
    const tier = envTier(name => Boolean(env[name]))

    expect(tier.required).toEqual({ AUTH_SECRET: true, SITE_URL: false })
    expect(tier.optional.EMAIL_API_KEY).toBe(true)
    expect(tier.optional.BILLING_ACCESS_TOKEN).toBe(false)
    // Every optional-tier var is reported, none invented.
    expect(Object.keys(tier.optional)).toContain('BACKEND_ENVIRONMENT')
  })
})

describe('computeDeployment', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'nuxt-backend-devtools-deployment-'))
  afterAll(() => rmSync(rootDir, { recursive: true, force: true }))

  it('names the kind from the deployment id, with the cloud dashboard', () => {
    expect(computeDeployment(rootDir, { CONVEX_DEPLOYMENT: 'dev:brave-fox-123' })).toEqual({
      kind: 'cloud-dev',
      id: 'dev:brave-fox-123',
      url: 'https://brave-fox-123.convex.cloud',
      siteUrl: 'https://brave-fox-123.convex.site',
      dashboardUrl: 'https://dashboard.convex.dev/d/brave-fox-123',
    })
    expect(computeDeployment(rootDir, { CONVEX_DEPLOYMENT: 'prod:steady-owl-456' })).toMatchObject({ kind: 'production', dashboardUrl: 'https://dashboard.convex.dev/d/steady-owl-456' })
    expect(computeDeployment(rootDir, { CONVEX_DEPLOYMENT: 'preview:branch-1' })).toMatchObject({ kind: 'preview' })
  })

  it('knows a local backend by the URLs the CLI wrote, and gives it no dashboard', () => {
    const local = computeDeployment(rootDir, { CONVEX_DEPLOYMENT: 'anonymous:anonymous-agent', CONVEX_URL: 'http://127.0.0.1:3210', CONVEX_SITE_URL: 'http://127.0.0.1:3211' })
    expect(local).toEqual({ kind: 'anonymous', id: 'anonymous:anonymous-agent', url: 'http://127.0.0.1:3210', siteUrl: 'http://127.0.0.1:3211' })
    expect(computeDeployment(rootDir, { CONVEX_DEPLOYMENT: 'local:my-app' }).kind).toBe('local')
  })

  it('reports a self-hosted backend and no deployment at all', () => {
    expect(computeDeployment(rootDir, { CONVEX_SELF_HOSTED_URL: 'https://convex.example.com/' })).toEqual({ kind: 'self-hosted', url: 'https://convex.example.com' })
    expect(computeDeployment(rootDir, {})).toEqual({ kind: 'none' })
  })
})

describe('buildDevtoolsInfo', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'nuxt-backend-devtools-info-'))
  afterAll(() => rmSync(rootDir, { recursive: true, force: true }))

  const input = (env: Record<string, string | undefined>, extra: Partial<BuildDevtoolsInfoInput> = {}): BuildDevtoolsInfoInput => ({
    rootDir,
    env,
    siteUrlConfigured: true,
    options: { authRoute: '/api/auth' },
    pages: [{ key: 'login', path: '/login', auth: false, shadowed: false }],
    versions: { 'nuxt-backend': '0.1.0' },
    functionsDir: 'backend',
    deploymentEnv: null,
    provisionedNames: undefined,
    ...extra,
  })

  it('never leaks env values — only presence booleans and findings cross the RPC', () => {
    const sentinels = {
      AUTH_SECRET: 'sentinel-auth-secret-value-0123456789abcdef',
      EMAIL_API_KEY: 'sentinel-email-key-value',
      EMAIL_WEBHOOK_SECRET: 'sentinel-email-webhook-value',
      BILLING_ACCESS_TOKEN: 'sentinel-billing-token-value',
      BILLING_WEBHOOK_SECRET: 'sentinel-billing-webhook-value',
      CONVEX_DEPLOY_KEY: 'dev:brave-fox-123|sentinel-deploy-key-value',
      SOME_UNRELATED_TOKEN: 'sentinel-unrelated-value',
    }
    // The module hands over the env files merged under the process env, the
    // way Nuxt reads them: a secret in .env.local must not leak either.
    writeFileSync(join(rootDir, '.env.local'), 'EMAIL_FROM=sentinel-from@example.com\n')
    const env = { ...parseEnvFile(readFileSync(join(rootDir, '.env.local'), 'utf-8')), ...sentinels, SITE_URL: 'https://app.example.com', CONVEX_DEPLOYMENT: 'dev:brave-fox-123' }
    const deploymentEnv = { status: 'ok' as const, readAt: 1, names: envTier(() => true) }
    const info = buildDevtoolsInfo(input(env, { deploymentEnv }))

    const serialized = JSON.stringify(info)
    for (const value of [...Object.values(sentinels), 'sentinel-from@example.com']) {
      expect(serialized).not.toContain(value)
    }
    expect(info.env.visible.required).toEqual({ AUTH_SECRET: true, SITE_URL: true })
    expect(info.env.visible.optional.EMAIL_FROM).toBe(true)
    expect(info.env.deployment).toEqual(deploymentEnv)
    // Vars outside the deployment contract are not reported at all.
    expect(serialized).not.toContain('SOME_UNRELATED_TOKEN')
    // The capability console reads the names set, and shows states only: every
    // name is on this dev deployment, but the panel reads no value, and none
    // of the two switches is visible here, so email keeps test mode and
    // billing the sandbox, and their reasons say so.
    expect(info.capabilities.map(capability => capability.state)).toEqual(['test', 'test', 'test', 'test', 'test', 'test', 'test', 'test', 'live', 'live', 'test', 'missing'])
    expect(info.capabilities.find(capability => capability.name === 'email')?.reason).toContain('its value was not read')
  })

  // The Overview's console: a channel per capability, lit from the preflight,
  // the deployment env names last read and the last doctor run.
  it('lights a channel per capability, from the preflight, the deployment env read and the last doctor run', () => {
    const local = buildDevtoolsInfo(input({ CONVEX_DEPLOYMENT: 'local:local-acme-app' }))
    expect(local.capabilities.map(capability => [capability.name, capability.state])).toEqual([
      ['auth', 'missing'],
      ['data', 'test'],
      ['jobs', 'test'],
      ['billing', 'missing'],
      ['email', 'missing'],
      // No web push key pair until env push generates it: the inbox works, push does not.
      ['notifications', 'missing'],
      ['ai', 'missing'],
      ['protection', 'test'],
      ['monitoring', 'test'],
      ['flags', 'live'],
      ['analytics', 'missing'],
      ['hosting', 'missing'],
    ])
    expect(local.capabilities.find(capability => capability.name === 'billing')).toMatchObject({ providers: ['Polar'], devtools: 'billing', docsUrl: 'https://nuxt-backend.dev/docs/build/billing', top: { id: 'billing-access', status: 'warn' } })

    const read = { status: 'ok' as const, readAt: 1, names: envTier(name => ['AUTH_SECRET', 'SITE_URL', 'EMAIL_API_KEY'].includes(name)) }
    const route = finding('email-webhook-route', 'fail', '/email/events is not mounted on the deployment.')
    const checked = buildDevtoolsInfo(input({ CONVEX_DEPLOYMENT: 'dev:brave-fox-123' }, { deploymentEnv: read, doctor: { ranAt: 5, findings: [route] } }))
    expect(checked.capabilities.find(capability => capability.name === 'auth')?.state).toBe('test')
    expect(checked.capabilities.find(capability => capability.name === 'email')).toMatchObject({ state: 'failing', top: { id: 'email-webhook-route' } })
    expect(checked.doctorRanAt).toBe(5)
    expect(local.doctorRanAt).toBeNull()
  })

  it('lets the live preflight win over the last doctor run where both report an id, so a fix shows at once', () => {
    const fixed = { AUTH_SECRET: 'a'.repeat(40), SITE_URL: 'https://app.example.com' }
    const info = buildDevtoolsInfo(input(fixed, { doctor: { ranAt: 5, findings: [finding('auth-secret', 'fail', 'AUTH_SECRET is too short.')] } }))
    expect(info.findings.find(item => item.id === 'auth-secret')?.status).toBe('pass')
    expect(info.capabilities.find(capability => capability.name === 'auth')).toMatchObject({ state: 'test', findings: { fail: 0 } })
  })

  it('counts a key visible here and missing from the read deployment as missing, and the provisioned names as set before a read', () => {
    const read = { status: 'ok' as const, readAt: 1, names: envTier(name => ['AUTH_SECRET', 'SITE_URL'].includes(name)) }
    const unpushed = buildDevtoolsInfo(input({ CONVEX_DEPLOYMENT: 'dev:brave-fox-123', EMAIL_API_KEY: 'k' }, { deploymentEnv: read }))
    expect(unpushed.capabilities.find(capability => capability.name === 'email')).toMatchObject({ state: 'missing', reason: 'EMAIL_API_KEY is set here but not on the deployment (run env push), so sends no-op' })
    const provisioned = buildDevtoolsInfo(input({ CONVEX_DEPLOYMENT: 'dev:brave-fox-123', EMAIL_API_KEY: 'k' }, { provisionedNames: new Set(['AUTH_SECRET', 'SITE_URL']) }))
    expect(provisioned.capabilities.find(capability => capability.name === 'auth')?.state).toBe('test')
    // Before a read, the env visible here stands in for the rest.
    expect(provisioned.capabilities.find(capability => capability.name === 'email')?.state).toBe('test')
  })

  it('collects live preflight findings', () => {
    const info = buildDevtoolsInfo(input({}))
    expect(info.findings.find(finding => finding.id === 'auth-secret')?.status).toBe('warn')
  })

  it('counts a name set on the deployment as set, from a read or from env push', () => {
    const read = { status: 'ok' as const, readAt: 1, names: envTier(name => name === 'AUTH_SECRET' || name === 'EMAIL_API_KEY') }
    const fromRead = buildDevtoolsInfo(input({}, { deploymentEnv: read }))
    expect(fromRead.findings.find(finding => finding.id === 'auth-secret')?.status).toBe('pass')
    expect(fromRead.findings.find(finding => finding.id === 'email-transport')?.status).toBe('pass')
    expect(fromRead.findings.find(finding => finding.id === 'site-url')?.status).toBe('warn')

    const fromPush = buildDevtoolsInfo(input({}, { provisionedNames: new Set(['AUTH_SECRET', 'SITE_URL']) }))
    expect(fromPush.findings.find(finding => finding.id === 'site-url')?.status).toBe('pass')
  })

  it('reads billing as the provider\'s sandbox once a token is set, and missing before', () => {
    const local = { CONVEX_DEPLOYMENT: 'local:my-app' }
    const keyed = { status: 'ok' as const, readAt: 1, names: envTier(name => name === 'BILLING_ACCESS_TOKEN') }
    expect(buildDevtoolsInfo(input(local, { deploymentEnv: keyed })).capabilities.find(capability => capability.name === 'billing')).toMatchObject({ state: 'test', reason: 'the billing sandbox' })
    expect(buildDevtoolsInfo(input(local)).capabilities.find(capability => capability.name === 'billing')?.state).toBe('missing')
  })

  it('snapshots the options that wire the app, and the deployment', () => {
    const info = buildDevtoolsInfo(input({ CONVEX_DEPLOYMENT: 'dev:brave-fox-123' }))
    expect(info.options).toEqual({ authRoute: '/api/auth' })
    expect(info.deployment).toMatchObject({ kind: 'cloud-dev', id: 'dev:brave-fox-123' })
  })

  it('reflects a moved auth route in the snapshot', () => {
    const info = buildDevtoolsInfo({ ...input({}), options: { authRoute: '/auth' } })
    expect(info.options).toEqual({ authRoute: '/auth' })
  })
})

describe('resolveBackendSource', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'nuxt-backend-devtools-source-'))
  const functionsDir = 'backend'
  const base = join(rootDir, functionsDir)

  mkdirSync(join(base, 'lib'), { recursive: true })
  writeFileSync(join(base, 'billing.ts'), '')
  writeFileSync(join(base, 'legacy.js'), '')
  writeFileSync(join(base, 'lib', 'shared.ts'), '')

  afterAll(() => rmSync(rootDir, { recursive: true, force: true }))

  it('maps a file name (extension optional) into the functions dir', () => {
    expect(resolveBackendSource(rootDir, functionsDir, 'billing.ts'))
      .toEqual({ filepath: join(base, 'billing.ts') })
    expect(resolveBackendSource(rootDir, functionsDir, 'billing'))
      .toEqual({ filepath: join(base, 'billing.ts') })
    expect(resolveBackendSource(rootDir, functionsDir, 'legacy'))
      .toEqual({ filepath: join(base, 'legacy.js') })
    expect(resolveBackendSource(rootDir, functionsDir, 'lib/shared'))
      .toEqual({ filepath: join(base, 'lib', 'shared.ts') })
  })

  it('returns {} for unknown files', () => {
    expect(resolveBackendSource(rootDir, functionsDir, 'missing.ts')).toEqual({})
  })

  it('rejects traversal and degenerate paths — the name crosses the RPC', () => {
    expect(resolveBackendSource(rootDir, functionsDir, '../package.json')).toEqual({})
    expect(resolveBackendSource(rootDir, functionsDir, 'lib/../../secrets')).toEqual({})
    expect(resolveBackendSource(rootDir, functionsDir, './billing.ts')).toEqual({})
    expect(resolveBackendSource(rootDir, functionsDir, '')).toEqual({})
  })
})
