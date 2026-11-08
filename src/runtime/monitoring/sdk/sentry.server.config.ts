// The package's server init for the error-reporting SDK (@sentry/nuxt),
// bundled into the server build by the SDK's module when the app has no
// `sentry.server.config.ts` of its own: one at the app's root replaces this
// file whole. The SDK starts as the server does, from inside its bundle (no
// Node `--import` flag, which a Vercel function cannot take): requests are
// traced, and the libraries the SDK instruments at build time; any other is
// not. The DSN is read when the server starts: the app's `MONITORING_DSN`,
// or the `NEXT_PUBLIC_SENTRY_DSN` Sentry's Vercel integration sets, else the one the
// build wired the SDK with (a `.env` file a server started with `node` does
// not load), which runtime config carries. Reports name the environment the
// same way the backend's do: BACKEND_ENVIRONMENT when the host sets it (a
// `sandbox` demo), else the host's own (`VERCEL_ENV`). The preset
// (./preset.ts) scrubs what leaves and sends console warnings and errors as
// log lines. `serveTunnelIntegration` answers the browser's managed tunnel
// (`tunnel: true` in the client config): it forwards the envelopes of its own
// DSN and of the one the build gave the browser, when the server's env names
// another, and no other. It ships from 11.10: on an older SDK the export is
// missing, and the server starts without it (the module then sends the
// browser straight to the ingest).
import * as Sentry from '@sentry/nuxt'
import { useRuntimeConfig } from 'nuxt/server'
import { DATA_COLLECTION, LOG_LEVELS, SCRUBBING, scrubbingIntegration, tracesSampleRate } from './preset'

/** `serveTunnelIntegration`, which an SDK before 11.10 does not export. */
const serveTunnel = (Sentry as Partial<typeof Sentry>).serveTunnelIntegration

const built = (useRuntimeConfig().public as { backend?: { monitoring?: { dsn?: string } } }).backend?.monitoring?.dsn

Sentry.init({
  dsn: process.env.MONITORING_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || built || undefined,
  environment: import.meta.dev ? 'development' : process.env.BACKEND_ENVIRONMENT || process.env.VERCEL_ENV || 'production',
  tracesSampleRate: tracesSampleRate(import.meta.dev),
  dataCollection: DATA_COLLECTION,
  ...SCRUBBING,
  integrations: [
    Sentry.consoleLoggingIntegration({ levels: [...LOG_LEVELS] }),
    scrubbingIntegration(),
    ...(typeof serveTunnel === 'function' ? [serveTunnel(built ? { allowedDsns: [built] } : undefined)] : []),
  ],
})
