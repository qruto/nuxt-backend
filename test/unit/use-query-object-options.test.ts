import { describe, test } from 'vitest'
import { makeFunctionReference } from 'convex/server'
import type { useQuery as useQueryReal } from '../../src/runtime/vue/composables/use-query'

// Intentional noop, we're only testing types.
const useQuery = (() => {}) as unknown as typeof useQueryReal

const noArgsQuery = makeFunctionReference<'query', Record<string, never>, string>('module:noArgs')
const argsQuery = makeFunctionReference<'query', { _arg: string }, string>('module:args')

describe('useQuery object options', () => {
  test('supports object options and skip sentinel', () => {
    useQuery({
      query: noArgsQuery,
      args: {},
    })

    useQuery({
      query: argsQuery,
      args: { _arg: 'asdf' },
    })

    const _arg: string | undefined = undefined
    useQuery({
      query: argsQuery,
      args: _arg ? { _arg } : 'skip',
    })

    useQuery({
      query: argsQuery,
      args: { _arg: 'asdf' },
    })

    useQuery({
      query: noArgsQuery,
      args: 'skip',
    })
  })
})
