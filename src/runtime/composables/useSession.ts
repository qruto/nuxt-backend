import { getAuthClient, normalizeSessionState } from '../auth/client'
import { useFetch } from '#app'

/**
 * SSR-compatible session composable.
 * On the server, uses Nuxt's `useFetch` to get session data.
 * On the client, subscribes to reactive session state.
 */
export async function useSession() {
  const session = await getAuthClient().useSession(useFetch)
  return normalizeSessionState(session)
}
