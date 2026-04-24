import { authClient } from '../client'
import { useFetch } from '#app'

/**
 * SSR-compatible session composable.
 * On the server, uses Nuxt's `useFetch` to get session data.
 * On the client, subscribes to reactive session state.
 */
export async function useSession() {
  return authClient.useSession(useFetch)
}
