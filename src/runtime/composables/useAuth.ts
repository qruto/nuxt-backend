import { computed } from 'vue'
import { getAuthClient, normalizeSessionState } from '../auth/client'

/**
 * Reactive auth state.
 * Returns `{ isAuthenticated, isLoading }` computed refs.
 */
export function useAuth() {
  const session = normalizeSessionState(getAuthClient().useSession())

  return {
    isAuthenticated: computed(() => !!session.data.value),
    isLoading: computed(() => session.isPending.value),
  }
}
