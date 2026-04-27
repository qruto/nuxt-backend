import type { FunctionReference } from 'convex/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockFetch,
  mockFetchAction,
  mockFetchMutation,
  mockFetchQuery,
  mockGetRequestHeaders,
  mockGetToken,
  mockPreloadQuery,
  mockToWebRequest,
} = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockFetchAction: vi.fn(),
  mockFetchMutation: vi.fn(),
  mockFetchQuery: vi.fn(),
  mockGetRequestHeaders: vi.fn(),
  mockGetToken: vi.fn(),
  mockPreloadQuery: vi.fn(),
  mockToWebRequest: vi.fn(),
}))

type NamedFunctionReference<Type extends 'query' | 'mutation' | 'action'> = FunctionReference<Type> & {
  _name: string
}

function mockFunctionReference<Type extends 'query' | 'mutation' | 'action'>(
  name: string,
): NamedFunctionReference<Type> {
  return { _name: name } as unknown as NamedFunctionReference<Type>
}

vi.mock('h3', () => ({
  getRequestHeaders: mockGetRequestHeaders,
  toWebRequest: mockToWebRequest,
}))

vi.mock('@convex-dev/better-auth/utils', () => ({
  getToken: mockGetToken,
}))

vi.mock('../../../../src/runtime/nuxt/index', () => ({
  fetchAction: mockFetchAction,
  fetchMutation: mockFetchMutation,
  fetchQuery: mockFetchQuery,
  preloadQuery: mockPreloadQuery,
}))

describe('auth/nuxt/server', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
    mockGetRequestHeaders.mockReturnValue({
      'cookie': 'session=abc',
      'content-length': '123',
      'transfer-encoding': 'chunked',
    })
  })

  it('caches the token per request and forwards it to Convex query helpers', async () => {
    const { backendAuth } = await import('../../../../src/runtime/nuxt/auth/server')
    const queryRef = mockFunctionReference<'query'>('api.tasks.list')
    mockGetToken.mockResolvedValue({ token: 'jwt-1', isFresh: false })
    mockFetchQuery.mockResolvedValue([{ text: 'Buy milk' }])

    const auth = backendAuth({} as never, {
      convexSiteUrl: 'https://example.convex.site',
    })

    await expect(auth.fetchAuthQuery(queryRef, { list: 'default' } as never)).resolves.toEqual([{ text: 'Buy milk' }])
    await expect(auth.fetchAuthQuery(queryRef, { list: 'again' } as never)).resolves.toEqual([{ text: 'Buy milk' }])
    await expect(auth.getToken()).resolves.toBe('jwt-1')
    await expect(auth.isAuthenticated()).resolves.toBe(true)

    expect(mockGetToken).toHaveBeenCalledTimes(1)
    expect(mockFetchQuery).toHaveBeenNthCalledWith(1, queryRef, { list: 'default' }, { token: 'jwt-1' })
    expect(mockFetchQuery).toHaveBeenNthCalledWith(2, queryRef, { list: 'again' }, { token: 'jwt-1' })

    const forwardedHeaders = mockGetToken.mock.calls[0]![1] as Headers
    expect(forwardedHeaders.get('accept-encoding')).toBe('identity')
    expect(forwardedHeaders.has('content-length')).toBe(false)
    expect(forwardedHeaders.has('transfer-encoding')).toBe(false)
  })

  it('refreshes the token once when jwt cache marks the first error as auth-related', async () => {
    const { backendAuth } = await import('../../../../src/runtime/nuxt/auth/server')
    const queryRef = mockFunctionReference<'query'>('api.tasks.list')
    const authError = new Error('expired')

    mockGetToken
      .mockResolvedValueOnce({ token: 'stale-token', isFresh: false })
      .mockResolvedValueOnce({ token: 'fresh-token', isFresh: true })
    mockFetchQuery
      .mockRejectedValueOnce(authError)
      .mockResolvedValueOnce([{ text: 'Fresh result' }])

    const auth = backendAuth({} as never, {
      convexSiteUrl: 'https://example.convex.site',
      jwtCache: {
        enabled: true,
        isAuthError: error => error === authError,
      },
    })

    await expect(auth.fetchAuthQuery(queryRef, {} as never)).resolves.toEqual([{ text: 'Fresh result' }])

    expect(mockGetToken).toHaveBeenCalledTimes(2)
    expect(mockGetToken.mock.calls[1]![2]).toMatchObject({ forceRefresh: true })
    expect(mockFetchQuery).toHaveBeenNthCalledWith(1, queryRef, {}, { token: 'stale-token' })
    expect(mockFetchQuery).toHaveBeenNthCalledWith(2, queryRef, {}, { token: 'fresh-token' })
  })

  it('passes the auth token through preload, mutation, and action helpers', async () => {
    const { backendAuth } = await import('../../../../src/runtime/nuxt/auth/server')
    const queryRef = mockFunctionReference<'query'>('api.tasks.list')
    const mutationRef = mockFunctionReference<'mutation'>('api.tasks.create')
    const actionRef = mockFunctionReference<'action'>('api.tasks.process')
    mockGetToken.mockResolvedValue({ token: 'jwt-1', isFresh: true })
    mockPreloadQuery.mockResolvedValue({ _name: 'api.tasks.list' })
    mockFetchMutation.mockResolvedValue({ _id: 'task-1' })
    mockFetchAction.mockResolvedValue({ ok: true })

    const auth = backendAuth({} as never, {
      convexSiteUrl: 'https://example.convex.site',
    })

    await auth.preloadAuthQuery(queryRef, { page: 1 } as never)
    await auth.fetchAuthMutation(mutationRef, { text: 'Milk' } as never)
    await auth.fetchAuthAction(actionRef, { id: 'task-1' } as never)

    expect(mockPreloadQuery).toHaveBeenCalledWith(queryRef, { page: 1 }, { token: 'jwt-1' })
    expect(mockFetchMutation).toHaveBeenCalledWith(mutationRef, { text: 'Milk' }, { token: 'jwt-1' })
    expect(mockFetchAction).toHaveBeenCalledWith(actionRef, { id: 'task-1' }, { token: 'jwt-1' })
  })

  it('provides a Nuxt auth route handler adapted from the Next.js helper shape', async () => {
    const { backendAuth } = await import('../../../../src/runtime/nuxt/auth/server')

    mockToWebRequest.mockReturnValue(new Request('https://app.example.com/api/auth/session?foo=bar', {
      method: 'POST',
      headers: {
        cookie: 'session=abc',
      },
    }))
    mockFetch.mockResolvedValue(new Response('ok'))

    const response = await backendAuth({} as never, {
      convexSiteUrl: 'https://example.convex.site',
    }).handler()

    expect(response).toBeInstanceOf(Response)
    expect(mockFetch).toHaveBeenCalledTimes(1)

    const proxiedRequest = mockFetch.mock.calls[0]?.[0] as Request
    expect(proxiedRequest.url).toBe('https://example.convex.site/api/auth/session?foo=bar')
    expect(proxiedRequest.headers.get('host')).toBe('example.convex.site')
    expect(proxiedRequest.headers.get('x-forwarded-host')).toBe('app.example.com')
    expect(proxiedRequest.headers.get('x-forwarded-proto')).toBe('https')
    expect(proxiedRequest.headers.get('x-better-auth-forwarded-host')).toBe('app.example.com')
    expect(proxiedRequest.headers.get('x-better-auth-forwarded-proto')).toBe('https')
  })
})
