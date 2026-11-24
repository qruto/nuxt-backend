import { v } from 'convex/values'
import { SESSION_TOKEN_AUDIENCE } from '../../constants.js'
import { mutation } from './_generated/server.js'

/**
 * The access tokens of Convex Auth sessions (`setupAuth({ provider:
 * 'convex-auth' })`), signed here with the deployment's own key
 * (`ctx.auth.signJwt`). Convex Auth's core component owns the session and
 * its refresh tokens, and mints a token of its own whose subject is the
 * session; the backend's functions read the caller from the claims the
 * Better Auth sessions carried (`sub` the user, `sessionId`, the active
 * workspace, `authTime`, the account's fields), so the app's auth layer
 * signs one with those, through this mutation.
 *
 * Minted in this component, the token's issuer is
 * `${CONVEX_CLOUD_URL}/components/backend`, the one
 * `defineBackendAuthConfig({ provider: 'convex-auth' })` trusts, with the
 * deployment's JWKS: no key of the app's to store or rotate.
 */

/** Claims Convex sets on every signed token, or reserves: never copied from the claims given. */
const RESERVED = new Set(['iss', 'iat', 'exp', 'nbf', 'aud', 'sub'])

/** Whether a claim name is Convex's own (`convex…`, `cvx…`, any case). */
function reservedPrefix(name: string): boolean {
  return /^(?:convex|cvx)/i.test(name)
}

export const mint = mutation({
  args: {
    subject: v.string(),
    claims: v.record(v.string(), v.any()),
    expiresInSeconds: v.number(),
  },
  returns: v.string(),
  handler: async (ctx, { subject, claims, expiresInSeconds }) => {
    // A claim of no JSON value would fail the signature; an undefined one is left out as JSON would.
    const own = Object.fromEntries(Object.entries(claims).filter(([name, value]) => value !== undefined && !RESERVED.has(name) && !reservedPrefix(name)))
    const lifetime = Math.min(3600, Math.max(1, Math.floor(expiresInSeconds)))
    return await ctx.auth.signJwt({
      claims: { ...own, sub: subject, aud: SESSION_TOKEN_AUDIENCE },
      expiresInSeconds: lifetime,
    })
  },
})
