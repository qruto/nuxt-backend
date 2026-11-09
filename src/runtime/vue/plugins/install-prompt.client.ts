import { defineNuxtPlugin } from '#imports'
import { listenForInstallPrompt } from '../composables/use-install-prompt'

/**
 * The browser's install events, caught from the app's start: Chromium fires
 * `beforeinstallprompt` once, often before the component that offers the
 * install mounts, and `useInstallPrompt()` reads what this kept.
 */
export default defineNuxtPlugin({
  name: 'nuxt-backend:install-prompt',
  setup() {
    listenForInstallPrompt()
  },
})
