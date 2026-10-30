import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { tryUseNuxtApp, useRuntimeConfig } from '#imports'

/** A ready-made page, by its key under the `pages` module option. */
export type BackendPageKey = 'acceptInvitation' | 'accessibility' | 'admin' | 'gifts' | 'invite' | 'keepAccount' | 'login' | 'pricing' | 'privacy' | 'profile' | 'report' | 'referral' | 'security' | 'settings' | 'subprocessors' | 'terms' | 'unsubscribe' | 'waitlist' | 'welcome'

/**
 * Where each ready-made page mounts unless the `pages` module option moves
 * it. The module publishes the resolved paths in
 * `runtimeConfig.public.backend.pages`; these serve a render without them.
 * `test/unit/pages.test.ts` pins them to the page definitions.
 *
 * @internal
 */
export const DEFAULT_PAGE_PATHS = {
  acceptInvitation: '/accept-invitation',
  accessibility: '/legal/accessibility',
  admin: '/admin',
  gifts: '/gifts',
  invite: '/invite',
  keepAccount: '/account/keep',
  login: '/login',
  pricing: '/pricing',
  privacy: '/legal/privacy',
  profile: '/profile',
  report: '/report',
  referral: '/r/:code',
  security: '/security',
  settings: '/settings',
  subprocessors: '/legal/subprocessors',
  terms: '/legal/terms',
  unsubscribe: '/unsubscribe',
  waitlist: '/waitlist',
  welcome: '/welcome',
} satisfies Record<BackendPageKey, string>

/**
 * Where a ready-made page lives, for a link to it: the path the module
 * mounted it at (the `pages` module option, else its default), in the
 * active locale when the app uses `@nuxtjs/i18n` (through its
 * `localePath`, so `/pricing` reads `/fr/pricing` under a prefix strategy).
 * Reactive: it follows a locale switch. `null` for a page turned off
 * (`pages.<key>: false`): a link to it has nowhere to go.
 *
 * @example
 * ```ts
 * const pricing = useBackendPagePath('pricing')
 * // <NuxtLink :to="pricing">Plans</NuxtLink>
 * ```
 */
export function useBackendPagePath(page: MaybeRefOrGetter<BackendPageKey>): ComputedRef<string | null> {
  const pages = (useRuntimeConfig().public.backend as { pages?: Partial<Record<BackendPageKey, string | false>> } | undefined)?.pages
  const localePath = (tryUseNuxtApp() as { $localePath?: (path: string) => string } | null)?.$localePath
  return computed(() => {
    const key = toValue(page)
    // A page turned off (`pages.<key>: false`) has no path to link to.
    if (pages?.[key] === false) return null
    const path = pages?.[key] || DEFAULT_PAGE_PATHS[key]
    return localePath?.(path) || path
  })
}
