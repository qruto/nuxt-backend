import { getAuthClient } from '../auth/client'

/**
 * Access the Better Auth client for sign-in, sign-up, sign-out, and other auth operations.
 *
 * @example
 * ```vue
 * <script setup>
 * const auth = useAuthClient()
 * await auth.signIn.email({ email: 'user@example.com', password: 'password' })
 * await auth.signUp.email({ email: 'user@example.com', password: 'password', name: 'User' })
 * await auth.signOut()
 * </script>
 * ```
 */
export function useAuthClient() {
  return getAuthClient()
}
