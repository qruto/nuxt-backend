import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthEndpoint, createAuthMiddleware, getSessionFromCtx, sessionMiddleware } from 'better-auth/api'

/** The signed cookie the OAuth provider keeps a pending consent code in. */
const CONSENT_COOKIE = 'oidc_consent_prompt'

/** A pending authorization as the provider stores it, keyed by its code. */
interface PendingAuthorization {
  clientId: string
  redirectURI: string
  scope: string[]
  userId: string
  requireConsent?: boolean
}

/** What the consent page shows the person before they decide. */
export interface AgentConsentRequest {
  clientId: string
  /** The name the agent registered under: self-declared, never verified. */
  clientName: string | null
  /** The host approving sends the browser (and the authorization code) to. */
  redirectHost: string
  /** Every scope the agent asked for. */
  scopes: string[]
  /** When the request lapses, in epoch milliseconds. */
  expiresAt: number
}

type HookCtx = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0]

/** The consent code a request carries: in its body, else the provider's signed cookie. */
async function consentCode(ctx: HookCtx): Promise<string | null> {
  const fromBody = (ctx.body as { consent_code?: unknown } | undefined)?.consent_code
  if (typeof fromBody === 'string' && fromBody) return fromBody
  const fromCookie = await ctx.getSignedCookie(CONSENT_COOKIE, ctx.context.secret)
  return typeof fromCookie === 'string' && fromCookie ? fromCookie : null
}

/** The live authorization behind a code, or null when it is unknown or expired. */
async function pendingAuthorization(ctx: HookCtx, code: string): Promise<{ value: PendingAuthorization, expiresAt: Date } | null> {
  const verification = await ctx.context.internalAdapter.findVerificationValue(code)
  if (!verification || verification.expiresAt < new Date()) return null
  try {
    return { value: JSON.parse(verification.value) as PendingAuthorization, expiresAt: verification.expiresAt }
  }
  catch {
    return null
  }
}

/** The fields of a token request, whether it arrived as JSON or as a form. */
function tokenRequest(body: unknown): { grantType?: unknown, code?: unknown } {
  const fields = body instanceof FormData ? Object.fromEntries(body.entries()) : body as Record<string, unknown> | undefined
  return { grantType: fields?.grant_type, code: fields?.code }
}

const EXPIRED = 'This request has expired or was already answered. Start again from the agent.'

/**
 * Consent for every agent authorization, enforced around Better Auth's mcp
 * plugin rather than trusted to the agent:
 *
 * - `/mcp/authorize` always runs with `prompt=consent`, so the provider sends
 *   the person to the consent page instead of handing the agent a code.
 * - `/mcp/token` refuses a code still waiting for consent. The provider's own
 *   token endpoint does not check, so a leaked consent code would otherwise
 *   trade for a token without anyone approving it.
 * - `/oauth2/consent` answers only the account the request was made for, and
 *   an administrator impersonating that account cannot approve.
 * - `POST /agent-consent/request` tells the consent page what is being asked,
 *   read from the stored request rather than from the page's URL, which the
 *   agent wrote.
 */
export function agentConsent(): BetterAuthPlugin {
  return {
    id: 'agent-consent',
    hooks: {
      before: [
        {
          matcher: ctx => ctx.path === '/mcp/authorize',
          handler: createAuthMiddleware(async ctx => ({ context: { query: { ...ctx.query, prompt: 'consent' } } })),
        },
        {
          matcher: ctx => ctx.path === '/mcp/token',
          handler: createAuthMiddleware(async (ctx) => {
            const { grantType, code } = tokenRequest(ctx.body)
            if (grantType !== 'authorization_code' || typeof code !== 'string') return
            const pending = await pendingAuthorization(ctx, code)
            if (pending?.value.requireConsent) {
              throw new APIError('UNAUTHORIZED', { error: 'invalid_grant', error_description: 'The user has not approved this request.' })
            }
          }),
        },
        {
          matcher: ctx => ctx.path === '/oauth2/consent',
          handler: createAuthMiddleware(async (ctx) => {
            const session = await getSessionFromCtx(ctx).catch(() => null)
            if (!session) return
            const code = await consentCode(ctx)
            const pending = code ? await pendingAuthorization(ctx, code) : null
            if (pending && pending.value.userId !== session.user.id) {
              throw new APIError('FORBIDDEN', { message: 'This request was made for another account.' })
            }
            const accept = (ctx.body as { accept?: unknown } | undefined)?.accept === true
            if (accept && (session.session as { impersonatedBy?: string | null }).impersonatedBy) {
              throw new APIError('FORBIDDEN', { message: 'An administrator acting as this account cannot approve an agent.' })
            }
          }),
        },
      ],
    },
    endpoints: {
      agentConsentRequest: createAuthEndpoint('/agent-consent/request', {
        method: 'POST',
        use: [sessionMiddleware],
      }, async (ctx) => {
        const code = await consentCode(ctx as unknown as HookCtx)
        const pending = code ? await pendingAuthorization(ctx as unknown as HookCtx, code) : null
        if (!pending?.value.requireConsent || pending.value.userId !== ctx.context.session.user.id) {
          throw new APIError('NOT_FOUND', { message: EXPIRED })
        }
        const client = await ctx.context.adapter.findOne<{ name?: string | null }>({
          model: 'oauthApplication',
          where: [{ field: 'clientId', value: pending.value.clientId }],
        })
        const request: AgentConsentRequest = {
          clientId: pending.value.clientId,
          clientName: client?.name ?? null,
          redirectHost: new URL(pending.value.redirectURI).host,
          scopes: pending.value.scope,
          expiresAt: pending.expiresAt.getTime(),
        }
        return ctx.json(request)
      }),
    },
  } satisfies BetterAuthPlugin
}
