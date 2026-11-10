import { defineNuxtPlugin } from '#imports'

/**
 * Chrome's own install banner on Android (the mini-infobar), stopped: the
 * module adds this only with `installable.browserBanner: false`, so the app's
 * own button (`useInstallPrompt()`) offers the install. The browser shows the
 * banner unless `beforeinstallprompt` is cancelled while it fires, so this
 * listens from the app's start.
 */
export default defineNuxtPlugin({
  name: 'nuxt-backend:install-banner',
  setup() {
    window.addEventListener('beforeinstallprompt', event => event.preventDefault())
  },
})
