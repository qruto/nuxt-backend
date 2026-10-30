import { defineNuxtPlugin } from '#imports'
import { normalizeLocale } from '../../../convex/locale.js'

/**
 * Keeps the account's language (`user.locale`, which every email the
 * package sends is written in) with the app's: when `@nuxtjs/i18n` switches
 * the locale while someone is signed in, the new one is stored on their
 * account. Registered only beside `@nuxtjs/i18n`; the auth client loads on
 * the first switch, so a page nobody switches on pays nothing for it. A
 * store that fails leaves the account as it was: the next switch tries again.
 */
export default defineNuxtPlugin({
  name: 'nuxt-backend:locale-sync',
  setup(nuxtApp) {
    const hook = nuxtApp.hook as unknown as (name: 'i18n:localeSwitched', fn: (event: { newLocale: string }) => void) => void
    hook('i18n:localeSwitched', ({ newLocale }) => {
      const locale = normalizeLocale(newLocale)
      if (!locale) return
      import('../utils/auth-session')
        .then(({ useAuthSession }) => nuxtApp.runWithContext(async () => {
          const auth = useAuthSession()
          const user = auth.user.value as { locale?: string | null } | null | undefined
          if (!auth.isAuthenticated.value || !user || normalizeLocale(user.locale) === locale) return
          await auth.updateUser({ locale })
        }))
        .catch((cause: unknown) => {
          if (import.meta.dev) console.warn('[nuxt-backend] the account\'s language was not stored:', cause)
        })
    })
  },
})
