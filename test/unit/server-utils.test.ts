import { beforeEach, describe, expect, it, vi } from 'vitest'

const useRuntimeConfig = vi.fn(() => ({
  public: {
    backend: {
      url: 'https://example.convex.cloud',
    },
  },
}))
const getToken = vi.fn()
const setAuth = vi.fn()
const query = vi.fn()
const mutation = vi.fn()
const action = vi.fn()

class MockConvexHttpClient {
  setAuth = setAuth
  query = query
  mutation = mutation
  action = action
}

vi.mock('#imports', () => ({
  useRuntimeConfig,
}))

vi.mock('convex/browser', () => ({
  ConvexHttpClient: MockConvexHttpClient,
}))

vi.mock('../../src/runtime/server/utils/auth', () => ({
  getToken,
  isAuthenticated: vi.fn(),
}))

describe('runtime server utilities', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    useRuntimeConfig.mockReturnValue({
      public: {
        backend: {
          url: 'https://example.convex.cloud',
        },
      },
    })
    getToken.mockResolvedValue('resolved-token')
  })

  it('resolves auth from the current request when no token is passed', async () => {
    const { fetchAuthQuery, preloadAuthQuery } = await import('../../src/runtime/server/utils/backend')
    const queryRef = { toString: () => 'api.auth.getCurrentUser' } as import('convex/server').FunctionReference<
      'query',
      'public',
      Record<string, never>,
      { id: string }
    >

    query
      .mockResolvedValueOnce({ id: 'user-1' })
      .mockResolvedValueOnce({ id: 'user-1' })

    await expect(fetchAuthQuery(queryRef)).resolves.toEqual({ id: 'user-1' })
    await expect(preloadAuthQuery(queryRef)).resolves.toEqual({
      _result: { id: 'user-1' },
      _queryReference: 'api.auth.getCurrentUser',
    })

    expect(getToken).toHaveBeenCalledTimes(2)
    expect(setAuth).toHaveBeenCalledWith('resolved-token')
    expect(query).toHaveBeenNthCalledWith(1, queryRef, {})
    expect(query).toHaveBeenNthCalledWith(2, queryRef, {})
  })

  it('keeps the explicit token overload working for authenticated helpers', async () => {
    const { fetchAuthQuery } = await import('../../src/runtime/server/utils/backend')
    const queryRef = { toString: () => 'api.messages.list' } as import('convex/server').FunctionReference<
      'query',
      'public',
      { channel: string },
      { ok: boolean }
    >

    query.mockResolvedValue({ ok: true })

    await expect(fetchAuthQuery('explicit-token', queryRef, { channel: 'general' })).resolves.toEqual({ ok: true })

    expect(getToken).not.toHaveBeenCalled()
    expect(setAuth).toHaveBeenCalledWith('explicit-token')
    expect(query).toHaveBeenCalledWith(queryRef, { channel: 'general' })
  })
})
