import type { FunctionReference } from 'convex/server'
import { describe, expect, it, vi, beforeEach } from 'vitest'

// Hoist mock functions so they're available before vi.mock factory runs
const { mockQuery, mockMutation, mockAction, mockSetAuth, mockSetFetchOptions } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockMutation: vi.fn(),
  mockAction: vi.fn(),
  mockSetAuth: vi.fn(),
  mockSetFetchOptions: vi.fn(),
}))

type MockConvexHttpClientInstance = {
  query: typeof mockQuery
  mutation: typeof mockMutation
  action: typeof mockAction
  setAuth: typeof mockSetAuth
  setFetchOptions: typeof mockSetFetchOptions
}

type NamedFunctionReference<Type extends 'query' | 'mutation' | 'action'> = FunctionReference<Type> & {
  _name: string
}

function mockFunctionReference<Type extends 'query' | 'mutation' | 'action'>(
  name: string,
): NamedFunctionReference<Type> {
  return { _name: name } as unknown as NamedFunctionReference<Type>
}

vi.mock('convex/browser', () => ({
  ConvexHttpClient: function MockConvexHttpClient(this: MockConvexHttpClientInstance, _url: string) {
    this.query = mockQuery
    this.mutation = mockMutation
    this.action = mockAction
    this.setAuth = mockSetAuth
    this.setFetchOptions = mockSetFetchOptions
  },
}))

vi.mock('convex/server', () => ({
  getFunctionName: vi.fn((ref: { _name?: string } | string) => typeof ref === 'string' ? ref : ref?._name ?? String(ref)),
  makeFunctionReference: vi.fn((name: string) => ({ _name: name })),
}))

vi.mock('convex/values', () => ({
  convexToJson: vi.fn(<T>(value: T) => JSON.parse(JSON.stringify(value)) as T),
  jsonToConvex: vi.fn(<T>(value: T) => value),
}))

describe('Nuxt server utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Set env var
    process.env.CONVEX_URL = 'https://test.convex.cloud'
  })

  describe('fetchQuery', () => {
    it('calls ConvexHttpClient.query', async () => {
      const { fetchQuery } = await import('../../src/runtime/nuxt/index')
      const queryRef = mockFunctionReference<'query'>('api.tasks.list')
      mockQuery.mockResolvedValue([{ text: 'Buy groceries' }])

      const result = await fetchQuery(queryRef, {})
      expect(mockQuery).toHaveBeenCalledWith(queryRef, {})
      expect(result).toEqual([{ text: 'Buy groceries' }])
    })

    it('passes auth token to client', async () => {
      const { fetchQuery } = await import('../../src/runtime/nuxt/index')
      const queryRef = mockFunctionReference<'query'>('api.tasks.list')
      mockQuery.mockResolvedValue([])

      await fetchQuery(queryRef, {}, { token: 'my-jwt' })
      expect(mockSetAuth).toHaveBeenCalledWith('my-jwt')
    })

    it('uses custom URL if provided', async () => {
      const { fetchQuery } = await import('../../src/runtime/nuxt/index')
      const queryRef = mockFunctionReference<'query'>('api.tasks.list')
      mockQuery.mockResolvedValue([])

      // Just verify it doesn't throw and calls query
      await fetchQuery(queryRef, {}, { url: 'https://custom.convex.cloud' })
      expect(mockQuery).toHaveBeenCalled()
    })
  })

  describe('fetchMutation', () => {
    it('calls ConvexHttpClient.mutation', async () => {
      const { fetchMutation } = await import('../../src/runtime/nuxt/index')
      const mutationRef = mockFunctionReference<'mutation'>('api.tasks.create')
      mockMutation.mockResolvedValue({ _id: '123' })

      const result = await fetchMutation(mutationRef, { text: 'New task' })
      expect(mockMutation).toHaveBeenCalledWith(mutationRef, { text: 'New task' })
      expect(result).toEqual({ _id: '123' })
    })
  })

  describe('fetchAction', () => {
    it('calls ConvexHttpClient.action', async () => {
      const { fetchAction } = await import('../../src/runtime/nuxt/index')
      const actionRef = mockFunctionReference<'action'>('api.tasks.process')
      mockAction.mockResolvedValue({ ok: true })

      const result = await fetchAction(actionRef, { id: '123' })
      expect(mockAction).toHaveBeenCalledWith(actionRef, { id: '123' })
      expect(result).toEqual({ ok: true })
    })
  })

  describe('preloadQuery', () => {
    it('returns a Preloaded payload with JSON-encoded value', async () => {
      const { preloadQuery } = await import('../../src/runtime/nuxt/index')
      const queryRef = mockFunctionReference<'query'>('api.tasks.list')
      mockQuery.mockResolvedValue([{ text: 'Task 1' }])

      const preloaded = await preloadQuery(queryRef, {})
      expect(preloaded).toHaveProperty('_name')
      expect(preloaded).toHaveProperty('_argsJSON')
      expect(preloaded).toHaveProperty('_valueJSON')
    })
  })

  describe('preloadedQueryResult', () => {
    it('extracts the result from a Preloaded payload', async () => {
      const { preloadQuery, preloadedQueryResult } = await import('../../src/runtime/nuxt/index')
      const queryRef = mockFunctionReference<'query'>('api.tasks.list')
      mockQuery.mockResolvedValue([{ text: 'Task 1' }])

      const preloaded = await preloadQuery(queryRef, {})
      const result = preloadedQueryResult(preloaded)
      expect(result).toBeDefined()
    })
  })

  describe('error handling', () => {
    it('throws when no URL is available', async () => {
      delete process.env.CONVEX_URL
      delete process.env.NUXT_PUBLIC_CONVEX_URL

      // Re-import to get fresh module with no URL env vars
      vi.resetModules()

      const { fetchQuery } = await import('../../src/runtime/nuxt/index')
      const queryRef = mockFunctionReference<'query'>('api.tasks.list')

      await expect(fetchQuery(queryRef, {})).rejects.toThrow()
    })
  })
})
