// Registered only once the error-reporting SDK (@sentry/nuxt) is installed
// and a DSN is set (src/nuxt/monitoring.ts): an app without it never loads
// this file, so nothing else imports the SDK. Replay and the feedback widget
// are imported on demand, from ./replay.ts and ./feedback.ts: named here,
// they would sit in every page's initial JavaScript, on in an app or not.
// The SDK's own `getReplay` lives in the same module as the recorder, so the
// running replay is read from the client instead.
import { addIntegration, getClient } from '@sentry/nuxt'
import { watch } from 'vue'
import { defineNuxtPlugin, useNuxtApp } from '#imports'
import { useBackendConfig } from '../../vue/composables/use-backend-config'
import { allowedBy, useStorageChoice } from '../../vue/utils/storage-choice'
import { REPLAY } from './preset'

/** Session replay's integration, as `replayIntegration` returns it. */
type Replay = ReturnType<typeof import('./replay')['replayIntegration']>

/** The replay integration once added, as the SDK's `getReplay` reads it. */
const getReplay = (): Replay | undefined => getClient()?.getIntegrationByName<Replay>('Replay')

/** What {@link applyReplay} drives: the SDK's replay, and how to load its integration. */
export interface ReplayControls {
  getReplay: typeof getReplay
  addIntegration: typeof addIntegration
  loadReplay: () => Promise<typeof import('./replay')['replayIntegration']>
}

const replayControls: ReplayControls = {
  getReplay,
  addIntegration,
  loadReplay: () => import('./replay').then(module => module.replayIntegration),
}

/** The visitor's latest answer, which a replay still loading reads once it arrives. */
let replayAllowed = false

/**
 * Turn session replay on or off as the visitor's choice says: loaded and
 * added (and buffering) once they allowed it, stopped without sending what
 * it held when they withdraw, buffering again when they allow it again.
 */
export async function applyReplay(allowed: boolean, sdk: ReplayControls = replayControls): Promise<void> {
  replayAllowed = allowed
  const replay = sdk.getReplay()
  if (!allowed) {
    if (replay?.getRecordingMode()) void replay.stop({ flush: false })
    return
  }
  if (replay) {
    if (!replay.getRecordingMode()) replay.startBuffering()
    return
  }
  const replayIntegration = await sdk.loadReplay()
  // Withdrawn while it loaded, or added by an answer before this one.
  if (!replayAllowed || sdk.getReplay()) return
  sdk.addIntegration(replayIntegration({ ...REPLAY.privacy }))
}

/**
 * The monitoring preset's browser features, both off by default:
 *
 * - **Session replay,** when the app lists `replay` in
 *   `appConfig.backend.consent.purposes`: `<ConsentPrompt>` asks for it, and
 *   replay runs only while this browser allows it: after an error, the
 *   minute before it and the rest of that visit, with every text, input and
 *   medium masked.
 * - **The user feedback widget,** when `appConfig.backend.monitoring.feedback`
 *   is `true`: a button that sends a report to the monitoring service, in the
 *   words of the `feedback` labels. It asks for no name, address or
 *   screenshot.
 */
export default defineNuxtPlugin({
  name: 'nuxt-backend:monitoring-preset',
  setup() {
    const config = useBackendConfig()
    if (config.consent?.purposes?.includes('replay')) {
      const choice = useStorageChoice()
      watch(choice, value => void applyReplay(allowedBy(value)?.includes('replay') ?? false), { immediate: true })
    }
    if (config.monitoring?.feedback) {
      const nuxtApp = useNuxtApp()
      void import('./feedback').then(({ addFeedbackWidget }) => nuxtApp.runWithContext(addFeedbackWidget))
    }
  },
})
