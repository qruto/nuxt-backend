import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'
import { anyApi, getFunctionName } from 'convex/server'
import type { FunctionReference } from 'convex/server'
import type { QueryJournal } from 'convex/browser'
import type { Value } from 'convex/values'
import { type RequestForQueries, useQueriesHelper } from '../../src/runtime/vue/composables/use-queries'
import type { CreateWatch } from '../../src/runtime/vue/queries-observer'

const query1Ref = anyApi.query1!.default! as FunctionReference<'query'>
const query2Ref = anyApi.query2!.default! as FunctionReference<'query'>

class FakeWatch<T extends Value> {
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

  localQueryLogs(): string[] | undefined {
    return undefined
  }

  journal(): QueryJournal | undefined {
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
    const values: Record<string, Value | undefined> = {}
    const watches = new Map<string, Array<FakeWatch<Value>>>()
    const createWatch: CreateWatch = vi.fn((query: FunctionReference<'query'>, _args: Record<string, Value>) => {
      const name = getFunctionName(query)
      const watch = new FakeWatch<Value>()
      watch.value = values[name]
      const current = watches.get(name) ?? []
      current.push(watch)
      watches.set(name, current)
      return watch
    })

    const queries = shallowRef<RequestForQueries>({
      query1: {
        query: query1Ref,
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
        query: query1Ref,
        args: {},
      },
      query2: {
        query: query2Ref,
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
    const watches = new Map<string, Array<FakeWatch<Value>>>()
    const createWatch: CreateWatch = vi.fn((query: FunctionReference<'query'>, _args: Record<string, Value>) => {
      const name = getFunctionName(query)
      const watch = new FakeWatch<Value>()
      const current = watches.get(name) ?? []
      current.push(watch)
      watches.set(name, current)
      return watch
    })

    const queries = shallowRef<RequestForQueries>({
      query: {
        query: query1Ref,
        args: {},
      },
    })

    const scope = effectScope()
    scope.run(() => useQueriesHelper(queries, createWatch))

    expect(watches.get('query1')![0]!.numCallbacks()).toBe(1)

    queries.value = {
      query1: {
        query: query2Ref,
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
    const createWatch: CreateWatch = vi.fn(() => {
      const watch = new FakeWatch<Value>()
      watch.value = value
      return watch
    })

    const queries: RequestForQueries = {
      query1: {
        query: query1Ref,
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
