import { describe, test } from 'vitest'
import { makeFunctionReference } from 'convex/server'
import type { useQuery as useQueryReal } from '../../src/runtime/vue/composables/use-query'

// Intentional noop, we're only testing types.
const useQuery = (() => {}) as unknown as typeof useQueryReal

const noArgsQuery = makeFunctionReference<'query', Record<string, never>, string>('module:noArgs')
const argsQuery = makeFunctionReference<'query', { _arg: string }, string>('module:args')

describe('useQuery types', () => {
  test('queries with arguments', () => {
    useQuery(argsQuery, { _arg: 'asdf' })

    // @ts-expect-error extra args is an error
    useQuery(argsQuery, { _arg: 'asdf', arg2: 123 })

    // @ts-expect-error wrong arg type is an error
    useQuery(argsQuery, { _arg: 1 })

    // @ts-expect-error eliding args object is an error
    useQuery(argsQuery)
  })

  test('queries without arguments', () => {
    useQuery(noArgsQuery, {})
    useQuery(noArgsQuery)

    // @ts-expect-error adding args is not allowed
    useQuery(noArgsQuery, { _arg: 1 })
  })
})
