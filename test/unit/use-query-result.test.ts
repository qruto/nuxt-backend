import { describe, expectTypeOf, test } from 'vitest'
import { makeFunctionReference } from 'convex/server'
import type { ShallowRef } from 'vue'
import { useQuery as useQueryReal, type UseQueryResult } from '../../src/runtime/vue/use_query'

// Intentional noop, we're only testing types.
const useQuery = (() => {}) as unknown as typeof useQueryReal

const argsQuery = makeFunctionReference<'query', { _arg: string }, string>('module:args')

describe('useQuery object-form result types', () => {
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
})
