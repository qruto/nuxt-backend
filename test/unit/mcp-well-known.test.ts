import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

// The runtime config reader is the handlers' only Nitro dependency; it is
// answered from the fake event so the discovery front is testable as a plain
// function.
vi.mock('nitropack/runtime', () => ({
  useRuntimeConfig: (event?: { runtimeConfig?: unknown }) => event?.runtimeConfig ?? {},
}))

const RUNTIME_CONFIG = {
  backendMcp: {
    route: '/mcp',
    authBase: '/api/auth',
    exchangePath: '/mcp/exchange',
    scopes: ['openid', 'profile'],
    tools: {},
    functions: {},
  },
  public: { convex: { siteUrl: 'https://deployment.test.site' } },
}

function fakeEvent(input: { path: string, method?: string, runtimeConfig?: unknown }): H3Event {
  return {
    path: input.path,
    method: input.method ?? 'GET',
    context: {},
    node: { req: { headers: { host: 'app.test' } } },
    runtimeConfig: input.runtimeConfig ?? RUNTIME_CONFIG,
  } as unknown as H3Event
}

const PATH = '/.well-known/oauth-protected-resource'

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

describe('wellKnownRequest', () => {
  it('is inert without runtime config (mcp disabled), preflights included', async () => {
    const { wellKnownRequest } = await import('../../src/runtime/server/mcp/well-known')
    expect(wellKnownRequest(fakeEvent({ path: PATH, runtimeConfig: {} }), PATH)).toBeUndefined()
    expect(wellKnownRequest(fakeEvent({ path: PATH, method: 'OPTIONS', runtimeConfig: {} }), PATH)).toBeUndefined()
  })

  it('lets every other path through — the middleware must not swallow the app', async () => {
    const { wellKnownRequest } = await import('../../src/runtime/server/mcp/well-known')
    for (const path of [
      '/',
      '/mcp',
      '/.well-known/openid-configuration',
      // A longer name sharing the prefix is not the path-suffix form.
      `${PATH}-v2`,
      // The auth proxy's own copy is the proxy's to answer.
      `/api/auth${PATH}`,
    ]) {
      expect(wellKnownRequest(fakeEvent({ path }), PATH), path).toBeUndefined()
      expect(wellKnownRequest(fakeEvent({ path, method: 'OPTIONS' }), PATH), path).toBeUndefined()
    }
  })

  it('answers its own document in the root and path-suffix forms, query string or not', async () => {
    const { wellKnownRequest } = await import('../../src/runtime/server/mcp/well-known')
    for (const path of [PATH, `${PATH}/mcp`, `${PATH}?v=1`, `${PATH}/mcp?v=1`]) {
      expect(wellKnownRequest(fakeEvent({ path }), PATH), path).toBe(RUNTIME_CONFIG.backendMcp)
    }
  })

  it('answers a CORS preflight with 204 and the shared headers', async () => {
    const { CORS_HEADERS, wellKnownRequest } = await import('../../src/runtime/server/mcp/well-known')
    const response = wellKnownRequest(fakeEvent({ path: `${PATH}/mcp`, method: 'OPTIONS' }), PATH)

    expect(response).toBeInstanceOf(Response)
    const preflight = response as Response
    expect(preflight.status).toBe(204)
    expect(await preflight.text()).toBe('')
    expect(CORS_HEADERS['Access-Control-Allow-Origin']).toBe('*')
    expect(CORS_HEADERS['Access-Control-Allow-Methods']).toContain('OPTIONS')
    expect(CORS_HEADERS['Access-Control-Allow-Headers']).toContain('mcp-protocol-version')
    for (const [name, value] of Object.entries(CORS_HEADERS)) {
      expect(preflight.headers.get(name), name).toBe(value)
    }
  })
})

describe('discovery handlers', () => {
  const handlers = [
    { file: 'protected-resource', path: '/.well-known/oauth-protected-resource' },
    { file: 'authorization-server', path: '/.well-known/oauth-authorization-server' },
  ]

  it('answer the preflight without rendering, and let other requests through', async () => {
    // Nothing upstream may be touched on a preflight or a miss.
    const fetchMock = vi.fn(async () => Response.json({}))
    vi.stubGlobal('fetch', fetchMock)

    for (const { file, path } of handlers) {
      const handler = (await import(`../../src/runtime/server/mcp/${file}.ts`)).default as (event: H3Event) => Promise<Response | undefined> | Response | undefined

      const preflight = await handler(fakeEvent({ path, method: 'OPTIONS' })) as Response
      expect(preflight.status, file).toBe(204)
      expect(preflight.headers.get('Access-Control-Allow-Origin'), file).toBe('*')

      expect(await handler(fakeEvent({ path: '/other' })), file).toBeUndefined()
      expect(await handler(fakeEvent({ path, runtimeConfig: {} })), file).toBeUndefined()
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
