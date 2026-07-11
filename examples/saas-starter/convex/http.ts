import { registerBackendRoutes } from 'nuxt-backend/convex/http'
import { httpRouter } from 'convex/server'
import { authComponent, createAuth } from './auth'
import { polar, webhookEvents } from './billing'
import { email } from './email'

// Mounts every bundled service: Better Auth routes, the Polar webhook
// (default /polar/events, POLAR_WEBHOOK_SECRET) that keeps the reactive
// feature/credit cache fresh, and the Resend webhook (/resend-webhook,
// RESEND_WEBHOOK_SECRET) that makes useEmailStatus reactive. React to
// events via `setupBilling({ events })` / `setupEmail({ events })`.
const http = httpRouter()
registerBackendRoutes(http, {
  auth: { authComponent, createAuth },
  billing: { polar, webhookEvents },
  email,
})

export default http
