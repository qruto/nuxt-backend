import { defineNuxtPlugin } from '#imports'
import { STARTED_EVENT } from '../../chunk-recovery'

/**
 * Tells the chunk-load recovery's inline script that the app has started
 * (src/runtime/server/chunk-recovery.ts): once the first page rendered in
 * full, hydration included, so a chunk that fails after that is Nuxt's to
 * handle: a reload on navigation, nothing for a decoration. Nuxt calls
 * `app:suspense:resolve` once, for a client-only page and an error page
 * too. Registered with the script, in a production build.
 */
export default defineNuxtPlugin({
  name: 'nuxt-backend:chunk-recovery',
  hooks: {
    'app:suspense:resolve'() {
      window.dispatchEvent(new Event(STARTED_EVENT))
    },
  },
})
