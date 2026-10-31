// The kind of deployment the backend runs on, and every mode that follows
// from it. `BACKEND_ENVIRONMENT` is the one variable: email's test mode,
// the billing sandbox, the local origins auth trusts, the sign-in codes in
// the logs and the name the backend's reports carry all read it, so they
// never drift apart. Pure and runtime-neutral: the Convex runtime, the
// component and the CLI share it.

/** The kind of deployment the backend runs on. */
export type BackendEnvironment = 'development' | 'preview' | 'sandbox' | 'production'

/** The four kinds of deployment, in the order the docs list them. */
export const BACKEND_ENVIRONMENTS = ['development', 'preview', 'sandbox', 'production'] as const satisfies readonly BackendEnvironment[]

/**
 * The environment a value names, `undefined` for an unset or unknown one.
 * Unknown is never `production`: a mistyped value keeps every provider in
 * its test mode and trusts nothing local.
 */
export function parseBackendEnvironment(value: string | undefined | null): BackendEnvironment | undefined {
  const trimmed = value?.trim()
  return (BACKEND_ENVIRONMENTS as readonly string[]).includes(trimmed ?? '') ? trimmed as BackendEnvironment : undefined
}

/**
 * Whether the providers run live: only `production`. Every other kind,
 * and an unset value, keeps email in its test mode and billing in the
 * provider's sandbox.
 */
export function isLive(environment: BackendEnvironment | undefined): boolean {
  return environment === 'production'
}

/** The billing environment this kind bills in: the provider's production only on `production`, its sandbox otherwise. */
export function billingEnvironment(environment: BackendEnvironment | undefined): 'sandbox' | 'production' {
  return isLive(environment) ? 'production' : 'sandbox'
}

/**
 * Whether an administrator's action that reaches a provider for real (a
 * webhook replay, lifting a suppression) runs here: on `production` and
 * `development` alone. A sandbox (a public demo, where anyone may be an
 * administrator), a preview, and an unset or mistyped value refuse it.
 */
export function runsProviderAdminActions(environment: BackendEnvironment | undefined): boolean {
  return environment === 'production' || environment === 'development'
}

/**
 * Whether an administrator must be passkey-only to act as one: on
 * `sandbox` alone, a public demo whose dev inbox anyone may read, so a
 * sign-in code read there never reaches the admin tier or the console.
 */
export function requiresPasskeyOnlyAdmins(environment: BackendEnvironment | undefined): boolean {
  return environment === 'sandbox'
}

/** Whether the local origins (loopback on any port, `.localhost` names over https) are trusted: on `development` alone. */
export function trustsLocalOrigins(environment: BackendEnvironment | undefined): boolean {
  return environment === 'development'
}

/** Whether a sign-in code with nowhere to go may print to the logs: on `development` alone. */
export function logsSignInCodes(environment: BackendEnvironment | undefined): boolean {
  return environment === 'development'
}

/**
 * Whether the dev inbox answers pages (`getSandboxInbox`): opted into with
 * `EMAIL_DEV_INBOX=1`, on a deployment that says what kind it is and is not
 * production. `nuxt-backend dev` sets the flag on dev deployments; a preview
 * or a deliberate sandbox sets it by hand.
 */
export function publishesDevInbox(environment: BackendEnvironment | undefined, flag: string | undefined | null): boolean {
  return flag?.trim() === '1' && environment !== undefined && !isLive(environment)
}
