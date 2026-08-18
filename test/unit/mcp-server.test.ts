import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { REQUIRED_FUNCTION_EXPORTS } from '../../src/contract'

// The Nitro-only imports these runtime modules make (async request context,
// the toolkit's definition helper, the base module's fetchers) are mocked so
// the gate/tool logic is testable as plain functions.
const useEventMock = vi.hoisted(() => vi.fn())
vi.mock('nitropack/runtime', () => ({
  useEvent: useEventMock,
  useRuntimeConfig: (event?: { context?: { runtimeConfig?: unknown } }) =>
    (event as { runtimeConfig?: unknown } | undefined)?.runtimeConfig
    ?? (globalThis as { __testRuntimeConfig?: unknown }).__testRuntimeConfig
    ?? {},
}))
vi.mock('@nuxtjs/mcp-toolkit/server', () => ({
  defineMcpTool: (definition: unknown) => definition,
}))
vi.mock('nuxt-convex-module/server', () => ({
  fetchQuery: vi.fn(async (): Promise<unknown> => null),
  fetchMutation: vi.fn(async (): Promise<unknown> => null),
  fetchAction: vi.fn(async (): Promise<unknown> => null),
}))

const RUNTIME_CONFIG = {
  backendMcp: {
    route: '/mcp',
    authBase: '/api/auth',
    exchangePath: '/mcp/exchange',
    scopes: ['openid', 'profile', 'email', 'billing:read'],
    tools: {},
    functions: {},
  },
  public: { convex: { siteUrl: 'https://deployment.test.site' } },
}

function fakeEvent(input: {
  path: string
  method?: string
  headers?: Record<string, string>
  context?: Record<string, unknown>
  runtimeConfig?: unknown
}): H3Event {
  return {
    path: input.path,
    method: input.method ?? 'POST',
    context: input.context ?? {},
    node: { req: { headers: { host: 'app.test', ...input.headers } } },
    runtimeConfig: input.runtimeConfig ?? RUNTIME_CONFIG,
  } as unknown as H3Event
}

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
  useEventMock.mockReset()
})

const sessionEvent = (scopes: string[]) => fakeEvent({
  path: '/mcp',
  context: { backendMcp: { userId: 'u', clientId: 'c', scopes, convexToken: 't' } },
})

describe('exchange cache', () => {
  it('expires entries with the minted JWT and enforces the LRU cap', async () => {
    const { createExchangeCache } = await import('../../src/runtime/server/mcp/cache')
    let now = 0
    const cache = createExchangeCache<string>({ capacity: 2, now: () => now })

    cache.set('a', 'session-a', 1000)
    expect(cache.get('a')).toBe('session-a')
    now = 999
    expect(cache.get('a')).toBe('session-a')
    now = 1000
    expect(cache.get('a')).toBeNull()

    now = 0
    cache.set('a', 'session-a', 1000)
    cache.set('b', 'session-b', 1000)
    // Touch `a` so `b` is the least recently used when `c` overflows the cap.
    cache.get('a')
    cache.set('c', 'session-c', 1000)
    expect(cache.size).toBe(2)
    expect(cache.get('b')).toBeNull()
    expect(cache.get('a')).toBe('session-a')
    expect(cache.get('c')).toBe('session-c')
  })

  it('never stores non-positive TTLs', async () => {
    const { createExchangeCache } = await import('../../src/runtime/server/mcp/cache')
    const cache = createExchangeCache<string>({ now: () => 0 })
    cache.set('a', 'session-a', 0)
    expect(cache.get('a')).toBeNull()
  })
})

describe('mcp auth gate', () => {
  it('answers 401 with the RFC 9728 resource_metadata challenge', async () => {
    const gate = (await import('../../src/runtime/server/mcp/gate')).default
    const response = await gate(fakeEvent({ path: '/mcp' })) as Response

    expect(response.status).toBe(401)
    expect(response.headers.get('WWW-Authenticate')).toBe(
      'Bearer resource_metadata="http://app.test/.well-known/oauth-protected-resource"',
    )
    expect(response.headers.get('Access-Control-Expose-Headers')).toBe('WWW-Authenticate')
    const body = await response.json() as { jsonrpc: string, error: { code: number } }
    expect(body.jsonrpc).toBe('2.0')
    expect(body.error.code).toBe(-32000)
  })

  it('exchanges a valid bearer once and attaches the session to the event', async () => {
    const fetchMock = vi.fn(async () => Response.json({
      token: 'convex-jwt',
      expiresIn: 300,
      session: { userId: 'user-1', clientId: 'client-1', scopes: ['billing:read'] },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const gate = (await import('../../src/runtime/server/mcp/gate')).default

    const event = fakeEvent({ path: '/mcp', headers: { authorization: 'Bearer opaque' } })
    expect(await gate(event)).toBeUndefined()
    expect(event.context.backendMcp).toEqual({
      userId: 'user-1',
      clientId: 'client-1',
      scopes: ['billing:read'],
      convexToken: 'convex-jwt',
    })
    expect(fetchMock).toHaveBeenCalledWith('https://deployment.test.site/mcp/exchange', {
      method: 'POST',
      headers: { Authorization: 'Bearer opaque' },
    })

    // Second request with the same bearer resolves from the cache.
    const again = fakeEvent({ path: '/mcp', headers: { authorization: 'Bearer opaque' } })
    await gate(again)
    expect(again.context.backendMcp).toBeDefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('answers 401 when the deployment rejects the bearer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })))
    const gate = (await import('../../src/runtime/server/mcp/gate')).default
    const response = await gate(fakeEvent({ path: '/mcp', headers: { authorization: 'Bearer revoked' } })) as Response
    expect(response.status).toBe(401)
  })

  it('never gates sibling routes, the toolkit conveniences, or browser visits', async () => {
    const gate = (await import('../../src/runtime/server/mcp/gate')).default
    for (const event of [
      fakeEvent({ path: '/mcp-status' }),
      fakeEvent({ path: '/mcp/deeplink', method: 'GET' }),
      fakeEvent({ path: '/mcp/badge.svg', method: 'GET' }),
      fakeEvent({ path: '/mcp', method: 'OPTIONS' }),
      fakeEvent({ path: '/mcp', method: 'GET', headers: { accept: 'text/html,application/xhtml+xml' } }),
    ]) {
      expect(await gate(event), event.path).toBeUndefined()
      expect(event.context.backendMcp).toBeUndefined()
    }
  })

  it('is inert without runtime config (mcp disabled)', async () => {
    const gate = (await import('../../src/runtime/server/mcp/gate')).default
    expect(await gate(fakeEvent({ path: '/mcp', runtimeConfig: {} }))).toBeUndefined()
  })
})

describe('discovery documents', () => {
  it('serves RFC 9728 protected-resource metadata pointing at the auth proxy', async () => {
    const handler = (await import('../../src/runtime/server/mcp/protected-resource')).default
    const response = await handler(fakeEvent({ path: '/.well-known/oauth-protected-resource', method: 'GET' })) as Response

    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(await response.json()).toEqual({
      resource: 'http://app.test',
      authorization_servers: ['http://app.test/api/auth'],
      jwks_uri: 'http://app.test/api/auth/mcp/jwks',
      scopes_supported: ['openid', 'profile', 'email', 'billing:read'],
      bearer_methods_supported: ['header'],
      resource_signing_alg_values_supported: ['RS256'],
    })
  })

  it('serves the path-suffix form too', async () => {
    const handler = (await import('../../src/runtime/server/mcp/protected-resource')).default
    const response = await handler(fakeEvent({ path: '/.well-known/oauth-protected-resource/mcp', method: 'GET' })) as Response
    expect(response.status).toBe(200)
  })

  it('proxies and caches the authorization-server metadata', async () => {
    const upstream = { issuer: 'http://app.test', authorization_endpoint: 'http://app.test/api/auth/mcp/authorize' }
    const fetchMock = vi.fn(async () => Response.json(upstream))
    vi.stubGlobal('fetch', fetchMock)
    const handler = (await import('../../src/runtime/server/mcp/authorization-server')).default

    const first = await handler(fakeEvent({ path: '/.well-known/oauth-authorization-server', method: 'GET' })) as Response
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual(upstream)
    expect(fetchMock).toHaveBeenCalledWith('https://deployment.test.site/api/auth/.well-known/oauth-authorization-server')

    const second = await handler(fakeEvent({ path: '/.well-known/oauth-authorization-server', method: 'GET' })) as Response
    expect(await second.json()).toEqual(upstream)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('defineBackendMcpTool', () => {
  const makeTool = async () => {
    const { defineBackendMcpTool } = await import('../../src/runtime/server/mcp/index')
    const handler = vi.fn(async () => ({ ok: true }))
    const tool = defineBackendMcpTool({
      name: 'test-tool',
      description: 'test',
      scope: 'billing:read',
      handler,
    })
    return { tool, handler }
  }

  it('hides the tool from unauthenticated and unscoped requests', async () => {
    const { tool } = await makeTool()
    expect(await tool.enabled!(fakeEvent({ path: '/mcp' }))).toBe(false)
    expect(await tool.enabled!(sessionEvent(['profile']))).toBe(false)
    expect(await tool.enabled!(sessionEvent(['billing:read']))).toBe(true)
  })

  it('re-checks the scope when the handler runs', async () => {
    const { tool, handler } = await makeTool()

    useEventMock.mockReturnValue(sessionEvent(['profile']))
    await expect(
      (tool.handler as (args: unknown, extra: unknown) => Promise<unknown>)({}, {}),
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(handler).not.toHaveBeenCalled()

    useEventMock.mockReturnValue(sessionEvent(['billing:read']))
    await expect(
      (tool.handler as (args: unknown, extra: unknown) => Promise<unknown>)({}, {}),
    ).resolves.toEqual({ ok: true })
  })
})

describe('built-in tool wiring', () => {
  it('calls only functions the scaffold contract exports', async () => {
    const { BACKEND_MCP_FUNCTION_DEFAULTS } = await import('../../src/runtime/server/mcp/builtin')
    for (const ref of Object.values(BACKEND_MCP_FUNCTION_DEFAULTS)) {
      const [module, name] = ref.split(':') as [keyof typeof REQUIRED_FUNCTION_EXPORTS, string]
      expect(REQUIRED_FUNCTION_EXPORTS[module], ref).toContain(name)
    }
  })

  it('runs each read tool against its scaffold-named function as the agent user', async () => {
    const { getFunctionName } = await import('convex/server')
    const { fetchQuery } = await import('nuxt-convex-module/server')
    const fetchQueryMock = vi.mocked(fetchQuery)
    const scopes = ['profile', 'profile:write', 'billing:read', 'billing:checkout', 'workspace:read']
    useEventMock.mockReturnValue(sessionEvent(scopes))

    const expectations: Array<{ file: string, ref: string, args?: Record<string, unknown> }> = [
      { file: 'profile-get', ref: 'auth:getAuthUser' },
      { file: 'billing-plans', ref: 'billing:getConfiguredProducts' },
      { file: 'billing-subscription', ref: 'billing:getCurrentSubscription' },
      { file: 'credits-balance', ref: 'billing:getCredits' },
      { file: 'workspace-list', ref: 'auth:listWorkspaces' },
      { file: 'workspace-members', ref: 'auth:listWorkspaceMembers', args: { organizationId: 'org-2' } },
    ]
    for (const { file, ref, args } of expectations) {
      fetchQueryMock.mockClear()
      const definition = (await import(`../../src/runtime/server/mcp/tools/${file}.ts`)).default as {
        handler: (toolArgs: Record<string, unknown>, extra: unknown) => Promise<unknown>
      }
      await definition.handler(args ?? {}, {})
      const [calledRef, calledArgs, options] = fetchQueryMock.mock.calls[0]! as unknown as [unknown, unknown, { token?: string }]
      expect(getFunctionName(calledRef as never), file).toBe(ref)
      if (args) expect(calledArgs).toEqual(args)
      // Every call rides the agent's short-lived user JWT.
      expect(options.token).toBe('t')
    }
  })

  it('builds checkout/portal links from the request origin with app-relative paths only', async () => {
    const { fetchAction } = await import('nuxt-convex-module/server')
    const fetchActionMock = vi.mocked(fetchAction)
    fetchActionMock.mockResolvedValue({ url: 'https://pay.test/session' })
    useEventMock.mockReturnValue(sessionEvent(['billing:checkout']))

    const checkout = (await import('../../src/runtime/server/mcp/tools/billing-checkout-link.ts')).default as unknown as {
      inputSchema: Record<string, { safeParse: (value: unknown) => { success: boolean } }>
      handler: (args: Record<string, unknown>, extra: unknown) => Promise<{ url: string }>
    }
    const result = await checkout.handler({ productIds: ['prod-1'], successPath: '/settings' }, {})
    expect(result.url).toBe('https://pay.test/session')
    expect(fetchActionMock.mock.calls[0]![1]).toEqual({
      productIds: ['prod-1'],
      origin: 'http://app.test',
      successUrl: 'http://app.test/settings',
    })
    // Absolute URLs are rejected at the schema level — a prompt-injected
    // agent must not bounce the paying user to a foreign origin.
    expect(checkout.inputSchema.successPath!.safeParse('https://evil.test/pay').success).toBe(false)
    expect(checkout.inputSchema.successPath!.safeParse('/pricing').success).toBe(true)

    const portal = (await import('../../src/runtime/server/mcp/tools/billing-portal-link.ts')).default as {
      handler: (args: Record<string, unknown>, extra: unknown) => Promise<{ url: string }>
    }
    fetchActionMock.mockClear()
    await portal.handler({}, {})
    expect(fetchActionMock.mock.calls[0]![1]).toEqual({ returnUrl: 'http://app.test/' })
  })

  it('updates the profile name through the name-only mutation', async () => {
    const { fetchMutation } = await import('nuxt-convex-module/server')
    const { getFunctionName } = await import('convex/server')
    const fetchMutationMock = vi.mocked(fetchMutation)
    useEventMock.mockReturnValue(sessionEvent(['profile:write']))

    const definition = (await import('../../src/runtime/server/mcp/tools/profile-update.ts')).default as {
      handler: (args: Record<string, unknown>, extra: unknown) => Promise<unknown>
    }
    await expect(definition.handler({ name: 'Ada' }, {})).resolves.toEqual({ ok: true, name: 'Ada' })
    const [ref, args] = fetchMutationMock.mock.calls[0]! as unknown as [unknown, unknown]
    expect(getFunctionName(ref as never)).toBe('auth:updateProfile')
    expect(args).toEqual({ name: 'Ada' })
  })

  it('every built-in tool file guards on its scope and config toggle', async () => {
    const tools = ['profile-get', 'profile-update', 'billing-plans', 'billing-subscription', 'credits-balance', 'billing-checkout-link', 'billing-portal-link', 'workspace-list', 'workspace-members']
    for (const name of tools) {
      const definition = (await import(`../../src/runtime/server/mcp/tools/${name}.ts`)).default as {
        name: string
        enabled?: (event: H3Event) => boolean | Promise<boolean>
      }
      expect(definition.name, name).toBe(name)
      expect(definition.enabled, `${name} enabled guard`).toBeTypeOf('function')
      // The config toggle hides a disabled built-in even for a fully scoped
      // session.
      const disabled = fakeEvent({
        path: '/mcp',
        context: { backendMcp: { userId: 'u', clientId: 'c', scopes: ['profile', 'profile:write', 'billing:read', 'billing:checkout', 'workspace:read'], convexToken: 't' } },
        runtimeConfig: {
          ...RUNTIME_CONFIG,
          backendMcp: { ...RUNTIME_CONFIG.backendMcp, tools: { [name]: false } },
        },
      })
      expect(await definition.enabled!(disabled), `${name} disable toggle`).toBe(false)
    }
  })
})
