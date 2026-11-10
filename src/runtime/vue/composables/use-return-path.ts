import { computed, type ComputedRef } from 'vue'
import { resolveAuthRedirect } from 'nuxt-convex-module/better-auth/client'
import { useRoute, useRuntimeConfig } from '#imports'
import { DEFAULT_PAGE_PATHS, useBackendPagePath } from './use-backend-page-path'

/** A path as the router matches it: no query or hash, no trailing slash, any case. */
function comparable(path: string): string {
  return (path.split(/[?#]/, 1)[0]!.replace(/\/+$/, '') || '/').toLowerCase()
}

/**
 * Where a `?redirect=` sends a person: the path it names when it stays on
 * this site (`resolveAuthRedirect`), else `fallback`. A redirect to the
 * sign-in page itself, which a sign-in link followed from the sign-in page
 * writes, would send a person who just signed in back to sign in: that goes
 * to `fallback` too, and to `/` when `fallback` is the sign-in page.
 *
 * @internal
 */
export function returnPathFrom(redirect: unknown, fallback: string, loginPaths: readonly string[]): string {
  const signIn = new Set(loginPaths.map(comparable))
  const leadsToSignIn = (path: string) => signIn.has(comparable(path))
  const target = resolveAuthRedirect(redirect, fallback)
  if (!leadsToSignIn(target)) return target
  return leadsToSignIn(fallback) ? '/' : fallback
}

/**
 * Where the person goes once a page that interrupted them is done: the page
 * they were headed for, from the `?redirect=` the sign-in and the first-run
 * redirect carry (kept to a path on this site, so a link can never send
 * them elsewhere, and never to the sign-in page, which would ask them to
 * sign in again), else where sign-in lands (`redirects.afterSignIn`, `/`
 * without it). Where the ready-made `/login` and `/welcome` pages go; a page
 * of your own in their place reads it the same way.
 *
 * @example
 * ```vue [app/pages/welcome.vue]
 * <script setup lang="ts">
 * const back = useReturnPath()
 * </script>
 *
 * <template>
 *   <OnboardingFlow @done="navigateTo(back, { replace: true })" />
 * </template>
 * ```
 */
export function useReturnPath(): ComputedRef<string> {
  const route = useRoute()
  const backend = useRuntimeConfig().public.backend as { redirects?: { afterSignIn?: string }, pages?: { login?: string | false } } | undefined
  const after = backend?.redirects?.afterSignIn ?? '/'
  // The sign-in page where the page guard sends a person, and in the active locale.
  const login = useBackendPagePath('login')
  const loginPath = backend?.pages?.login || DEFAULT_PAGE_PATHS.login
  return computed(() => returnPathFrom(route.query.redirect, after, [loginPath, login.value ?? loginPath]))
}
