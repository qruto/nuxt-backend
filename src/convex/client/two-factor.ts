import type { BetterAuthPlugin } from 'better-auth'
import { twoFactor } from 'better-auth/plugins'

// The authenticator app: a second factor after the sign-in code, for an
// account that turns it on. Better Auth's two-factor plugin holds the
// secret (encrypted under the auth secret), the backup codes and the
// challenge between the two steps; it asks for the second factor after a
// password sign-in only, and the package has none, so its own step runs
// here after the code. A passkey is a second factor of its own (the device,
// and the person's fingerprint or PIN), so a passkey sign-in asks for none.

/** The routes after which an account with an authenticator app is asked for its code. */
const FIRST_FACTOR_ROUTES: ReadonlySet<string> = new Set(['/sign-in/email-otp'])

/** The id of the step that asks for the second factor after a code. */
export const TWO_FACTOR_STEP_PLUGIN_ID = 'two-factor-after-code'

/** How long the second step waits for the app's code, in seconds. */
export const TWO_FACTOR_CHALLENGE_SECONDS = 600

/** How long a device the person trusted skips the second step, in seconds (thirty days). */
export const TRUSTED_DEVICE_SECONDS = 30 * 24 * 60 * 60

type TwoFactorPlugin = ReturnType<typeof twoFactor>

/**
 * Better Auth's two-factor plugin as the package runs it: TOTP from an
 * authenticator app, with backup codes, turned on and off without a
 * password (the package's accounts have none; the request guard asks for a
 * recent sign-in instead), and no emailed second code (the first factor is
 * one already).
 *
 * @internal
 */
export function defaultTwoFactor(): TwoFactorPlugin {
  return twoFactor({
    allowPasswordless: true,
    twoFactorCookieMaxAge: TWO_FACTOR_CHALLENGE_SECONDS,
    trustDeviceMaxAge: TRUSTED_DEVICE_SECONDS,
    backupCodeOptions: { storeBackupCodes: 'encrypted' },
  })
}

/**
 * The second step after a sign-in code: the two-factor plugin's own, run on
 * {@link FIRST_FACTOR_ROUTES}. An account with the app turned on gets
 * `{ twoFactorRedirect: true, twoFactorMethods }` and no session; the code
 * from the app (`/two-factor/verify-totp`) or a backup code then opens it.
 *
 * @internal
 */
export function twoFactorAfterCode(plugin: TwoFactorPlugin): BetterAuthPlugin {
  const step = plugin.hooks.after[0]!
  return {
    id: TWO_FACTOR_STEP_PLUGIN_ID,
    hooks: {
      after: [{ matcher: context => FIRST_FACTOR_ROUTES.has(context.path ?? ''), handler: step.handler }],
    },
  } satisfies BetterAuthPlugin
}
