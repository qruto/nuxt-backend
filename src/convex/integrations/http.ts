import { httpActionGeneric, type HttpRouter } from 'convex/server'
import type { BillingWebhookEventHandlers } from './billing'

/**
 * One call to mount every inbound webhook the backend handles on your Convex
 * HTTP router: the auth routes, the billing events endpoint (entitlement
 * refresh + gift fulfilment), and the email delivery-events endpoint (status
 * tracking). Signature verification stays where it already lives — the auth
 * routes, the billing component (`BILLING_WEBHOOK_SECRET`), and the email
 * component (`EMAIL_WEBHOOK_SECRET`) — this is composition, not
 * re-implementation. Per-service `registerRoutes` remain available when you
 * need custom routing.
 */
export interface RegisterBackendRoutesOptions {
  /** From `setupAuth`: mounts the auth HTTP routes. */
  auth: {
    // Param types are `never` so any concrete `registerRoutes` signature is
    // assignable (function params are contravariant); called via a cast.
    authComponent: { registerRoutes: (...args: never[]) => void }
    createAuth: unknown
  }
  /** From `setupBilling`: mounts the billing events webhook at {@link RegisterBackendRoutesOptions.billingPath}. */
  billing?: {
    provider: { registerRoutes: (http: never, options: { path?: string, events: BillingWebhookEventHandlers }) => void }
    webhookEvents: BillingWebhookEventHandlers
  }
  /** From `setupEmail`: mounts the email events webhook at {@link RegisterBackendRoutesOptions.emailPath}. */
  email?: {
    webhookHandler: (ctx: never, request: Request) => Promise<Response>
  }
  /** Route for the billing events webhook. Default `/billing/events`. */
  billingPath?: string
  /** Route for the email events webhook. Default `/email/events`. */
  emailPath?: string
}

/**
 * @example
 * ```ts
 * // convex/http.ts
 * import { registerBackendRoutes } from 'nuxt-backend/http'
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
    options.billing.provider.registerRoutes(http as never, {
      path: options.billingPath ?? '/billing/events',
      events: options.billing.webhookEvents,
    })
  }

  if (options.email) {
    const { webhookHandler } = options.email
    http.route({
      path: options.emailPath ?? '/email/events',
      method: 'POST',
      handler: httpActionGeneric((ctx, request) => webhookHandler(ctx as never, request)),
    })
  }
}
