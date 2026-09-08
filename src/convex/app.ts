import type { EnvDefinition } from 'convex/server'
import { v } from 'convex/values'

// This module imports NOTHING from any `convex.config` — no component
// definitions, no app helper. Convex discovers its component tree by
// intercepting every import whose specifier contains `convex.config` while
// bundling the app's `convex.config.ts`, and current (2026-08) Convex backends
// crash evaluating the definition bundle with an opaque `start_push 500`
// whenever such an import is reached through an intermediate module — which
// is exactly what the former `defineBackendApp()` / `installBackend()` helpers
// were. The app definition therefore lives in the consumer's root
// `convex.config.ts` (scaffolded for them: explicit component imports and one
// `app.use` per component), and `nuxt-backend/app` only ships the env
// contract, which is safe to import from that file.

/**
 * Environment variables the backend reads, in two tiers.
 *
 * Required — a deploy fails until they are set (misconfiguration of the
 * security-critical pair must surface at push time, never at runtime):
 * `AUTH_SECRET` (session/JWT signing) and `SITE_URL` (the app origin — auth
 * base URL and every emailed link).
 *
 * Optional — the deploy succeeds and the feature degrades in a designed,
 * observable way until configured (`nuxt-backend doctor` reports each):
 * - `EMAIL_API_KEY` — sends no-op with a console warn; OTP sign-in throws
 *   loudly (set `NUXT_BACKEND_LOG_OTP=1` to echo codes to the dev console).
 * - `EMAIL_FROM` — falls back to the provider's onboarding sender.
 * - `EMAIL_TEST_MODE` — defaults to ON (anything but `'false'`).
 * - `EMAIL_WEBHOOK_SECRET` — delivery events are rejected until set.
 * - `BILLING_ACCESS_TOKEN` — billing queries return empty; checkout and other
 *   billing actions fail on invocation.
 * - `BILLING_WEBHOOK_SECRET` — billing events are rejected until set
 *   (`syncEntitlements` remains the on-demand fallback).
 * - `BILLING_ENVIRONMENT` — defaults to `'sandbox'`.
 *
 * The names are service-neutral on purpose: the package hides its underlying
 * providers behind the general capability (auth, email, billing).
 *
 * The scaffolded `convex.config.ts` declares these with
 * `defineApp({ env: backendEnv })` and forwards the `EMAIL_*` refs to the
 * `backend` component. Extend the set for your own vars (the env proxy
 * throws on undeclared ones):
 * `defineApp({ env: { ...backendEnv, MY_VAR: v.optional(v.string()) } })`.
 */
export const backendEnv = {
  // Auth — required.
  AUTH_SECRET: v.string(),
  SITE_URL: v.string(),
  // Dev ergonomics — optional. Set to "1" on a DEV deployment to also trust
  // http://localhost:* and http://127.0.0.1:* origins (the Nuxt dev server's
  // own port), so sign-in works without a hostname proxy in front of it.
  AUTH_TRUST_LOCAL_ORIGINS: v.optional(v.string()),
  // Email — optional; forwarded by reference to the `backend` component.
  EMAIL_API_KEY: v.optional(v.string()),
  EMAIL_FROM: v.optional(v.string()),
  EMAIL_TEST_MODE: v.optional(v.string()),
  EMAIL_WEBHOOK_SECRET: v.optional(v.string()),
  // Billing — optional.
  BILLING_ACCESS_TOKEN: v.optional(v.string()),
  BILLING_WEBHOOK_SECRET: v.optional(v.string()),
  BILLING_ENVIRONMENT: v.optional(v.union(v.literal('sandbox'), v.literal('production'))),
} satisfies EnvDefinition

/** The env declaration the scaffolded `convex.config.ts` passes to `defineApp`. */
export type BackendEnv = typeof backendEnv
