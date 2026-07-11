import { httpActionGeneric, type HttpRouter } from 'convex/server'
import type { WebhookEventHandlers } from '@convex-dev/polar'

/**
 * One call to mount every service the backend bundles on your Convex HTTP
 * router. Signature verification stays where it already lives: Better Auth's
 * own routes, the Polar component (`POLAR_WEBHOOK_SECRET`), and the nested
 * Resend component (`RESEND_WEBHOOK_SECRET`) — this is composition, not
 * re-implementation. Per-service `registerRoutes` remain available when you
 * need custom routing.
 */
export interface RegisterBackendRoutesOptions {
  /** From `setupAuth`: mounts the Better Auth HTTP routes. */
  auth: {
    // Param types are `never` so any concrete `registerRoutes` signature is
    // assignable (function params are contravariant); called via a cast.
    authComponent: { registerRoutes: (...args: never[]) => void }
    createAuth: unknown
  }
  /** From `setupBilling`: mounts the Polar webhook (default path `/polar/events`). */
  billing?: {
    polar: { registerRoutes: (http: never, options: { events: WebhookEventHandlers }) => void }
    webhookEvents: WebhookEventHandlers
  }
  /** From `setupEmail`: mounts the Resend webhook at {@link RegisterBackendRoutesOptions.emailPath}. */
  email?: {
    webhookHandler: (ctx: never, request: Request) => Promise<Response>
  }
  /** Route for the Resend webhook. Default `/resend-webhook`. */
  emailPath?: string
}

/**
 * @example
 * ```ts
 * // convex/http.ts
 * import { registerBackendRoutes } from 'nuxt-backend/convex/http'
 * import { httpRouter } from 'convex/server'
 * import { components } from './_generated/api'
 * import { authComponent, createAuth } from './auth'
 * import billing from './billing'
 * import { email } from './email'
 *
 * const http = httpRouter()
 * registerBackendRoutes(http, { auth: { authComponent, createAuth }, billing, email })
 * export default http
 * ```
 */
export function registerBackendRoutes(http: HttpRouter, options: RegisterBackendRoutesOptions): void {
  const registerAuthRoutes = options.auth.authComponent.registerRoutes as (http: HttpRouter, createAuth: unknown) => void
  registerAuthRoutes(http, options.auth.createAuth)

  if (options.billing) {
    options.billing.polar.registerRoutes(http as never, { events: options.billing.webhookEvents })
  }

  if (options.email) {
    const { webhookHandler } = options.email
    http.route({
      path: options.emailPath ?? '/resend-webhook',
      method: 'POST',
      handler: httpActionGeneric((ctx, request) => webhookHandler(ctx as never, request)),
    })
  }
}
