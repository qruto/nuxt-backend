import { httpActionGeneric, type HttpRouter } from 'convex/server'
import { DEFAULT_MCP_EXCHANGE_PATH } from '../constants.js'

/**
 * One call to mount every inbound route the backend handles on your Convex
 * HTTP router: the auth routes, the agent (MCP) token exchange, the guarded
 * billing events endpoint (entitlement refresh + gift fulfilment), the
 * guarded email delivery-events endpoint (status tracking), and the metered
 * AI stream endpoint. Each part is required: a route left unmounted fails
 * only when a provider or a client first calls it.
 *
 * The webhook endpoints share one fail-closed policy (see `webhook-guard.ts`):
 * missing secret → 503, invalid signature → 403 (±5 min replay tolerance),
 * oversized → 413, authentic-but-unknown type → 202, handler throw → 500 so
 * the provider retries, redelivery of a processed id → 200. Every request's
 * outcome lands in the component's delivery log.
 */
export interface RegisterBackendRoutesOptions {
  /**
   * From `setupAuth`: mounts the auth HTTP routes, and the agent token
   * exchange (its `mcp` export) at {@link RegisterBackendRoutesOptions.mcpExchangePath},
   * where the Nuxt MCP gate trades agents' OAuth Bearers for short-lived
   * Convex JWTs.
   */
  auth: {
    // Param types are `never` so any concrete `registerRoutes` signature is
    // assignable (function params are contravariant); called via a cast.
    authComponent: { registerRoutes: (...args: never[]) => void }
    createAuth: unknown
    mcp: {
      exchangeHandler: (ctx: never, request: Request) => Promise<Response>
    }
  }
  /**
   * From `setupBilling`: mounts the guarded billing events webhook at
   * {@link RegisterBackendRoutesOptions.billingPath} (fail-closed statuses,
   * redelivery dedupe, delivery logging — pass the whole `billing` instance).
   */
  billing: {
    webhookHandler: (ctx: never, request: Request) => Promise<Response>
  }
  /** From `setupEmail`: mounts the email events webhook at {@link RegisterBackendRoutesOptions.emailPath}. */
  email: {
    webhookHandler: (ctx: never, request: Request) => Promise<Response>
  }
  /** From `setupAi`: mounts the metered stream endpoint at {@link RegisterBackendRoutesOptions.aiPath}. */
  ai: {
    httpHandler: unknown
    corsOrigin: string
  }
  /** Route for the billing events webhook. Default `/billing/events`. */
  billingPath?: string
  /** Route for the email events webhook. Default `/email/events`. */
  emailPath?: string
  /** Route for the AI stream endpoint. Default `/ai/stream`. */
  aiPath?: string
  /** Route for the agent token exchange. Default `/mcp/exchange`. */
  mcpExchangePath?: string
}

/**
 * The parts missing from the options, each with where it comes from. A part
 * the app passed can still arrive undefined: an import cycle leaves an
 * export unset while `http.ts` loads.
 */
function missingParts(options: RegisterBackendRoutesOptions): string[] {
  const { auth, billing, email, ai } = options as Partial<RegisterBackendRoutesOptions>
  return [
    typeof auth?.authComponent?.registerRoutes === 'function' && typeof auth.mcp?.exchangeHandler === 'function' ? null : 'auth (setupAuth\'s authComponent, createAuth and mcp)',
    typeof billing?.webhookHandler === 'function' ? null : 'billing (from setupBilling)',
    typeof email?.webhookHandler === 'function' ? null : 'email (from setupEmail)',
    ai?.httpHandler == null ? 'ai (from setupAi)' : null,
  ].filter(part => part !== null)
}

/**
 * @example
 * ```ts
 * // convex/http.ts
 * import { registerBackendRoutes } from 'nuxt-backend/http'
 * import { httpRouter } from 'convex/server'
 * import { components } from './_generated/api'
 * import { ai } from './ai'
 * import { authComponent, createAuth, mcp } from './auth'
 * import { billing } from './billing'
 * import { email } from './email'
 *
 * const http = httpRouter()
 * registerBackendRoutes(http, { auth: { authComponent, createAuth, mcp }, billing, email, ai })
 * export default http
 * ```
 */
export function registerBackendRoutes(http: HttpRouter, options: RegisterBackendRoutesOptions): void {
  // Checked before anything mounts, so a half-registered router never deploys.
  const missing = missingParts(options)
  if (missing.length > 0) {
    throw new Error(`[nuxt-backend] registerBackendRoutes is missing ${missing.join(', ')}. Every part is required: a route left out would answer 404 at its first call. If you passed it, an import cycle left it undefined while http.ts loaded.`)
  }

  const { auth, billing, email, ai } = options
  const registerAuthRoutes = auth.authComponent.registerRoutes as (http: HttpRouter, createAuth: unknown) => void
  registerAuthRoutes(http, auth.createAuth)

  const post = (path: string, handle: (ctx: never, request: Request) => Promise<Response>): void => {
    http.route({
      path,
      method: 'POST',
      handler: httpActionGeneric((ctx, request) => handle(ctx as never, request)),
    })
  }
  post(options.mcpExchangePath ?? DEFAULT_MCP_EXCHANGE_PATH, auth.mcp.exchangeHandler)
  post(options.billingPath ?? '/billing/events', billing.webhookHandler)
  post(options.emailPath ?? '/email/events', email.webhookHandler)

  const aiPath = options.aiPath ?? '/ai/stream'
  http.route({
    path: aiPath,
    method: 'POST',
    handler: ai.httpHandler as Parameters<HttpRouter['route']>[0]['handler'],
  })
  // Browser preflight for the cross-origin fetch the stream driver makes
  // (the app origin fetches the Convex site origin directly).
  http.route({
    path: aiPath,
    method: 'OPTIONS',
    handler: httpActionGeneric(async () => new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': ai.corsOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
      },
    })),
  })
}
