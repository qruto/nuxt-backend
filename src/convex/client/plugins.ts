import { passkey } from '@better-auth/passkey'
import type { BetterAuthOptions } from 'better-auth/minimal'
import { jwt, mcp } from 'better-auth/plugins'
import { BACKEND_MCP_SCOPES, DEFAULT_AGENT_CONSENT_PATH, DEFAULT_LOGIN_PATH } from '../constants.js'
import type { McpAuthOptions } from './auth-types.js'
import { readEnv } from './runtime.js'

// How the packaged default plugins are built. The order they join the plugin
// list in, which matters, is `buildAuthOptions`' concern
// (better-auth-options.ts).

/**
 * The plugin element type of `BetterAuthOptions.plugins`. The mcp/jwt default
 * plugins are widened to it because their concrete return types reference
 * option types better-auth doesn't export (`MCPOptions`) — declaration emit
 * of `buildAuthOptions` would fail on the unnameable type. Their
 * endpoints stay callable (the exchange reads them structurally).
 */
export type DefaultAuthPlugin = NonNullable<BetterAuthOptions['plugins']>[number]

/**
 * Default passkey plugin. Registration requires an authenticated session (the
 * plugin's default), so a passkey can only be added to an account whose email
 * has already been proven via the OTP sign-in flow.
 *
 * This deliberately omits passkey-first (pre-auth) account creation: minting an
 * account + session from a WebAuthn ceremony over an unverified, client-typed
 * email lets an attacker squat on or pre-hijack a victim's email (they plant a
 * passkey before the victim signs up, then the victim's later OTP sign-in
 * verifies the email while the attacker's passkey persists — account takeover).
 * New users sign up with OTP, then add a passkey from their authenticated
 * session (the `add-passkey` step of `useLoginFlow`).
 *
 * Override by passing your own `passkey(...)` plugin in `authOptions.plugins`.
 */
export function defaultPasskey() {
  return passkey()
}

/** The identity scopes the mcp plugin always offers on its own. */
const OIDC_IDENTITY_SCOPES = ['openid', 'profile', 'email']

/**
 * The agent OAuth provider: better-auth's mcp plugin over the login and
 * consent pages, requiring PKCE (S256), and offering `BACKEND_MCP_SCOPES`
 * (plus consumer extras) so agents can request the built-in tools' scopes.
 * `agentConsent()` makes the consent step unconditional.
 */
export function defaultMcp(options: McpAuthOptions | undefined): DefaultAuthPlugin {
  const loginPage = options?.loginPath ?? DEFAULT_LOGIN_PATH
  return mcp({
    loginPage,
    oidcConfig: {
      // Overridden by the plugin with the top-level value; present because
      // the OIDC options type requires it.
      loginPage,
      consentPage: options?.consentPath ?? DEFAULT_AGENT_CONSENT_PATH,
      requirePKCE: true,
      // The plugin appends these to its identity-scope defaults
      // (openid/profile/email/offline_access).
      scopes: [
        ...BACKEND_MCP_SCOPES.filter(scope => !OIDC_IDENTITY_SCOPES.includes(scope)),
        ...options?.scopes ?? [],
      ],
      // The advertised catalog (`scopes_supported`) doesn't include custom
      // scopes on its own — mirror the full offer unless overridden.
      metadata: {
        scopes_supported: [...new Set([...BACKEND_MCP_SCOPES, 'offline_access', ...options?.scopes ?? []])],
      },
    },
  }) as DefaultAuthPlugin
}

/** The jwt plugin's own option shape (for the date-fix adapter override). */
type JwtPluginOptions = NonNullable<Parameters<typeof jwt>[0]>
type JwtAdapterOverride = NonNullable<JwtPluginOptions['adapter']>
type JwksRow = { createdAt: Date, expiresAt?: Date | null } & Record<string, unknown>

/**
 * The jwt plugin for the **sign-only** better-auth instance (see `setupAuth`)
 * — aligned with the convex plugin's internal signer: same `jwks` table and
 * RS256 keys, issuer/audience matching the `auth.config` validator, and the
 * same date-fix adapter override (the Convex database adapter returns `date`
 * fields as numbers while the jwt plugin internals call `.getTime()` on
 * them). Its server-only `auth.api.signJWT` mints the `/mcp/exchange` Convex
 * JWTs; sharing the latest `jwks` row gives minted tokens a `kid` the
 * validator's JWKS endpoint serves. It must NOT join the main instance's
 * plugin list: better-auth dedupes plugins by id, and a top-level `jwt`
 * displaces the convex plugin's internal custom-path jwt (404ing
 * `/convex/token`).
 */
export function convexSignerJwt() {
  const adapter: JwtAdapterOverride = {
    createJwk: async (webKey, ctx) => {
      return await ctx!.context.adapter.create({
        model: 'jwks',
        data: { ...webKey, createdAt: new Date() },
      })
    },
    getJwks: async (ctx) => {
      const keys = await ctx!.context.adapter.findMany<JwksRow>({
        model: 'jwks',
        sortBy: { field: 'createdAt', direction: 'desc' },
      })
      return keys.map(key => ({
        ...key,
        createdAt: new Date(key.createdAt as unknown as number),
        ...(key.expiresAt ? { expiresAt: new Date(key.expiresAt as unknown as number) } : {}),
      })) as never
    },
  }
  return jwt({
    // The `set-auth-jwt` header hook would sign a token on every get-session
    // round trip — the convex plugin already owns session-token issuance.
    disableSettingJwtHeader: true,
    jwt: {
      issuer: readEnv('CONVEX_SITE_URL') ?? '',
      audience: 'convex',
    },
    jwks: { keyPairConfig: { alg: 'RS256' } },
    adapter,
  }) as DefaultAuthPlugin
}
