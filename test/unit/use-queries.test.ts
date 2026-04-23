import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'
import { anyApi, getFunctionName } from 'convex/server'
import type { FunctionReference } from 'convex/server'
import { type RequestForQueries, useQueriesHelper } from '../../src/runtime/vue/use_queries'

class FakeWatch<T> {
  value: T | undefined
  private callbacks = new Set<() => void>()

  onUpdate(callback: () => void): () => void {
    this.callbacks.add(callback)
    return () => {
      this.callbacks.delete(callback)
    }
  }

  localQueryResult(): T | undefined {
    return this.value
  }

  journal() {
    return undefined
  }

  setValue(value: T | undefined): void {
    this.value = value
    for (const callback of this.callbacks) {
      callback()
    }
  }

  numCallbacks(): number {
    return this.callbacks.size
  }
}

describe('useQueriesHelper', () => {
  it('adding a new query', async () => {
    const values: Record<string, unknown> = {}
    const watches = new Map<string, Array<FakeWatch<unknown>>>()
    const createWatch = vi.fn((query: FunctionReference<'query'>) => {
      const name = getFunctionName(query)
      const watch = new FakeWatch<unknown>()
      watch.value = values[name]
      const current = watches.get(name) ?? []
      current.push(watch)
      watches.set(name, current)
      return watch
    })

    const queries = shallowRef<RequestForQueries>({
      query1: {
        query: anyApi.query1.default,
        args: {},
      },
    })

    const scope = effectScope()
    const result = scope.run(() => useQueriesHelper(queries, createWatch))!

    expect(result.value).toStrictEqual({
      query1: undefined,
    })

    values.query1 = 'query1 result'
    watches.get('query1')![0]!.setValue('query1 result')
    await nextTick()

    expect(result.value).toStrictEqual({
      query1: 'query1 result',
    })

    queries.value = {
      query1: {
        query: anyApi.query1.default,
        args: {},
      },
      query2: {
        query: anyApi.query2.default,
        args: {},
      },
    }
    await nextTick()

    expect(result.value).toStrictEqual({
      query1: 'query1 result',
      query2: undefined,
    })

    values.query2 = 'query2 result'
    watches.get('query2')![0]!.setValue('query2 result')
    await nextTick()

    expect(result.value).toStrictEqual({
      query1: 'query1 result',
      query2: 'query2 result',
    })

    scope.stop()
  })

  it('swapping queries and unsubscribing', async () => {
    const watches = new Map<string, Array<FakeWatch<unknown>>>()
    const createWatch = vi.fn((query: FunctionReference<'query'>) => {
      const name = getFunctionName(query)
      const watch = new FakeWatch<unknown>()
      const current = watches.get(name) ?? []
      current.push(watch)
      watches.set(name, current)
      return watch
    })

    const queries = shallowRef<RequestForQueries>({
      query: {
        query: anyApi.query1.default,
        args: {},
      },
    })

    const scope = effectScope()
    scope.run(() => useQueriesHelper(queries, createWatch))

    expect(watches.get('query1')![0]!.numCallbacks()).toBe(1)

    queries.value = {
      query1: {
        query: anyApi.query2.default,
        args: {},
      },
    }
    await nextTick()

    expect(watches.get('query1')![0]!.numCallbacks()).toBe(0)
    expect(watches.get('query2')![0]!.numCallbacks()).toBe(1)

    scope.stop()

    expect(watches.get('query1')![0]!.numCallbacks()).toBe(0)
    expect(watches.get('query2')![0]!.numCallbacks()).toBe(0)
  })

  it('local results on initial render', () => {
    const value = 'query1 result'
    const createWatch = vi.fn(() => {
      const watch = new FakeWatch<string>()
      watch.value = value
      return watch
    })

    const queries: RequestForQueries = {
      query1: {
        query: anyApi.query1.default,
        args: {},
      },
    }

    const scope = effectScope()
    const result = scope.run(() => {
      const result = useQueriesHelper(queries, createWatch)
      expect(result.value.query1).toEqual(value)
      return result
    })!

    expect(result.value).toStrictEqual({
      query1: 'query1 result',
    })

    scope.stop()
  })
})
