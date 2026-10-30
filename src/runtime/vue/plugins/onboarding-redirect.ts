import { defineNuxtPlugin, useRouter, useRuntimeConfig } from '#imports'
import { onFirstGuardedPage } from '../utils/page-rules'

/**
 * Leads a new account to the first run at `/welcome` once, right after its
 * first sign-in: when the account has not finished or skipped it, was
 * created in the last day, has answered the required consents, and is not an
 * administrator's visit. Not on the first run's own page, on a workspace
 * invitation, or on the sign-in pages. Mounted unless `pages.welcome` is
 * `false`.
 *
 * It starts on the first page that asks for a sign-in, or on the first page
 * after the sign-in page, and loads nothing before: a public page never pays
 * for the auth client here.
 */
export default defineNuxtPlugin({
  name: 'nuxt-backend:onboarding-redirect',
  setup(nuxtApp) {
    const router = useRouter()
    const pages = (useRuntimeConfig().public.backend as { pages?: { login?: string | false, welcome?: string | false } } | undefined)?.pages
    if (pages?.welcome === false) return
    let started = false
    const start = () => {
      if (started) return
      started = true
      import('../utils/onboarding-redirect')
        .then(({ watchOnboarding }) => watchOnboarding({ nuxtApp, router }))
        .catch((cause: unknown) => {
          // The person lands where they were going; the first run is at its address.
          if (import.meta.dev) console.error('[nuxt-backend] the onboarding redirect could not start:', cause)
        })
    }
    onFirstGuardedPage(router, start)
    // A sign-in on a page that asks for none: the first page after the sign-in page starts it.
    const loginPath = typeof pages?.login === 'string' ? pages.login : '/login'
    router.afterEach((_to, from, failure) => {
      if (!failure && from.path.replace(/\/+$/, '') === loginPath) start()
    })
  },
})
