import { computed, type ComputedRef, onMounted, ref, shallowRef } from 'vue'
import { isInstalled } from '../utils/display-mode'
import { useHydrated } from '../utils/hydrated'

/**
 * The event Chromium-based browsers fire once the app can be installed:
 * not in the DOM typings, since no other engine fires it.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed', platform?: string }>
}

/** What a call of `prompt()` came to: the person installed the app, closed the dialog, or no dialog could be shown. */
export type InstallPromptOutcome = 'accepted' | 'dismissed' | 'unavailable'

export interface UseInstallPromptReturn {
  /**
   * The browser handed over its install dialog, so a button of the app's
   * can open it: Chrome and Edge, on desktop and Android, once the app is
   * installable and not installed. `false` on the server, while the page
   * hydrates, in every other browser, and once the dialog was answered,
   * from the app's button or the browser's own banner.
   */
  canInstall: ComputedRef<boolean>
  /** The app runs as an installed app (its own window, or the Home Screen on iOS), or was installed from this page. `false` on the server and while the page hydrates. */
  installed: ComputedRef<boolean>
  /**
   * Open the browser's install dialog. Call it from a click: the browser
   * shows it only in answer to a gesture, and only once per event it fired.
   * Resolves `'unavailable'` when there is no dialog to show (check
   * `canInstall` first), or when the browser refused to show it: a call
   * outside a click keeps the dialog for the next one.
   */
  prompt: () => Promise<InstallPromptOutcome>
}

// One page's install state, shared by every caller: the browser fires
// `beforeinstallprompt` once, often before any component that offers the
// install has mounted, so the client plugin (plugins/install-prompt.client)
// listens as the client bundle loads. Written only in the browser.
const deferred = shallowRef<BeforeInstallPromptEvent | null>(null)
const installedHere = ref(false)
let listening = false

/**
 * Listen for the browser's install events, once per page: keep the install
 * dialog `beforeinstallprompt` hands over until it is answered, and note
 * `appinstalled`. The browser's own banner still shows: only
 * `installable.browserBanner: false` stops it (plugins/install-banner.client),
 * as only a listener that runs when the event fires can. Called as the
 * client plugin's module loads, before any plugin runs, and by
 * `useInstallPrompt()` as it mounts, for an app that leaves the plugin out.
 */
export function listenForInstallPrompt(): void {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('beforeinstallprompt', (event) => {
    const install = event as BeforeInstallPromptEvent
    deferred.value = install
    // One answer spends the dialog, given from the app's button or from the browser's banner.
    install.userChoice.then(() => {
      if (deferred.value === install) deferred.value = null
    }, () => {})
  })
  window.addEventListener('appinstalled', () => {
    deferred.value = null
    installedHere.value = true
  })
}

/**
 * Offer the install of the app from a button of its own: whether the
 * browser handed over its install dialog, whether the app is installed,
 * and the action that opens the dialog.
 *
 * Only Chrome and Edge hand the dialog over. Safari on macOS installs from
 * File → Add to Dock, iPhone and iPad from Share → Add to Home Screen, so
 * where `canInstall` stays `false` and `installed` is `false`, say where to
 * look. The module's manifest, or one of the app's own, is what makes the
 * app installable ([Make the app installable](https://nuxt-backend.dev/docs/build/email/notifications/installable)).
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { canInstall, installed, prompt } = useInstallPrompt()
 * </script>
 * <template>
 *   <button v-if="canInstall" type="button" @click="prompt">Install the app</button>
 *   <p v-else-if="!installed">Add the app from your browser's menu: Share, then Add to Home Screen.</p>
 * </template>
 * ```
 */
export function useInstallPrompt(): UseInstallPromptReturn {
  const hydrated = useHydrated()
  // The display mode is the browser's, fixed for the window: read once mounted.
  const standalone = ref(false)
  onMounted(() => {
    listenForInstallPrompt()
    standalone.value = isInstalled()
  })

  const installed = computed(() => hydrated.value && (standalone.value || installedHere.value))

  async function prompt(): Promise<InstallPromptOutcome> {
    const event = deferred.value
    if (!event) return 'unavailable'
    try {
      await event.prompt()
    }
    catch (error) {
      // Outside a click the browser refuses (`NotAllowedError`), and the dialog stays good for the next one.
      if ((error as { name?: unknown } | null)?.name !== 'NotAllowedError' && deferred.value === event) deferred.value = null
      return 'unavailable'
    }
    // The browser shows one dialog per event: whatever the answer, it is spent.
    if (deferred.value === event) deferred.value = null
    const { outcome } = await event.userChoice
    if (outcome === 'accepted') installedHere.value = true
    return outcome
  }

  return {
    canInstall: computed(() => hydrated.value && deferred.value !== null && !installed.value),
    installed,
    prompt,
  }
}
