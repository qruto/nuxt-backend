// Whether a message would arrive at all: the reading the code sender, the
// auth request guard and gift fulfilment all take of the deployment's email
// settings. Runtime-neutral, so the auth and billing integrations share it.

import { backendEnvironment } from './app.js'
import { isLive, logsSignInCodes, runsProviderAdminActions } from './environment.js'
import { backendError } from './errors.js'

type EnvHost = { process?: { env?: Record<string, string | undefined> } }

/**
 * A deployment environment variable, read where the Convex runtime puts them;
 * `undefined` where `process.env` is absent. The one reader the auth side
 * shares (`client/runtime.ts` re-exports it).
 */
export function readEnv(name: string): string | undefined {
  return (globalThis as EnvHost).process?.env?.[name]
}

/**
 * The email provider's test addresses, `+label` aliases included: the only
 * ones test mode sends to, and the only ones the dev inbox reads.
 */
const SANDBOX_ADDRESS = /^(?:delivered|bounced|complained)(?:\+[^@\s]+)?@resend\.dev$/

/** Whether an address is one of the provider's test addresses, whatever the deployment's mode. */
export function isSandboxAddress(email: string): boolean {
  return SANDBOX_ADDRESS.test(email.trim().toLowerCase())
}

// The kind of deployment, as its `BACKEND_ENVIRONMENT` says: the app reads
// the same function from `nuxt-backend/app`.
export { backendEnvironment }

/**
 * Refuse an administrator's action that reaches a provider for real outside
 * `production` and `development`, as `not_ready`: reason `sandbox` on a
 * sandbox, `environment` on a preview or with `BACKEND_ENVIRONMENT` unset or
 * mistyped. An allow-list, so a deployment that says nothing refuses.
 */
export function requireProviderAdminEnvironment(what: string, effect: string): void {
  const environment = backendEnvironment()
  if (runsProviderAdminActions(environment)) return
  const kind = environment ? `BACKEND_ENVIRONMENT=${environment}` : 'BACKEND_ENVIRONMENT unset or not one of the four'
  throw backendError('not_ready', { reason: environment === 'sandbox' ? 'sandbox' : 'environment' }, `[nuxt-backend] ${what}: ${effect}, so it runs on a production or development deployment alone (this one: ${kind}).`)
}

/**
 * Whether sign-in codes may print to the logs: on a `development`
 * deployment alone. Anywhere else a live credential stays out of them.
 */
export function logsOtp(): boolean {
  return logsSignInCodes(backendEnvironment())
}

/** Why a message would not arrive: see {@link undeliverableReason}. */
export type UndeliverableReason = 'no-key' | 'test-mode' | 'no-sender'

/**
 * Why a message to `address` would not arrive, or `null` when it would — the
 * same reading the component's send makes. Without EMAIL_API_KEY nothing is
 * sent, and a sign-in code can be echoed to the logs (`echo`); anything else
 * is gone. In test mode the provider accepts only its test addresses. Out of
 * test mode the fallback sender (the provider's onboarding address) reaches only those and
 * the provider account's own address, which the deployment cannot tell from
 * any other, so a real address needs EMAIL_FROM.
 */
export function undeliverableReason(address: string, options: { echo?: boolean } = {}): UndeliverableReason | null {
  const testMode = !isLive(backendEnvironment())
  const sandbox = SANDBOX_ADDRESS.test(address.trim().toLowerCase())
  if (!readEnv('EMAIL_API_KEY')) return options.echo ? null : 'no-key'
  if (testMode) return sandbox ? null : 'test-mode'
  return readEnv('EMAIL_FROM') || sandbox ? null : 'no-sender'
}

/** What the operator reads in the logs, per reason: the setting to change. */
export const UNDELIVERABLE_CAUSES: Readonly<Record<UndeliverableReason, string>> = {
  'no-key': 'EMAIL_API_KEY is not set on the deployment, so nothing is sent (a sign-in code still prints in the dev console on a development deployment).',
  'test-mode': 'BACKEND_ENVIRONMENT is not production, so the email provider accepts only its test addresses. A production deployment (BACKEND_ENVIRONMENT=production) delivers to every address once your domain is verified.',
  'no-sender': 'EMAIL_FROM is not set, and the fallback sender reaches only the provider\'s test addresses and your own account\'s address. Set it to an address on your verified domain.',
}
