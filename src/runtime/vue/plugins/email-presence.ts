import { defineNuxtPlugin } from '#imports'

/**
 * Tells the backend, once a day per tab, that the signed-in person used the
 * app, with their browser's time zone: the sunset rule counts app activity
 * as engagement, and quiet hours fall in the person's own time zone
 * (`setupEmail({ caps })`). Calls `recordTimeZone` from `backend/email.ts`
 * when it is re-exported, and nothing otherwise; a failure is left for the
 * next day. Also drops this device's web push subscription when the
 * session signs out, so a shared computer stops notifying the last person.
 * Loads its code only after the app mounted.
 */
export default defineNuxtPlugin({
  name: 'nuxt-backend:email-presence',
  setup(nuxtApp) {
    nuxtApp.hook('app:mounted', () => {
      import('../utils/email-presence')
        .then(({ watchPresence }) => nuxtApp.vueApp.runWithContext(watchPresence))
        .catch((cause: unknown) => {
          if (import.meta.dev) console.warn('[nuxt-backend] the email presence watch could not start:', cause)
        })
      import('../utils/push-device')
        .then(({ watchPushSignOut }) => nuxtApp.vueApp.runWithContext(watchPushSignOut))
        .catch((cause: unknown) => {
          if (import.meta.dev) console.warn('[nuxt-backend] the push sign-out watch could not start:', cause)
        })
    })
  },
})
