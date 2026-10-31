import { computed } from 'vue'
import { authClient } from '../../../src/runtime/vue/auth-client'

// The base module's session layer for the passkey autofill page, over the
// package's own Better Auth client (src/runtime/vue/auth-client.ts), which
// talks to the test's server on the page's own origin.

export function useBetterAuth() {
  const session = authClient.useSession()
  return {
    client: authClient,
    session,
    user: computed(() => session.value.data?.user ?? null),
    isAuthenticated: computed(() => Boolean(session.value.data)),
    isLoading: computed(() => session.value.isPending),
    fetchAccessToken: async () => null,
    authVersion: computed(() => session.value.data?.session.id ?? null),
  }
}
