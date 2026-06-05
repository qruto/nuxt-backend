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

// Intentionally disabled because we're only testing types.
describe.skip('useQuery typing', () => {
  test('useQuery with no args query', () => {
    useQuery(noArgsQuery, {})
    // @ts-expect-error This should be an error
    useQuery(noArgsQuery, { x: 3 })
    useQuery(noArgsQuery, 'skip')
    const x: number | null = null
    useQuery(noArgsQuery, x === null ? 'skip' : {})
    // This should be an error, but isn't :(, probably a bug in TypeScript
    useQuery(noArgsQuery, x === null ? 'skip' : { x })
    // @ts-expect-error This should be an error
    useQuery(noArgsQuery, x === null ? 'skip' : { x: 3 })
  })

  test('useQuery with query taking args', () => {
    // @ts-expect-error This should be an error
    useQuery(argsQuery)
    // @ts-expect-error This should be an error
    useQuery(argsQuery, { _arg: 1 })
    useQuery(argsQuery, { _arg: 'asdf' })
    useQuery(argsQuery, 'skip')
    const _arg: string | null = null
    useQuery(argsQuery, _arg === null ? 'skip' : { _arg })
    // @ts-expect-error This should be an error
    useQuery(argsQuery, _arg === null ? null : { _arg: 1 })
  })
})
