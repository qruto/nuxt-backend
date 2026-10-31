import { describe, expectTypeOf, test } from 'vitest'
import type * as RealClient from 'nuxt-convex-module/client'
import type * as RealAuthClient from '../../src/runtime/vue/auth-client'
import type * as MockClient from '../../src/runtime/test-utils/client'
import type * as MockAuthClient from '../../src/runtime/test-utils/auth-client'

// backendTestAliases() swaps whole modules, so what an app imports from the
// stand-ins must type exactly as the real ones: the mock client keeps every
// export of the base module's entry with its own type, and the mock auth
// client every name of the package's.

type Real = typeof RealClient
type Mock = typeof MockClient
/** Identical types, generic signatures included (expectTypeOf's deep compare gives up on those). */
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
/** The real entry's names the stand-in types differently. */
type Retyped = { [K in keyof Real]: Same<Mock[K], Real[K]> extends true ? never : K }[keyof Real]

describe('the aliased stand-ins', () => {
  test('the client exports every name of the base module\'s entry, each with its type', () => {
    expectTypeOf<Exclude<keyof Real, keyof Mock>>().toEqualTypeOf<never>()
    expectTypeOf<Retyped>().toEqualTypeOf<never>()
  })

  test('the auth client exports every name of the package\'s', () => {
    expectTypeOf<Exclude<keyof typeof RealAuthClient, keyof typeof MockAuthClient>>().toEqualTypeOf<never>()
  })
})
