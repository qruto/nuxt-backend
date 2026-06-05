import { defineNuxtRouteMiddleware, navigateTo, useRequestEvent } from '#app'
import { watch } from 'vue'
import { useAuth } from '../../vue/auth/use-auth'
import { backendAuth } from './server'

/**
 * Auth route middleware — protects pages from unauthenticated access.
 *
 * Usage in page:
 * ```vue
 * <script setup>
 * definePageMeta({ middleware: 'auth' })
 * </script>
 * ```
 */
export default defineNuxtRouteMiddleware(async (to) => {
  // The Better Auth client only resolves a session in the browser (it relies
  // on cookies + window fetch). On the server `isPending` never flips to
  // `false`, so waiting for it would hang SSR forever. Instead, do a
  // server-side auth check using `backendAuth(event)` with the request
  // cookies, then defer everything else to the client.
  if (import.meta.server) {
    const event = useRequestEvent()
    if (!event) return
    const authed = await backendAuth(event).isAuthenticated()
    if (!authed && to.path !== '/login') return navigateTo('/login')
    return
  }

  const { session } = useAuth()

  // Wait for session to resolve if still loading
  if (session.value.isPending) {
    await new Promise<void>((resolve) => {
      const stop = watch(
        () => session.value.isPending,
        (pending) => {
          if (!pending) {
            stop()
            resolve()
          }
        },
        { immediate: true },
      )
    })
  }

  if (!session.value.data) {
    return navigateTo('/login')
  }
})
