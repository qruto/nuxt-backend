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

async function serverGuard(path: string) {
  const event = useRequestEvent()
  if (!event) return
  const authed = await backendAuth(event).isAuthenticated()
  if (!authed && path !== '/login') return navigateTo('/login')
}

// The Better Auth client only resolves a session in the browser (it relies
// on cookies + window fetch). On the server `isPending` never flips to
// `false`, so waiting for it would hang SSR forever.
function waitForSession(isPending: () => boolean) {
  return new Promise<void>((resolve) => {
    const stop = watch(
      isPending,
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

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) {
    return serverGuard(to.path)
  }

  const { session } = useAuth()
  if (session.value.isPending) {
    await waitForSession(() => session.value.isPending)
  }

  if (!session.value.data) {
    return navigateTo('/login')
  }
})
