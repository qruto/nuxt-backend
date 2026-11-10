import { defineNuxtPlugin } from '#imports'
import { listenForInstallPrompt } from '../composables/use-install-prompt'

// Chromium fires `beforeinstallprompt` once the page has loaded, and a
// plugin's setup can run later than that: it waits for every plugin before it
// that awaits a chunk or a request. So the listener goes on as this module
// loads, with the client bundle, which the page's `load` always waits for.
listenForInstallPrompt()

/**
 * The browser's install events, caught from the app's start: Chromium fires
 * `beforeinstallprompt` once, often before the component that offers the
 * install mounts, and `useInstallPrompt()` reads what this kept.
 */
export default defineNuxtPlugin({
  name: 'nuxt-backend:install-prompt',
})
