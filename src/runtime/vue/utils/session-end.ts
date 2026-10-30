import { watch } from 'vue'
import type { RouteLocationNormalized, RouteLocationRaw, Router } from 'vue-router'
import type { NuxtApp } from '#app'
import { takeLocalSignOut } from './local-sign-out'
import { isAuthGuarded } from './page-rules'

/** What the `backend:session-ended` hook receives. */
export interface BackendSessionEndedContext {
  /** The page the person was on when the session ended: one that asks for a sign-in (`definePageMeta({ auth })`). */
  route: RouteLocationNormalized
  /** Where they go next: the sign-in page, with `?redirect=` back to `route`. Set it to send them elsewhere. */
  to: RouteLocationRaw
  /** Keep them where they are: nothing navigates. The page shows its own signed-out state. */
  preventDefault: () => void
}

declare module '#app' {
  interface RuntimeNuxtHooks {
    /**
     * The session ended (a sign-out in another tab, or a session revoked
     * from another device) while the page was one that asks for a sign-in
     * (`definePageMeta({ auth })`). Change `to`, or call
     * `preventDefault()` to stay. A sign-out made through
     * `useAuth().signOut` in this tab never calls it.
     */
    'backend:session-ended': (context: BackendSessionEndedContext) => void | Promise<void>
  }
}

/** The query keys the redirect back never carries: the consent page's one-time code. */
const SECRET_QUERY = ['consent_code']

/** A route's full path without the query keys that must never be copied into another URL. */
export function shareablePath(route: Pick<RouteLocationNormalized, 'fullPath'>): string {
  const url = new URL(route.fullPath, 'http://route.invalid')
  for (const key of SECRET_QUERY) url.searchParams.delete(key)
  return `${url.pathname}${url.search}${url.hash}`
}

/** What `watchSessionEnd` watches, and where it sends a person. */
export interface SessionEndWatch {
  /** The app's router: the page the session ended on, and the navigation away from it. */
  router: Pick<Router, 'currentRoute' | 'push' | 'beforeEach' | 'afterEach' | 'onError'>
  /**
   * The session as the auth server last settled it: its key (see
   * `sessionKey`) when signed in, `null` when signed out, `undefined` while
   * the answer is still pending.
   */
  session: () => string | null | undefined
  /** The sign-in page's path (`pages.login`). */
  loginPath: string
}

/**
 * Watch for the session to end on a guarded page, then call the
 * `backend:session-ended` hook and, unless a handler prevented it, navigate
 * to where the hook left `to`. Only a settled end counts: signed in by the
 * server's last answer, signed out by this one. A pending answer (while the
 * app hydrates or a token refreshes) is no end, nor is a session signed out
 * from the start, a sign-out this tab made through `useAuth().signOut` (the
 * app navigates after it on its own), or an end that lands while a
 * navigation is under way (the next page's middleware decides).
 */
export function watchSessionEnd(nuxtApp: NuxtApp, { router, session, loginPath }: SessionEndWatch): void {
  let navigating = false
  router.beforeEach(() => {
    navigating = true
  })
  router.afterEach(() => {
    navigating = false
  })
  router.onError(() => {
    navigating = false
  })

  let signedIn: string | null | undefined
  watch(session, async (now) => {
    if (now === undefined) return
    const ended = signedIn
    signedIn = now
    if (now !== null || !ended) return
    if (takeLocalSignOut(ended) || navigating) return
    const route = router.currentRoute.value
    if (!isAuthGuarded(route) || route.path === loginPath) return
    let prevented = false
    const context: BackendSessionEndedContext = {
      route,
      to: { path: loginPath, query: { redirect: shareablePath(route) } },
      preventDefault: () => { prevented = true },
    }
    await nuxtApp.callHook('backend:session-ended', context)
    if (!prevented) await router.push(context.to)
  }, { immediate: true })
}
