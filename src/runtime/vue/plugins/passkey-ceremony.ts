import { defineNuxtPlugin, onNuxtReady } from '#imports'
import { preloadPasskeyCeremony } from '../passkey-ceremony'

/**
 * Loads the passkey ceremony once the page is idle after hydration, so the
 * first tap on a passkey button runs Better Auth's actions straight through
 * (src/runtime/vue/passkey-client.ts says why that matters on WebKit). The
 * chunk is usually in the cache by then: Nuxt prefetches it at idle.
 * `<AuthForm>` and `usePasskeys` start the same load on mount, with the auth
 * client beside it (`preparePasskeyPrompt`); this plugin leaves the client
 * alone, so a page with no passkey form never downloads it.
 */
export default defineNuxtPlugin({
  name: 'nuxt-backend:passkey-ceremony',
  setup() {
    onNuxtReady(preloadPasskeyCeremony)
  },
})
