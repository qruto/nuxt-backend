import { describe, expectTypeOf, test } from 'vitest'
import { convexClient } from '@convex-dev/better-auth/client/plugins'
import { adminClient, emailOTPClient, organizationClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/vue'
import type { AuthClient } from '../../src/runtime/vue/auth-client'
import { passkeyClient } from '../../src/runtime/vue/passkey-client'
import { protectionClient } from '../../src/runtime/vue/protection/state'

// The package's auth client is declared with a named plugin type, so its
// declaration file stays a line long: it must be the very type the call
// infers, which is what `useAuth().client` and an app's own calls read.
// The source refuses a named type that differs from its plugin list either
// way, so this copy of the list, held to the named type here, is the
// source's list too.

/** What the call infers, its plugins in the same order. */
const inferred = () => createAuthClient({
  plugins: [convexClient(), emailOTPClient(), passkeyClient(), adminClient(), organizationClient(), protectionClient()],
})

/** Identical types, generic signatures included (expectTypeOf's deep compare gives up on those). */
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false

describe('the auth client', () => {
  test('is declared as the type its construction infers', () => {
    expectTypeOf(inferred).toBeFunction()
    expectTypeOf<Same<AuthClient, ReturnType<typeof inferred>>>().toEqualTypeOf<true>()
  })
})
