import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

// `exchangeBackendMcpToken` reads Nitro's runtime config; the mock answers
// with whatever the fake event carries.
vi.mock('nitropack/runtime', () => ({
  useRuntimeConfig: (event?: { runtimeConfig?: unknown }) => event?.runtimeConfig ?? {},
}))

const RUNTIME_CONFIG = {
  backendMcp: { route: '/mcp', authBase: '/api/auth', exchangePath: '/mcp/exchange', scopes: [], functions: {} },
  public: { convex: { siteUrl: 'https://deployment.test.site' } },
}

const event = (runtimeConfig: unknown = RUNTIME_CONFIG) => ({ runtimeConfig }) as unknown as H3Event

const minted = (expiresIn = 300) => Response.json({
  token: 'convex-jwt',
  expiresIn,
  session: { userId: 'user-1', clientId: 'client-1', scopes: ['profile'] },
})

async function exchange() {
  return (await import('../../src/runtime/server/mcp/session')).exchangeBackendMcpToken
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  // A fresh module per test, so the exchange cache starts empty.
  vi.resetModules()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('exchangeBackendMcpToken', () => {
  it('trades the bearer at the deployment exchange and returns the session', async () => {
    fetchMock.mockResolvedValueOnce(minted())
    const session = await (await exchange())(event(), 'opaque')

    expect(fetchMock).toHaveBeenCalledWith('https://deployment.test.site/mcp/exchange', {
      method: 'POST',
      headers: { Authorization: 'Bearer opaque' },
    })
    expect(session).toEqual({ userId: 'user-1', clientId: 'client-1', scopes: ['profile'], convexToken: 'convex-jwt' })
  })

  it('caches the session until the minted token expires, less the margin', async () => {
    vi.useFakeTimers({ now: 0 })
    const { EXCHANGE_CACHE_MARGIN_MS } = await import('../../src/runtime/server/mcp/cache')
    const exchangeToken = await exchange()
    fetchMock.mockImplementation(async () => minted(300))

    await exchangeToken(event(), 'opaque')
    vi.setSystemTime(300_000 - EXCHANGE_CACHE_MARGIN_MS - 1)
    await exchangeToken(event(), 'opaque')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.setSystemTime(300_000 - EXCHANGE_CACHE_MARGIN_MS)
    await exchangeToken(event(), 'opaque')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns null for a bearer the deployment rejects, and caches nothing', async () => {
    const exchangeToken = await exchange()
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }))

    expect(await exchangeToken(event(), 'revoked')).toBeNull()
    expect(await exchangeToken(event(), 'revoked')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns null for a body without a token or a session', async () => {
    const exchangeToken = await exchange()
    for (const body of [{}, { token: 'jwt' }, { token: 'jwt', session: { userId: 'user-1' } }]) {
      fetchMock.mockResolvedValueOnce(Response.json(body))
      expect(await exchangeToken(event(), 'opaque'), JSON.stringify(body)).toBeNull()
    }
  })

  it('throws 429 when the deployment rate-limits the exchange', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 429 }))
    await expect((await exchange())(event(), 'opaque')).rejects.toMatchObject({ statusCode: 429 })
  })

  it('throws 502 when the deployment fails, never asking the agent to sign in again', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }))
    await expect((await exchange())(event(), 'opaque')).rejects.toMatchObject({ statusCode: 502 })
  })

  it('throws 503 without a site URL to exchange at', async () => {
    await expect((await exchange())(event({ backendMcp: RUNTIME_CONFIG.backendMcp }), 'opaque')).rejects.toMatchObject({ statusCode: 503 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
