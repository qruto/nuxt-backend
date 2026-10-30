// The `backend:session-ended` hook is typed beside the watch (../utils/session-end), which this file loads.
import { defineNuxtPlugin, useRouter, useRuntimeConfig } from '#imports'
import { onFirstGuardedPage } from '../utils/page-rules'

/**
 * Sends a person to the sign-in page, with `?redirect=` back, when their
 * session ends while they are on a page `definePageMeta({ auth })` guards: a
 * sign-out in another tab, or a session revoked from another device. The
 * page guard only runs on a navigation, so without this a page would keep
 * rendering for someone who is no longer signed in. Always on; the
 * cancellable `backend:session-ended` hook changes where they go, or keeps
 * them on the page.
 *
 * It loads the auth client and the watch only once a guarded page is open:
 * a public page (a landing page, the docs) never pays for them here.
 */
export default defineNuxtPlugin({
  name: 'nuxt-backend:session-ended',
  setup(nuxtApp) {
    const router = useRouter()
    const pages = (useRuntimeConfig().public.backend as { pages?: { login?: string } } | undefined)?.pages
    const loginPath = pages?.login ?? '/login'
    onFirstGuardedPage(router, () => {
      Promise.all([import('../utils/auth-session'), import('../utils/session-end'), import('../utils/local-sign-out')])
        .then(([{ useAuthSession }, { watchSessionEnd }, { sessionKey }]) => nuxtApp.runWithContext(() => {
          const { session } = useAuthSession()
          watchSessionEnd(nuxtApp, {
            router,
            // A signed-in answer always has a key; one without reads as signed in all the same.
            session: () => (session.value.isPending ? undefined : session.value.data ? sessionKey(session.value.data) ?? 'signed-in' : null),
            loginPath,
          })
        }))
        .catch((cause: unknown) => {
          // A chunk that failed to load leaves the page as it was: the next
          // navigation's middleware still guards it.
          if (import.meta.dev) console.error('[nuxt-backend] the session-ended watch could not start:', cause)
        })
    })
  },
})
