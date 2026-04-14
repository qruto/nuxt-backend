import { defineNuxtRouteMiddleware, navigateTo } from '#app'
import { watch } from 'vue'
import { useSession } from '../composables/useSession'

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
  const session = await useSession()

  // Wait for session to resolve if still loading
  if (session.isPending.value) {
    await new Promise<void>((resolve) => {
      const stop = watch(
        () => session.isPending.value,
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

  if (!session.data.value) {
    return navigateTo('/login')
  }
})
