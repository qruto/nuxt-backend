import { describe, expectTypeOf, test } from 'vitest'
import { makeFunctionReference } from 'convex/server'
import type { ShallowRef } from 'vue'
import type { useQuery_experimental as useQueryReal, UseQueryResult } from '../../src/runtime/vue/composables/use-query'

// Intentional noop, we're only testing types.
const useQuery = (() => {}) as unknown as typeof useQueryReal

const argsQuery = makeFunctionReference<'query', { _arg: string }, string>('module:args')

describe('useQuery_experimental object-form result types', () => {
  test('supports object-form result usage', () => {
    useQuery({
      query: argsQuery,
      args: { _arg: 'asdf' },
    })

    useQuery({
      query: argsQuery,
      args: { _arg: 'asdf' },
      throwOnError: true,
    })

    const _arg: string | undefined = undefined
    const conditionalResult = useQuery({
      query: argsQuery,
      args: _arg ? { _arg } : 'skip',
    })

    expectTypeOf(conditionalResult).toEqualTypeOf<ShallowRef<UseQueryResult<string>>>()
  })

  test('throwOnError removes the error variant from the result union', () => {
    const result = useQuery({
      query: argsQuery,
      args: { _arg: 'asdf' },
      throwOnError: true,
    })

    expectTypeOf(result).toEqualTypeOf<ShallowRef<UseQueryResult<string, true>>>()
    // With throwOnError, only 'pending' | 'success' remain.
    expectTypeOf<UseQueryResult<string, true>['status']>().toEqualTypeOf<'pending' | 'success'>()
  })
})
