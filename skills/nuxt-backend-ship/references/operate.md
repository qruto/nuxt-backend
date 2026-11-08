# Monitor, flags and kill switches

The detail behind the `nuxt-backend-ship` skill's Monitor and Flags sections.

## Monitor

With `@sentry/nuxt` installed and a DSN set (`MONITORING_DSN`, or the `NEXT_PUBLIC_SENTRY_DSN` Sentry's Vercel
integration sets), the module wires the SDK: the browser and the Nuxt server (`backendAuth(event)`'s
calls included) report errors, tagged `backend.function` and `backend.code` for a failed backend
call. `MONITORING_DSN` on the deployment lets the backend's actions report (`reportError`,
`reportingErrors` from `nuxt-backend/monitoring`, experimental) and its jobs check in
(`checkIn`; a mutation job schedules an action that checks in as its last step). Reports carry
`BACKEND_ENVIRONMENT`; only `production` and `sandbox` check jobs in. A refusal is never reported. Point an uptime check at `/api/backend/health`. In dev without a DSN, DevTools › Monitoring
lists a local error log. Never invent or print a DSN.

## Flags and kill switches

Declare feature flags in `backend/flags.ts` with `defineFlags` (a default and a description
each) and `setupFlags(components, { flags, audit, billing })` from `nuxt-backend/flags`. Guard a
function with `await flags.requireFlag(ctx, key)` (`forbidden`, reason `flag_off`) or branch on
`flags.isEnabled(ctx, key)`; in a page, `useFlag(key).isEnabled`, server-rendered and live. An
administrator overrides a flag in the admin console's Flags tab: on or off for everyone, or, while
off, on for account ids, workspace ids, catalog plan keys and a stable rollout percentage. The
package's own flags `pause_signups`, `pause_checkout` (checkouts, plan switches, gifts) and
`pause_ai` refuse those calls as `unavailable` (reason `<service>_paused`); `maintenance` shows
the `maintenance` notice of `<BackendNotices>` on every page. App keys never start with `pause_` or `backend_`. Pass
`setupFlags` the same `adminRoles` and `adminUserIds` as `setupAdmin`. Every change takes a
recent sign-in and records `flag.changed`. Never flip a switch in production unless the user asks.
