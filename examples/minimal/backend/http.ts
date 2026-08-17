import { registerBackendRoutes } from 'nuxt-backend/http'
import { httpRouter } from 'convex/server'
import { authComponent, createAuth } from './auth'
import { provider, webhookEvents } from './billing'
import { email } from './email'
import { ai } from './ai'

// Mounts every inbound route the backend handles: the auth routes, the
// billing events endpoint (/billing/events, BILLING_WEBHOOK_SECRET) that
// keeps the reactive feature/credit cache fresh and fulfils gifts, the
// email events endpoint (/email/events, EMAIL_WEBHOOK_SECRET) that makes
// useEmailStatus reactive, and the metered AI stream endpoint (/ai/stream).
// React to events via `setupBilling({ events })` / `setupEmail({ events })`.
const http = httpRouter()
registerBackendRoutes(http, {
  auth: { authComponent, createAuth },
  billing: { provider, webhookEvents },
  email,
  ai,
})

export default http
