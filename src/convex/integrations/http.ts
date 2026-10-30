import { httpActionGeneric, type HttpRouter } from 'convex/server'
import { onEntityCreated, onEntityDeleting } from '../client/entities.js'
import { DEFAULT_HEALTH_PATH } from '../constants.js'
import { SIGNED_URL_PATH } from '../files.js'
import { UNSUBSCRIBE_ROUTE } from './email-preferences.js'
import { healthRoute } from './health.js'

/**
 * One call to mount every inbound route the backend handles on your Convex
 * HTTP router: the auth routes, the guarded
 * billing events endpoint (entitlement refresh + gift fulfilment), the
 * guarded email delivery-events endpoint (status tracking), the metered
 * AI stream endpoint, and the backend's health at `/backend/health` (a fixed
 * path: the app's `/api/backend/health` asks it there). Each part is
 * required: a route left unmounted fails only when a provider or a client
 * first calls it.
 *
 * The webhook endpoints share one fail-closed policy (see `webhook-guard.ts`):
 * missing secret → 503, invalid signature → 403 (±5 min replay tolerance),
 * oversized → 413, authentic-but-unknown type → 202, handler throw → 500 so
 * the provider retries, redelivery of a processed id → 200. Every request's
 * outcome lands in the component's delivery log.
 */
export interface RegisterBackendRoutesOptions {
  /**
   * From `setupAuth`: mounts the auth HTTP routes.
   */
  auth: {
    // Param types are `never` so any concrete `registerRoutes` signature is
    // assignable (function params are contravariant); called via a cast.
    authComponent: {
      registerRoutes: (...args: never[]) => void
      /** The account behind a request's session: the health route serves its detail to an admin. */
      safeGetAuthUser?: (ctx: never) => Promise<{ role?: string | null, banned?: boolean | null } | null | undefined>
    }
    createAuth: unknown
  }
  /**
   * From `setupBilling`: mounts the guarded billing events webhook at
   * {@link RegisterBackendRoutesOptions.billingPath} (fail-closed statuses,
   * redelivery dedupe, delivery logging — pass the whole `billing` instance).
   * Every workspace (or account, with `billTo: 'user'`) the auth routes make
   * is handed to it too, which starts the catalog's free plan for it, and
   * a workspace the auth routes delete is refused while it holds a paid
   * subscription.
   */
  billing: {
    webhookHandler: (ctx: never, request: Request) => Promise<Response>
    /** @internal */
    entityCreated?: (ctx: never, entity: { kind: 'workspace' | 'user', id: string }) => Promise<void>
    /** @internal */
    deletionRefusal?: (ctx: never, entity: { kind: 'workspace' | 'user', id: string }) => Promise<string | null>
  }
  /**
   * From `setupEmail`: mounts the email events webhook at
   * {@link RegisterBackendRoutesOptions.emailPath}, and the RFC 8058
   * one-click unsubscribe at `/email/unsubscribe` (`GET` sends the reader
   * to the unsubscribe page, `POST` unsubscribes at once).
   */
  email: {
    webhookHandler: (ctx: never, request: Request) => Promise<Response>
    /** @internal */
    preferences?: { unsubscribeHandler: (ctx: never, request: Request) => Promise<Response> }
  }
  /** From `setupAi`: mounts the metered stream endpoint at {@link RegisterBackendRoutesOptions.aiPath}. */
  ai: {
    httpHandler: unknown
    corsOrigin: string
  }
  /**
   * From `setupStorage`, when the app keeps files: mounts the route that
   * serves `storage.signedUrl`'s expiring URLs (`GET /storage/<id>`).
   * Without it, a signed URL answers 404.
   */
  storage?: {
    /** @internal */
    fileRoute: unknown
  }
  /** Route for the billing events webhook. Default `/billing/events`. */
  billingPath?: string
  /** Route for the email events webhook. Default `/email/events`. */
  emailPath?: string
  /** Route for the AI stream endpoint. Default `/ai/stream`. */
  aiPath?: string
  /**
   * The roles that count as admin for the backend's health: a session whose
   * account holds one reads the detail (each layer's reason, the env it
   * lacks). Default `['admin']`, as `createFunctions` takes them.
   */
  adminRoles?: readonly string[]
}

/**
 * The parts missing from the options, each with where it comes from. A part
 * the app passed can still arrive undefined: an import cycle leaves an
 * export unset while `http.ts` loads.
 */
function missingParts(options: RegisterBackendRoutesOptions): string[] {
  const { auth, billing, email, ai } = options as Partial<RegisterBackendRoutesOptions>
  return [
    typeof auth?.authComponent?.registerRoutes === 'function' ? null : 'auth (setupAuth\'s authComponent and createAuth)',
    typeof billing?.webhookHandler === 'function' ? null : 'billing (from setupBilling)',
    typeof email?.webhookHandler === 'function' ? null : 'email (from setupEmail)',
    ai?.httpHandler == null ? 'ai (from setupAi)' : null,
  ].filter(part => part !== null)
}

/**
 * Mount every route the backend serves on the app's HTTP router: the auth
 * routes, the billing and email webhooks, the
 * metered AI stream, and the health. Every part is required; a missing one throws,
 * naming it. `storage` is the one optional part: pass it when the app keeps
 * files, and `storage.signedUrl`'s expiring URLs are served.
 *
 * @example
 * ```ts
 * // convex/http.ts
 * import { registerBackendRoutes } from 'nuxt-backend/http'
 * import { httpRouter } from 'convex/server'
 * import { components } from './_generated/api'
 * import { ai } from './ai'
 * import { authComponent, createAuth } from './auth'
 * import { billing } from './billing'
 * import { email } from './email'
 *
 * const http = httpRouter()
 * registerBackendRoutes(http, { auth: { authComponent, createAuth }, billing, email, ai })
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
  // Each workspace (or account) the auth routes make starts on billing's free plan.
  const { entityCreated } = billing
  if (typeof auth.createAuth === 'function' && typeof entityCreated === 'function') {
    onEntityCreated(auth.createAuth, (ctx, entity) => entityCreated(ctx as never, entity))
  }
  // And a workspace that still holds a paid subscription is not deleted.
  const { deletionRefusal } = billing
  if (typeof auth.createAuth === 'function' && typeof deletionRefusal === 'function') {
    onEntityDeleting(auth.createAuth, (ctx, entity) => deletionRefusal(ctx as never, entity))
  }

  const post = (path: string, handle: (ctx: never, request: Request) => Promise<Response>): void => {
    http.route({
      path,
      method: 'POST',
      handler: httpActionGeneric((ctx, request) => handle(ctx as never, request)),
    })
  }
  post(options.billingPath ?? '/billing/events', billing.webhookHandler)
  post(options.emailPath ?? '/email/events', email.webhookHandler)
  // RFC 8058: the List-Unsubscribe header of every email sent under a topic points here.
  const unsubscribe = email.preferences?.unsubscribeHandler
  if (typeof unsubscribe === 'function') {
    for (const method of ['GET', 'POST'] as const) {
      http.route({ path: UNSUBSCRIBE_ROUTE, method, handler: httpActionGeneric((ctx, request) => unsubscribe(ctx as never, request)) })
    }
  }
  // The app's /api/backend/health asks it; an uptime check may too.
  http.route({ path: DEFAULT_HEALTH_PATH, method: 'GET', handler: healthRoute(auth.authComponent, options.adminRoles) })

  // Expiring private file URLs (storage.signedUrl), when the app keeps files.
  if (options.storage?.fileRoute) {
    http.route({ pathPrefix: SIGNED_URL_PATH, method: 'GET', handler: options.storage.fileRoute as Parameters<HttpRouter['route']>[0]['handler'] })
  }

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
