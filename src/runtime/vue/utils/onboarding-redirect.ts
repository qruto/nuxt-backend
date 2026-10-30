import { computed, effectScope, watch } from 'vue'
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'
import type { NuxtApp } from '#app'
import { useAuth } from '../composables/use-auth'
import { useBackendPagePath } from '../composables/use-backend-page-path'
import { useOnboarding } from '../composables/use-onboarding'
import { absentQuery, useLiveQuery } from './live-query'
import { useApiNamespace } from './namespace'

// The one redirect that leads a new account to the first run: right after
// sign-up, once the required consents are answered, never during an
// administrator's visit and never on a page the person is already in the
// middle of a flow on. Nothing is stored on the device: the guard is a flag
// in memory, so a reload asks again until the first run is finished or
// skipped, but only for an account created in the last day.

/** How long after sign-up the redirect still leads an account to the first run. */
export const ONBOARDING_REDIRECT_WINDOW_MS = 24 * 60 * 60 * 1000

/** The consents function of `account.api` the redirect waits on. */
interface ConsentsApi {
  getConsents?: Parameters<typeof useLiveQuery>[0]
}

/**
 * Whether a route is one the redirect leaves alone: the first run itself, a
 * workspace invitation being accepted, and the pages of a sign-in, an
 * invitation or a kept account.
 */
export function leavesAlone(path: string, own: ReadonlyArray<string | null>): boolean {
  const here = path.replace(/\/+$/, '') || '/'
  return own.some((candidate) => {
    if (!candidate) return false
    const there = candidate.replace(/\/+$/, '') || '/'
    // A localized copy (`/fr/welcome`) is the same page.
    return here === there || here.endsWith(there)
  })
}

/** What the watch needs of the app. */
export interface WatchOnboarding {
  nuxtApp: NuxtApp
  router: Pick<Router, 'push'> & { currentRoute: { value: Pick<RouteLocationNormalizedLoaded, 'path' | 'fullPath'> } }
}

/**
 * Watch for a signed-in account that never finished the first run, and
 * send it to `/welcome` once. Call it inside the app's context; it returns
 * what stops the watch.
 */
export function watchOnboarding({ nuxtApp, router }: WatchOnboarding): () => void {
  const scope = effectScope(true)
  scope.run(() => {
    void nuxtApp.vueApp.runWithContext(() => nuxtApp.runWithContext(() => {
      const { isSignedIn, impersonating, user } = useAuth()
      const onboarding = useOnboarding()
      const welcome = useBackendPagePath('welcome')
      const login = useBackendPagePath('login')
      const alone = [welcome, useBackendPagePath('acceptInvitation'), login, useBackendPagePath('invite'), useBackendPagePath('waitlist'), useBackendPagePath('keepAccount')]
      const account = useApiNamespace<ConsentsApi>('account')
      const consents = account?.getConsents
        ? useLiveQuery(account.getConsents, () => (isSignedIn.value ? {} : 'skip'))
        : absentQuery<{ missing: string[] } | null>()

      const recent = computed(() => {
        const created = (user.value as { createdAt?: Date | string | number } | null)?.createdAt
        return created !== undefined && Date.now() - new Date(created).getTime() < ONBOARDING_REDIRECT_WINDOW_MS
      })
      // The consents come first: no redirect until they are answered (or the app asks none).
      const answered = computed(() => {
        if (!account?.getConsents) return true
        const view = consents.data.value as { missing?: string[] } | null | undefined
        return view != null && (view.missing ?? []).length === 0
      })
      const due = computed(() => isSignedIn.value && !impersonating.value && onboarding.onboardedAt.value === null && answered.value && recent.value)

      let sent = false
      // Watched with the route: the account is often known while the person
      // is still on the sign-in page.
      watch([due, () => router.currentRoute.value.path], ([now]) => {
        if (!now || sent || !welcome.value) return
        const here = router.currentRoute.value
        // Still on the sign-in page: the look waits for the page they go on to.
        if (leavesAlone(here.path, [login.value])) return
        // One look: the person stays where they are (the first run itself, or
        // a flow they are in the middle of), or is led to the first run.
        sent = true
        if (leavesAlone(here.path, alone.map(page => page.value))) return
        // The page they were headed for comes back once the first run is over.
        void router.push(here.fullPath && here.fullPath !== '/' ? { path: welcome.value, query: { redirect: here.fullPath } } : welcome.value)
      }, { immediate: true })
    }))
  })
  return () => scope.stop()
}
