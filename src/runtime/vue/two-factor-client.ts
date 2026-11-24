import type { twoFactorClient as betterAuthTwoFactorClient } from 'better-auth/client/plugins'

/** Better Auth's two-factor client plugin, as `twoFactorClient()` from `better-auth/client/plugins` returns it. */
export type TwoFactorClientPlugin = ReturnType<typeof betterAuthTwoFactorClient>

/**
 * Better Auth's two-factor client plugin without its error-code table and
 * its redirect: the sign-in form reads `twoFactorRedirect` off the sign-in
 * code's answer itself (`useLoginFlow`'s `two-factor` step), so the page
 * stays where it is. What is left is the routes' methods and the session
 * signal after each, as in Better Auth's. Every page's entry carries the
 * client's plugins (see ./admin-client), so its `$ERROR_CODES`, type-level
 * for a client plugin, stays out.
 *
 * test/unit/role-clients.test.ts holds it to Better Auth's own plugin.
 */
export function twoFactorClient(): TwoFactorClientPlugin {
  const plugin: Omit<TwoFactorClientPlugin, 'version' | '$ERROR_CODES' | 'fetchPlugins'> = {
    id: 'two-factor',
    // Type-level only, as in Better Auth's plugin: the server plugin it pairs with.
    $InferServerPlugin: {} as TwoFactorClientPlugin['$InferServerPlugin'],
    atomListeners: [{ matcher: path => path.startsWith('/two-factor/'), signal: '$sessionSignal' }],
    pathMethods: {
      '/two-factor/disable': 'POST',
      '/two-factor/enable': 'POST',
      '/two-factor/send-otp': 'POST',
      '/two-factor/generate-backup-codes': 'POST',
      '/two-factor/get-totp-uri': 'POST',
      '/two-factor/verify-totp': 'POST',
      '/two-factor/verify-otp': 'POST',
      '/two-factor/verify-backup-code': 'POST',
    },
  }
  return plugin as TwoFactorClientPlugin
}
