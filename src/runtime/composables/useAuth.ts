import { computed } from 'vue'
import { authClient } from '../auth/client'

/**
 * Reactive auth state.
 * Returns `{ isAuthenticated, isLoading }` computed refs.
 */
export function useAuth() {
  const session = authClient.useSession()

  return {
    isAuthenticated: computed(() => !!session.value.data),
    isLoading: computed(() => session.value.isPending),
  }
}
