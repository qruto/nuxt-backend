// Registered only once the error-reporting SDK (@sentry/nuxt) is installed
// and a DSN is set (src/nuxt/monitoring.ts): an app without it never loads
// this file, so nothing else imports the SDK.
import * as Sentry from '@sentry/nuxt'
import { defineNuxtPlugin } from '#imports'
import type { BackendErrorContext } from '../../vue/utils/action-state'

/**
 * How a failure is read (../report.ts), loaded with the first one: it reads
 * the error catalog, whose English sentences would otherwise sit in every
 * page's initial JavaScript.
 */
let reading: Promise<typeof import('../report')> | undefined
const report = () => reading ??= import('../report')

/**
 * The browser's reports about the backend: every event about a failed
 * backend call carries the function it ran and its error code, whoever
 * captured it, and a composable's failed action is reported even when the
 * app handles it (it reaches no global handler then). A refusal from the
 * error catalog is the app working as designed, and is not reported: the
 * event processor drops it even when a global handler caught it (a page
 * that left a rejected call unhandled).
 */
export default defineNuxtPlugin({
  name: 'nuxt-backend:monitoring',
  setup(nuxtApp) {
    Sentry.addEventProcessor(async (event, hint) => (await report()).tagBackendEvent(event, hint.originalException, 'browser'))
    nuxtApp.hook('backend:error', async ({ cause }: BackendErrorContext) => {
      const { isReportable, monitoringTags } = await report()
      if (isReportable(cause)) Sentry.captureException(cause, { tags: monitoringTags(cause, { source: 'browser' }) })
    })
  },
})
