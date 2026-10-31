import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { createApp, eventHandler, toWebHandler } from 'h3'
import { makeFunctionReference } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { backendError } from '../../src/convex/errors'
import { appMonitoringDsn, type DeploymentUsageLimit, monitoringDsnFinding, monitoringFindings, usageAlertsFinding } from '../../src/monitoring'
import { monitoringDependency, monitoringWiring, resolveMonitoring } from '../../src/nuxt/monitoring'
import { localEntry, tagBackendEvent } from '../../src/runtime/monitoring/report'

// The monitoring capability in the Nuxt app: the SDK wired only once it is
// installed and a DSN is set (and never imported otherwise), the health
// route over the backend's own, the server's capture of failed backend
// calls, the dev server's local error log, and doctor's findings.

const runtime = vi.hoisted(() => ({ config: {} as Record<string, unknown>, token: undefined as string | undefined, event: undefined as unknown }))
vi.mock('nitropack/runtime', () => ({
  useRuntimeConfig: () => runtime.config,
  useEvent: () => runtime.event,
  defineNitroPlugin: (plugin: unknown) => plugin,
}))
const auth = vi.hoisted(() => ({ fetchAuthQuery: vi.fn(), fetchAuthMutation: vi.fn(), fetchAuthAction: vi.fn(), preloadAuthQuery: vi.fn() }))
vi.mock('nuxt-convex-module/better-auth/server', () => ({
  convexAuth: () => ({ getToken: async () => runtime.token, isAuthenticated: async () => Boolean(runtime.token), ...auth }),
}))
const fetchers = vi.hoisted(() => ({ fetchQuery: vi.fn(), fetchMutation: vi.fn(), fetchAction: vi.fn() }))
vi.mock('nuxt-convex-module/server', () => fetchers)

const root = process.cwd()
const resolver = { resolve: (path: string) => join(root, 'src', path) } as never

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  runtime.config = { public: { convex: { siteUrl: 'https://deployment.test.site' }, backend: { monitoring: { dsn: '' } } }, backendHealth: { deployment: 'production' } }
  runtime.token = undefined
  for (const name of ['MONITORING_DSN', 'NEXT_PUBLIC_SENTRY_DSN']) vi.stubEnv(name, '')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('wiring the SDK', () => {
  it('reads the app\'s own DSN, else the one Sentry\'s Vercel integration sets, as it is', () => {
    expect(appMonitoringDsn({ MONITORING_DSN: ' https://a@o.test/1 ', NEXT_PUBLIC_SENTRY_DSN: 'https://b@o.test/2' })).toBe('https://a@o.test/1')
    expect(appMonitoringDsn({ NEXT_PUBLIC_SENTRY_DSN: 'https://b@o.test/2' })).toBe('https://b@o.test/2')
    expect(appMonitoringDsn({ MONITORING_DSN: '  ' })).toBeUndefined()
    // SENTRY_DSN is the SDK's own name for a server it configures itself, not the integration's: it is not read.
    expect(appMonitoringDsn({ SENTRY_DSN: 'https://b@o.test/2' })).toBeUndefined()
  })

  it('wires it only once it is installed and a DSN is set', () => {
    const dsn = { NEXT_PUBLIC_SENTRY_DSN: 'https://b@o.test/2' }
    expect(resolveMonitoring('/app', dsn, () => true)).toEqual({ dsn: 'https://b@o.test/2', sdk: true, wired: true, env: dsn })
    expect(resolveMonitoring('/app', dsn, () => false)).toEqual({ dsn: 'https://b@o.test/2', sdk: false, wired: false, env: dsn })
    expect(resolveMonitoring('/app', {}, () => true)).toEqual({ sdk: true, wired: false, env: {} })
  })

  it('decides once per Nuxt instance, so the SDK\'s module and the capture plugins never disagree', () => {
    const nuxt = { options: { rootDir: '/app' } } as never
    vi.stubEnv('MONITORING_DSN', 'https://a@o.test/1')
    const first = monitoringWiring(nuxt)
    vi.stubEnv('MONITORING_DSN', '')
    expect(monitoringWiring(nuxt)).toBe(first)
    expect(monitoringWiring({ options: { rootDir: '/app' } } as never).dsn).toBeUndefined()
  })

  it('adds the SDK\'s module, pointed at the package\'s own config files, only when wired', () => {
    expect(monitoringDependency({ sdk: false, wired: false, env: {} }, resolver)).toEqual({})
    expect(monitoringDependency({ dsn: 'https://b@o.test/2', sdk: false, wired: false, env: {} }, resolver)).toEqual({})
    const dependency = monitoringDependency({ dsn: 'https://b@o.test/2', sdk: true, wired: true, env: {} }, resolver)
    expect(Object.keys(dependency)).toEqual(['@sentry/nuxt/module'])
    const configDir = dependency['@sentry/nuxt/module']!.defaults.configDir
    // The names the SDK's module looks for, beside each other in one directory.
    expect(readdirSync(configDir).filter(file => file.startsWith('sentry.')).sort()).toEqual(['sentry.client.config.ts', 'sentry.server.config.ts'])
  })

  it('never imports the SDK outside the files only a wired app loads', () => {
    const sdkDir = join(root, 'src/runtime/monitoring/sdk')
    const walk = (dir: string): string[] => readdirSync(dir).flatMap(entry => statSync(join(dir, entry)).isDirectory() ? walk(join(dir, entry)) : [join(dir, entry)])
    const importers = [...walk(join(root, 'src')), join(root, 'src/module.ts')]
      .filter(file => /\.(?:ts|vue)$/.test(file) && /from ['"]@sentry\//.test(readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')))
      .map(file => relative(root, file))
    expect(importers.length).toBeGreaterThan(0)
    for (const file of importers) expect(join(root, file).startsWith(sdkDir), file).toBe(true)
    // The module names them by path, and only when wired.
    const wiring = readFileSync(join(root, 'src/nuxt/monitoring.ts'), 'utf8')
    const wired = wiring.indexOf('if (wiring.wired) {')
    expect(wiring).toContain('const SDK_DIR = \'./runtime/monitoring/sdk\'')
    expect(wiring.slice(wired, wiring.indexOf('if (nuxt.options.dev'))).toContain('`${SDK_DIR}/capture.client`')
    expect(wiring.slice(0, wired)).not.toContain('/capture.')
  })
})

describe('what a report says about a failed call', () => {
  const failure = Object.assign(new Error('[CONVEX M(billing:checkout)] [Request ID: 1] Server Error'), { name: 'ConvexError', data: { code: 'unavailable', service: 'billing', reason: 'provider_refused' } })

  it('tags an event about a failed backend call, keeping the tags it carries', () => {
    expect(tagBackendEvent({ tags: { release: 'r' } }, failure, 'browser')?.tags).toEqual({
      'release': 'r',
      'backend.function': 'billing:checkout',
      'backend.code': 'unavailable',
      'backend.reason': 'billing/provider_refused',
      'backend.source': 'browser',
    })
    expect(tagBackendEvent({ tags: { 'backend.code': 'own' } }, failure, 'server')?.tags?.['backend.code']).toBe('own')
    // Anything else passes through untouched.
    const event = { tags: { a: 'b' } }
    expect(tagBackendEvent(event, new Error('a page bug'), 'browser')).toEqual({ tags: { a: 'b' } })
  })

  it('drops an event about a refusal, whoever captured it, and keeps an unavailable service', () => {
    // A page that left a rejected call unhandled: the SDK's global handler captured it.
    const refusal = Object.assign(new Error('[CONVEX M(billing:checkout)] Unauthenticated'), { name: 'ConvexError', data: { code: 'unauthenticated' } })
    expect(tagBackendEvent({ tags: {} }, refusal, 'browser')).toBeNull()
    expect(tagBackendEvent({ tags: {} }, backendError('insufficient_credits', { need: 2, balance: 1 }), 'server')).toBeNull()
    expect(tagBackendEvent({ tags: {} }, failure, 'browser')).not.toBeNull()
  })

  it('keeps a local log entry of it', () => {
    expect(localEntry(failure, 'browser', 5)).toEqual({ at: 5, source: 'browser', function: 'billing:checkout', code: 'unavailable', reason: 'billing/provider_refused', message: failure.message })
    expect(localEntry(new Error('boom'), 'server', 6, 'auth:getAuthUser')).toEqual({ at: 6, source: 'server', function: 'auth:getAuthUser', code: 'none', message: 'boom' })
  })
})

describe('the server\'s capture of failed backend calls', () => {
  it('reports a crash or an unavailable service to every reporter, never a refusal', async () => {
    const { addBackendReporter, capturingBackendCall } = await import('../../src/runtime/server/monitoring/capture')
    const reported: Array<[unknown, Record<string, string>]> = []
    const remove = addBackendReporter((error, tags) => reported.push([error, tags]))
    addBackendReporter(() => {
      throw new Error('a reporter that throws')
    })
    const crash = new Error('Server Error')
    await expect(capturingBackendCall('auth:getAuthUser', async () => {
      throw crash
    })).rejects.toBe(crash)
    await expect(capturingBackendCall('billing:getCredits', async () => {
      throw backendError('forbidden', { reason: 'role' })
    })).rejects.toThrow()
    expect(await capturingBackendCall('billing:getCredits', async () => 3)).toBe(3)
    expect(reported).toEqual([[crash, { 'backend.function': 'auth:getAuthUser', 'backend.code': 'none', 'backend.source': 'server' }]])
    remove()
  })

  it('reports what backendAuth(event)\'s calls throw, with the function they ran, and passes the rest through', async () => {
    const { addBackendReporter } = await import('../../src/runtime/server/monitoring/capture')
    const { backendAuth } = await import('../../src/runtime/server/monitoring/backend-calls')
    const reported: Record<string, string>[] = []
    const remove = addBackendReporter((_error, tags) => reported.push(tags))
    auth.fetchAuthMutation.mockRejectedValueOnce(new Error('Server Error'))
    auth.fetchAuthQuery.mockResolvedValueOnce(7)
    runtime.token = 'session-jwt'
    const service = backendAuth({} as never)
    await expect(service.fetchAuthMutation(makeFunctionReference<'mutation'>('billing:checkout'), { plan: 'pro' } as never)).rejects.toThrow('Server Error')
    expect(auth.fetchAuthMutation).toHaveBeenCalledWith(expect.anything(), { plan: 'pro' })
    expect(await service.fetchAuthQuery(makeFunctionReference<'query'>('billing:getCredits'))).toBe(7)
    expect(await service.getToken()).toBe('session-jwt')
    expect(reported).toEqual([{ 'backend.function': 'billing:checkout', 'backend.code': 'none', 'backend.source': 'server' }])
    remove()
  })
})

/** A request to one handler, mounted where the module mounts it. */
async function serve(route: string, handlerModule: string, request: Request): Promise<Response> {
  const handler = (await import(handlerModule)).default
  const app = createApp()
  app.use(route, eventHandler(event => handler(event)))
  return toWebHandler(app)(request)
}

const health = (headers: Record<string, string> = {}) => serve('/api/backend/health', '../../src/runtime/server/monitoring/health', new Request('https://app.test/api/backend/health', { headers }))

describe('/api/backend/health', () => {
  it('passes the backend\'s coarse answer on, with what only the app knows', async () => {
    fetchMock.mockResolvedValue(Response.json({ status: 'degraded', capabilities: { data: 'live', billing: 'missing' } }))
    const response = await health()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ status: 'degraded', capabilities: { data: 'live', billing: 'missing' } })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://deployment.test.site/backend/health?monitoring=0&deployment=production')
    // An anonymous check carries no session.
    expect((init as RequestInit).headers).toEqual({})
  })

  it('says the app reports only when the SDK is wired, never for a DSN in the env alone', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://b@o.test/2')
    fetchMock.mockResolvedValue(Response.json({ status: 'ok', capabilities: { data: 'live' } }))
    await health()
    expect(fetchMock.mock.calls[0]![0]).toContain('monitoring=0')
  })

  it('forwards a signed-in caller\'s session, so an admin gets the detail, and says when the app reports', async () => {
    ;(runtime.config.public as { backend: { monitoring: { dsn: string } } }).backend.monitoring.dsn = 'https://b@o.test/2'
    runtime.token = 'session-jwt'
    const detail = { status: 'ok', capabilities: { data: 'live' }, detail: { data: { reason: 'runs on the production deployment', missingEnv: [], top: null } } }
    fetchMock.mockResolvedValue(Response.json(detail))
    const response = await health({ cookie: 'better-auth.session_token=abc' })
    expect(await response.json()).toEqual(detail)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toContain('monitoring=1')
    expect((init as RequestInit).headers).toEqual({ Authorization: 'Bearer session-jwt' })
  })

  it('answers 503 with the data capability failing when the backend cannot be reached, or answers something else', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const down = await health()
    expect(down.status).toBe(503)
    expect(await down.json()).toEqual({ status: 'failing', capabilities: { data: 'failing' } })
    fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 502 }))
    expect((await health()).status).toBe(503)
    fetchMock.mockResolvedValueOnce(Response.json({ status: 'ok', capabilities: { data: 'whatever' } }))
    expect(await (await health()).json()).toEqual({ status: 'failing', capabilities: { data: 'failing' } })
    // A failing backend's own 503 is passed on as it is.
    fetchMock.mockResolvedValueOnce(Response.json({ status: 'failing', capabilities: { email: 'failing' } }, { status: 503 }))
    const failing = await health()
    expect(failing.status).toBe(503)
    expect(await failing.json()).toEqual({ status: 'failing', capabilities: { email: 'failing' } })
    runtime.config = {}
    expect(await (await health()).json()).toEqual({ status: 'failing', capabilities: { data: 'failing' } })
  })
})

describe('the dev server\'s local error log', () => {
  const log = (method: string, body?: unknown, headers: Record<string, string> = {}) => serve('/api/backend/_monitoring', '../../src/runtime/server/monitoring/local-log-route', new Request('https://app.test/api/backend/_monitoring', {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...body === undefined ? {} : { body: JSON.stringify(body) },
  }))

  it('keeps what the browser posts, lists it, and forgets it on request', async () => {
    const posted = await log('POST', { message: 'Server Error', function: 'billing:checkout', code: 'none', extra: 'dropped' }, { 'sec-fetch-site': 'same-origin' })
    expect(posted.status).toBe(200)
    expect(await posted.json()).toMatchObject({ id: expect.any(Number), source: 'browser', function: 'billing:checkout', code: 'none', message: 'Server Error' })
    const listed = await (await log('GET')).json() as { entries: Array<Record<string, unknown>> }
    expect(listed.entries.at(-1)).not.toHaveProperty('extra')
    expect(await (await log('DELETE')).json()).toEqual({ entries: [] })
    expect(await (await log('GET')).json()).toEqual({ entries: [] })
  })

  it('refuses another site, an entry without a message, and other methods', async () => {
    expect((await log('GET', undefined, { 'sec-fetch-site': 'cross-site' })).status).toBe(403)
    expect((await log('POST', { message: 'x' }, { 'sec-fetch-site': 'same-site' })).status).toBe(403)
    expect((await log('POST', { function: 'a:b' })).status).toBe(400)
    expect((await log('PUT', {})).status).toBe(405)
  })

  it('keeps the server\'s failed calls and crashes once each, and drops a 4xx', async () => {
    const { default: plugin, localErrors, clearLocalErrors } = await import('../../src/runtime/server/monitoring/local-log')
    const { captureBackendError } = await import('../../src/runtime/server/monitoring/capture')
    const hooks: Record<string, (error: unknown) => void> = {}
    ;(plugin as unknown as (app: unknown) => void)({ hooks: { hook: (name: string, run: (error: unknown) => void) => (hooks[name] = run) } })
    clearLocalErrors()
    const crash = new Error('Server Error')
    captureBackendError(crash, { function: 'auth:getAuthUser' })
    // The same failure rethrown into the error hook, wrapped by h3: still one entry.
    hooks.error!(Object.assign(new Error('wrapped'), { cause: crash, statusCode: 500 }))
    hooks.error!(Object.assign(new Error('Not found'), { statusCode: 404 }))
    hooks.error!(new Error('render crash'))
    expect(localErrors().map(entry => [entry.source, entry.function ?? null, entry.message])).toEqual([
      ['server', 'auth:getAuthUser', 'Server Error'],
      ['server', null, 'render crash'],
    ])
  })
})

describe('doctor\'s monitoring findings', () => {
  let rootDir: string
  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'nuxt-backend-monitoring-'))
    writeFileSync(join(rootDir, 'package.json'), '{ "name": "app" }\n')
  })
  afterEach(() => rmSync(rootDir, { recursive: true, force: true }))

  /** Install a stand-in SDK in the app, as `npm install` would. */
  const installSdk = () => {
    mkdirSync(join(rootDir, 'node_modules/@sentry/nuxt'), { recursive: true })
    writeFileSync(join(rootDir, 'node_modules/@sentry/nuxt/package.json'), '{ "name": "@sentry/nuxt", "version": "11.8.0", "exports": { "./package.json": "./package.json" } }\n')
  }
  const byId = (findings: ReturnType<typeof monitoringFindings>) => Object.fromEntries(findings.map(item => [item.id, item.status]))

  it('passes a dev deployment without a DSN, and warns production without one', () => {
    expect(monitoringDsnFinding(false, { prod: false }).status).toBe('pass')
    expect(monitoringDsnFinding(false, { prod: true })).toMatchObject({ status: 'warn', fixHint: expect.stringContaining('env push --prod') })
    expect(monitoringDsnFinding(true, { prod: true }).status).toBe('pass')
  })

  it('warns a DSN with no SDK to report through, and passes one with it', () => {
    expect(byId(monitoringFindings(rootDir, { env: {}, deployed: [], prod: false }))).toEqual({ 'monitoring-app': 'pass' })
    expect(byId(monitoringFindings(rootDir, { env: { MONITORING_DSN: 'https://a@o.test/1' }, deployed: [], prod: false }))).toEqual({ 'monitoring-app': 'warn' })
    installSdk()
    expect(byId(monitoringFindings(rootDir, { env: { MONITORING_DSN: 'https://a@o.test/1' }, deployed: [], prod: false }))).toEqual({ 'monitoring-app': 'pass' })
  })

  it('warns production when no DSN is visible to the app, unless its env is on Vercel and cannot be read from here', () => {
    expect(monitoringFindings(rootDir, { env: {}, deployed: [], prod: true }).find(item => item.id === 'monitoring-app')).toMatchObject({ status: 'warn', message: expect.stringContaining('report nothing') })
    mkdirSync(join(rootDir, '.vercel'))
    writeFileSync(join(rootDir, '.vercel/project.json'), '{}')
    expect(byId(monitoringFindings(rootDir, { env: {}, deployed: [], prod: true }))['monitoring-app']).toBe('pass')
    // In a Vercel build its env is here: none there is none at all.
    expect(byId(monitoringFindings(rootDir, { env: { VERCEL: '1' }, deployed: [], prod: true }))['monitoring-app']).toBe('warn')
  })

  it('warns a Vercel app whose build would upload no source maps', () => {
    installSdk()
    const env = { NEXT_PUBLIC_SENTRY_DSN: 'https://a@o.test/1' }
    expect(byId(monitoringFindings(rootDir, { env, deployed: null, prod: false }))).not.toHaveProperty('monitoring-source-maps')
    mkdirSync(join(rootDir, '.vercel'))
    writeFileSync(join(rootDir, '.vercel/project.json'), '{}')
    const missing = monitoringFindings(rootDir, { env, deployed: null, prod: false }).find(item => item.id === 'monitoring-source-maps')!
    expect(missing).toMatchObject({ status: 'warn', message: expect.stringContaining('SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT are not visible here') })
    expect(byId(monitoringFindings(rootDir, { env: { ...env, SENTRY_AUTH_TOKEN: 't', SENTRY_ORG: 'o', SENTRY_PROJECT: 'p' }, deployed: null, prod: false }))['monitoring-source-maps']).toBe('pass')
    expect(existsSync(join(rootDir, '.vercel/project.json'))).toBe(true)
  })

  it('reminds of the backend\'s own exception reporting once the deployment reports', () => {
    expect(byId(monitoringFindings(rootDir, { env: {}, deployed: ['MONITORING_DSN'], prod: false }))).toHaveProperty('monitoring-backend-exceptions', 'pass')
  })
})

describe('production\'s usage alerts', () => {
  const limit = (fields: Partial<DeploymentUsageLimit>): DeploymentUsageLimit => ({ metric: 'functionCalls', window: 'month', limitType: 'warning', limit: 1_000_000, enabled: true, triggered: false, ...fields })

  it('passes once a warning limit is active, and asks for the gateway\'s dollars when models go through it', () => {
    expect(usageAlertsFinding([limit({})], { convexGateway: false })).toMatchObject({ id: 'monitoring-usage-alerts', status: 'pass' })
    const gateway = usageAlertsFinding([limit({})], { convexGateway: true })
    expect(gateway).toMatchObject({ status: 'warn' })
    expect(gateway.fixHint).toBe('npx convex deployment usage-limits set --prod --metric aiGatewayCostDollars --window month --type warning --limit <dollars>')
    expect(usageAlertsFinding([limit({}), limit({ metric: 'aiGatewayCostDollars', window: 'day' })], { convexGateway: true })).toMatchObject({ status: 'pass' })
  })

  it('warns without one: a disable limit, or one switched off, tells nobody first', () => {
    const finding = usageAlertsFinding([limit({ limitType: 'disable' }), limit({ enabled: false })], { convexGateway: false })
    expect(finding).toMatchObject({ status: 'warn' })
    expect(finding.fixHint).toContain('--metric functionCalls --window month --type warning')
  })

  it('warns while a limit is past, and passes when the limits cannot be read', () => {
    expect(usageAlertsFinding([limit({ triggered: true })], { convexGateway: false }).message).toContain('past a usage limit: functionCalls (warning, per month)')
    expect(usageAlertsFinding(null, { convexGateway: true })).toMatchObject({ status: 'pass' })
  })
})
