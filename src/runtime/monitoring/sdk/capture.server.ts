// Registered only once the error-reporting SDK (@sentry/nuxt) is installed
// and a DSN is set (src/nuxt/monitoring.ts): an app without it never loads
// this file, so nothing else imports the SDK.
import * as Sentry from '@sentry/nuxt'
import { addBackendReporter } from '../../server/monitoring/capture'
import { tagBackendEvent } from '../report'

/**
 * The server's reports about the backend: a failed call the server made
 * (`backendAuth(event)`'s calls, the agent endpoint's tools) is reported
 * with the function it ran and its error code, every other event about one
 * is tagged the same way, and one about a refusal from the error catalog
 * (rethrown by a route, say) is dropped. A Nitro plugin that uses nothing of
 * the Nitro app, so the same file runs on Nitro 2 and Nitro 3.
 */
export default function monitoringCapturePlugin(): void {
  Sentry.addEventProcessor((event, hint) => tagBackendEvent(event, hint.originalException, 'server'))
  addBackendReporter((error, tags) => {
    Sentry.captureException(error, { tags })
  })
}
