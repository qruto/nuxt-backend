import { computed, type ComputedRef } from 'vue'
import { resolveAuthRedirect } from 'nuxt-convex-module/better-auth/client'
import { useRoute, useRuntimeConfig } from '#imports'

/**
 * Where the person goes once a page that interrupted them is done: the page
 * they were headed for, from the `?redirect=` the sign-in and the first-run
 * redirect carry (kept to a path on this site, so a link can never send
 * them elsewhere), else where sign-in lands (`redirects.afterSignIn`, `/`
 * without it). What the ready-made `/welcome` page goes to; a first-run
 * page of your own reads it the same way.
 *
 * @example
 * ```vue [app/pages/welcome.vue]
 * <script setup lang="ts">
 * const back = useReturnPath()
 * </script>
 *
 * <template>
 *   <OnboardingFlow @done="navigateTo(back)" />
 * </template>
 * ```
 */
export function useReturnPath(): ComputedRef<string> {
  const route = useRoute()
  const after = (useRuntimeConfig().public.backend as { redirects?: { afterSignIn?: string } } | undefined)?.redirects?.afterSignIn ?? '/'
  return computed(() => resolveAuthRedirect(route.query.redirect, after))
}
