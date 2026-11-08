// The package's client init for the error-reporting SDK (@sentry/nuxt),
// loaded by the SDK's module when the app has no `sentry.client.config.ts`
// of its own: one at the app's root replaces this file whole. The DSN comes
// from runtime config, where the module puts the app's `MONITORING_DSN` (or
// the `NEXT_PUBLIC_SENTRY_DSN` Sentry's Vercel integration sets). The preset
// (./preset.ts) scrubs what leaves, sends console warnings and errors as log
// lines, and sets replay's sampling; replay itself and the feedback widget
// are added by the package's plugin (./observe.client.ts), replay only once
// the visitor allowed it. Reports go through the managed tunnel (`tunnel:
// true`): to a path on the app's own origin derived from the DSN, which the
// server's `serveTunnelIntegration` forwards to the ingest, so an ad blocker
// can't drop them and the security headers' `connect-src 'self'` lets them out.
import * as Sentry from '@sentry/nuxt'
import { useRuntimeConfig } from '#imports'
import { DATA_COLLECTION, LOG_LEVELS, REPLAY, SCRUBBING, scrubbingIntegration, tracesSampleRate } from './preset'

const { dsn, environment } = useRuntimeConfig().public.backend.monitoring

Sentry.init({
  dsn,
  environment: import.meta.dev ? 'development' : environment,
  tracesSampleRate: tracesSampleRate(import.meta.dev),
  dataCollection: DATA_COLLECTION,
  ...SCRUBBING,
  ...REPLAY.sampling,
  tunnel: true,
  integrations: [Sentry.consoleLoggingIntegration({ levels: [...LOG_LEVELS] }), scrubbingIntegration()],
})
