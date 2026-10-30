// Registered only once the error-reporting SDK (@sentry/nuxt) is installed
// and a DSN is set (src/nuxt/monitoring.ts): an app without it never loads
// this file, so nothing else imports the SDK.
import * as Sentry from '@sentry/nuxt'
import { watch } from 'vue'
import { defineNuxtPlugin } from '#imports'
import { useBackendConfig } from '../../vue/composables/use-backend-config'
import { useLabels } from '../../vue/composables/use-labels'
import { allowedBy, useStorageChoice } from '../../vue/utils/storage-choice'
import { REPLAY } from './preset'

/**
 * Turn session replay on or off as the visitor's choice says: added (and
 * buffering) once they allowed it, stopped without sending what it held when
 * they withdraw, buffering again when they allow it again.
 */
export function applyReplay(allowed: boolean, sdk: Pick<typeof Sentry, 'getReplay' | 'addIntegration' | 'replayIntegration'> = Sentry): void {
  const replay = sdk.getReplay()
  if (!allowed) {
    if (replay?.getRecordingMode()) void replay.stop({ flush: false })
    return
  }
  if (!replay) sdk.addIntegration(sdk.replayIntegration({ ...REPLAY.privacy }))
  else if (!replay.getRecordingMode()) replay.startBuffering()
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
      watch(choice, value => applyReplay(allowedBy(value)?.includes('replay') ?? false), { immediate: true })
    }
    if (config.monitoring?.feedback) {
      const { t } = useLabels('feedback')
      Sentry.addIntegration(Sentry.feedbackIntegration({
        autoInject: true,
        colorScheme: 'system',
        showName: false,
        showEmail: false,
        enableScreenshot: false,
        triggerLabel: t('trigger'),
        triggerAriaLabel: t('trigger'),
        formTitle: t('title'),
        messageLabel: t('message'),
        messagePlaceholder: t('placeholder'),
        isRequiredLabel: t('required'),
        submitButtonLabel: t('submit'),
        cancelButtonLabel: t('cancel'),
        successMessageText: t('sent'),
      }))
    }
  },
})
