import type { EnvDefinition } from 'convex/server'
import { v } from 'convex/values'
import { type BackendEnvironment, parseBackendEnvironment } from './environment.js'

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
 * - `BACKEND_ENVIRONMENT` — the kind of deployment: `development`,
 *   `preview`, `sandbox` or `production`. `env push` derives it from the
 *   deployment; `sandbox` is the one value set by hand. Every mode follows
 *   from it (see `src/convex/environment.ts`): email test mode and the
 *   billing sandbox everywhere but `production`, the local origins trusted
 *   and the sign-in codes logged on `development` alone, and the name the
 *   backend's reports carry. Unset, every provider stays in its test mode and
 *   nothing local is trusted.
 * - `EMAIL_API_KEY` — sends no-op with a console warn, and a sign-in code
 *   or an invitation to a real address is refused with a 400 (on
 *   `development` the code prints to the dev console instead).
 * - `EMAIL_FROM` — falls back to the provider's onboarding sender, which
 *   reaches no real recipient: codes and invitations to one are refused.
 * - `EMAIL_MARKETING_FROM` — the sender of marketing mail (broadcasts), on a
 *   subdomain apart from `EMAIL_FROM`'s. Unset, marketing mail goes from
 *   `EMAIL_FROM`.
 * - `EMAIL_REGION` — the region the sending domain sends from (`us-east-1`,
 *   `eu-west-1`, `sa-east-1` or `ap-northeast-1`). The provider picks the
 *   region by the domain; the value records it for the checks.
 * - `EMAIL_WEBHOOK_SECRET` — delivery events are rejected until set.
 * - `EMAIL_DEV_INBOX` — `1` publishes the dev inbox to pages
 *   (`getSandboxInbox`) on a deployment outside production; `nuxt-backend
 *   dev` sets it on dev deployments. Unset, the page reader answers nothing.
 * - `BILLING_ACCESS_TOKEN` — billing queries return empty; checkout and other
 *   billing actions fail on invocation.
 * - `BILLING_WEBHOOK_SECRET` — billing events are rejected until set
 *   (`syncEntitlements` remains the on-demand fallback).
 * - `AI_GATEWAY_API_KEY` — the Vercel AI Gateway's own name, read as it is:
 *   where a `provider/model` id goes when the Convex AI Gateway does not
 *   answer it (a free plan, a self-hosted deployment). Without either, the id
 *   is refused when called.
 * - `PROVENANCE_PRIVATE_KEY`, `PROVENANCE_CERTIFICATE` — the key that signs
 *   the content credentials `ctx.storeImage` writes (`setupAi({ provenance })`)
 *   and its certificate chain. Unset, generated images carry the IPTC source
 *   type and no signed manifest. `env push` generates both.
 * - `PROTECTION_PROOF_SECRET` — the auth routes that send a code take no
 *   proof of a bot check until set; the app's server signs proofs with the
 *   same value (`verifyHuman` takes them too).
 * - `PROTECTION_CHALLENGE_SECRET_KEY` — those routes take no challenge
 *   answer until set; the deployment verifies each with the provider.
 * - `MONITORING_DSN` — where the backend posts error reports from its
 *   actions and its cron check-ins (forwarded to the `backend` component
 *   for its maintenance cron). Unset: nothing is reported from the backend;
 *   the browser and the Nuxt server report on their own DSN.
 *
 * The names are service-neutral on purpose: the package hides its underlying
 * providers behind the general capability (auth, email, billing, protection).
 *
 * The scaffolded `convex.config.ts` declares these with
 * `defineApp({ env: backendEnv })` and forwards the `EMAIL_*`,
 * `BACKEND_ENVIRONMENT` and `MONITORING_DSN` refs to the `backend` component.
 * Extend the set for your own vars (the env proxy throws on undeclared ones):
 * `defineApp({ env: { ...backendEnv, MY_VAR: v.optional(v.string()) } })`.
 */
export const backendEnv = {
  // Auth — required.
  AUTH_SECRET: v.string(),
  SITE_URL: v.string(),
  // The kind of deployment — optional; forwarded by reference to the `backend`
  // component. A value outside the four fails the deploy.
  BACKEND_ENVIRONMENT: v.optional(v.union(v.literal('development'), v.literal('preview'), v.literal('sandbox'), v.literal('production'))),
  // Email — optional; forwarded by reference to the `backend` component.
  EMAIL_API_KEY: v.optional(v.string()),
  EMAIL_FROM: v.optional(v.string()),
  EMAIL_MARKETING_FROM: v.optional(v.string()),
  EMAIL_REGION: v.optional(v.union(v.literal('us-east-1'), v.literal('eu-west-1'), v.literal('sa-east-1'), v.literal('ap-northeast-1'))),
  EMAIL_WEBHOOK_SECRET: v.optional(v.string()),
  // The dev inbox's page reader, opted into with `1` outside production; read by the app's own getSandboxInbox, never forwarded.
  EMAIL_DEV_INBOX: v.optional(v.string()),
  // Billing — optional.
  BILLING_ACCESS_TOKEN: v.optional(v.string()),
  BILLING_WEBHOOK_SECRET: v.optional(v.string()),
  // AI — optional; the gateway's own name, never renamed.
  AI_GATEWAY_API_KEY: v.optional(v.string()),
  // AI provenance — optional: the key content credentials are signed with, and its certificate chain.
  PROVENANCE_PRIVATE_KEY: v.optional(v.string()),
  PROVENANCE_CERTIFICATE: v.optional(v.string()),
  // Web push — optional: the deployment's VAPID key pair, which env push generates; read by the app's own setupNotifications, never forwarded.
  PUSH_PUBLIC_KEY: v.optional(v.string()),
  PUSH_PRIVATE_KEY: v.optional(v.string()),
  // Bot protection — optional: the proof the app's server signs once its bot
  // check passed, and the challenge provider's secret key.
  PROTECTION_PROOF_SECRET: v.optional(v.string()),
  PROTECTION_CHALLENGE_SECRET_KEY: v.optional(v.string()),
  // Monitoring — optional; forwarded by reference to the `backend` component.
  MONITORING_DSN: v.optional(v.string()),
} satisfies EnvDefinition

/** The env declaration the scaffolded `convex.config.ts` passes to `defineApp`. */
export type BackendEnv = typeof backendEnv

export type { BackendEnvironment } from './environment.js'

/**
 * The kind of deployment your functions run on, as its `BACKEND_ENVIRONMENT`
 * says: `development`, `preview`, `sandbox` or `production`. `undefined`
 * when it is unset or none of the four, which every mode of the package
 * reads as the safe one: providers in their test modes, nothing local
 * trusted. Read it where your own code behaves differently on a demo or a
 * preview, the same way the package's email, billing and auth do.
 *
 * @example
 * ```ts [backend/strips.ts]
 * import { backendEnvironment } from 'nuxt-backend/app'
 *
 * // A public demo draws from canned ideas only.
 * const demo = backendEnvironment() === 'sandbox'
 * ```
 */
export function backendEnvironment(): BackendEnvironment | undefined {
  return parseBackendEnvironment((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.BACKEND_ENVIRONMENT)
}
