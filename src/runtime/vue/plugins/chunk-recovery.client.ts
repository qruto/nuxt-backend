import { defineNuxtPlugin } from '#imports'
import { MOUNTED_EVENT } from '../../chunk-recovery'

/**
 * Tells the chunk-load recovery's inline script that the app has mounted
 * (src/runtime/server/chunk-recovery.ts), so a dynamic import that fails
 * after that is Nuxt's to handle: a reload on navigation, nothing for a
 * decoration. Registered with the script, in a production build.
 */
export default defineNuxtPlugin({
  name: 'nuxt-backend:chunk-recovery',
  hooks: {
    'app:mounted'() {
      window.dispatchEvent(new Event(MOUNTED_EVENT))
    },
  },
})
