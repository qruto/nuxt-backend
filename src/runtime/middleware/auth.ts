import { defineNuxtRouteMiddleware, navigateTo } from '#app'
import { watch } from 'vue'
import { authClient } from '../auth/client'

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
export default defineNuxtRouteMiddleware(async () => {
  const session = authClient.useSession()

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
