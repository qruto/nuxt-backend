import { defineNuxtPlugin } from '#imports'

// The browser shows its banner unless `beforeinstallprompt` is cancelled while
// it fires, once the page has loaded. A plugin's setup can run later than that
// (it waits for every plugin before it that awaits), so the listener goes on
// as this module loads, with the client bundle, which `load` always waits for.
if (typeof window !== 'undefined') window.addEventListener('beforeinstallprompt', event => event.preventDefault())

/**
 * Chrome's own install banner on Android (the mini-infobar), stopped: the
 * module adds this only with `installable.browserBanner: false`, so the app's
 * own button (`useInstallPrompt()`) offers the install.
 */
export default defineNuxtPlugin({
  name: 'nuxt-backend:install-banner',
})
