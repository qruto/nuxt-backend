import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createAuthClient = vi.fn((options: unknown) => ({
  options,
  convex: { token: vi.fn() },
  useSession: vi.fn(),
}))
const convexClient = vi.fn(() => ({ id: 'convex' }))
const useRuntimeConfig = vi.fn(() => ({
  public: {
    backend: {
      authRoute: '/api/auth',
    },
  },
  backend: {
    siteUrl: 'https://example.convex.site',
  },
}))
const useRequestEvent = vi.fn()

vi.mock('better-auth/vue', () => ({
  createAuthClient,
}))

vi.mock('@convex-dev/better-auth/client/plugins', () => ({
  convexClient,
}))

vi.mock('#imports', () => ({
  useRuntimeConfig,
  useRequestEvent,
}))

describe('runtime auth utilities', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    useRuntimeConfig.mockReturnValue({
      public: {
        backend: {
          authRoute: '/api/auth',
        },
      },
      backend: {
        siteUrl: 'https://example.convex.site',
      },
    })
    useRequestEvent.mockReturnValue({
      headers: {
        get: (name: string) => name === 'cookie'
          ? 'better-auth.session_token=session-123'
          : null,
      },
    })
  })

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window
  })

  it('extracts session tokens from Better Auth cookies', async () => {
    const { extractSessionToken } = await import('../../src/runtime/server/utils/auth')

    expect(extractSessionToken('foo=bar; better-auth.session_token=session-123')).toBe('session-123')
    expect(extractSessionToken('__Secure-better-auth.session_token=session-456')).toBe('session-456')
    expect(extractSessionToken('foo=bar')).toBeNull()
  })

  it('exchanges session cookies for Convex tokens', async () => {
    const { exchangeSessionTokenForConvexToken } = await import('../../src/runtime/server/utils/auth')

    const okResponse = {
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValue({ token: 'convex-token' }),
    } as unknown as Response
    const unauthorizedResponse = {
      status: 401,
      ok: false,
      json: vi.fn(),
    } as unknown as Response
    const errorResponse = {
      status: 500,
      ok: false,
      json: vi.fn(),
    } as unknown as Response

    expect(await exchangeSessionTokenForConvexToken(
      'better-auth.session_token=session-123',
      'https://example.convex.site',
      vi.fn().mockResolvedValue(okResponse),
    )).toBe('convex-token')

    expect(await exchangeSessionTokenForConvexToken(
      'better-auth.session_token=session-123',
      'https://example.convex.site',
      vi.fn().mockResolvedValue(unauthorizedResponse),
    )).toBeNull()

    await expect(exchangeSessionTokenForConvexToken(
      'better-auth.session_token=session-123',
      'https://example.convex.site',
      vi.fn().mockResolvedValue(errorResponse),
    )).rejects.toThrow('Auth token exchange failed with status 500')
  })

  it('configures the Better Auth client around the Nuxt auth route', async () => {
    const {
      getAuthClient,
      resolveAuthClientBaseURL,
    } = await import('../../src/runtime/auth/client')

    expect(resolveAuthClientBaseURL('/api/auth')).toBe('/api/auth')
    expect(resolveAuthClientBaseURL('/api/auth', 'http://localhost:3000')).toBe('http://localhost:3000/api/auth')

    const authClient = getAuthClient()

    expect(authClient).toBe(getAuthClient())
    expect(createAuthClient).toHaveBeenCalledWith({
      baseURL: '/api/auth',
      plugins: [{ id: 'convex' }],
      fetchOptions: {
        credentials: 'include',
      },
    })
  })
})
