import { computed } from 'vue'
import { authClient } from '../auth/client'

/**
 * Reactive auth state.
 * Returns `{ isAuthenticated, isLoading }` computed refs.
 */
export function useAuth() {
  const session = authClient.useSession()

  return {
    isAuthenticated: computed(() => !!session.data.value),
    isLoading: computed(() => session.isPending.value),
  }
}
