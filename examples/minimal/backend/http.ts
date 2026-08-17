import { registerBackendRoutes } from 'nuxt-backend/http'
import { httpRouter } from 'convex/server'
import { authComponent, createAuth } from './auth'
import { billing } from './billing'
import { email } from './email'
import { ai } from './ai'

// Mounts every inbound route the backend handles: the auth routes, the
// billing events endpoint (/billing/events, BILLING_WEBHOOK_SECRET) that
// keeps the reactive feature/credit cache fresh and fulfils gifts, the
// email events endpoint (/email/events, EMAIL_WEBHOOK_SECRET) that makes
// useEmailStatus reactive, and the metered AI stream endpoint (/ai/stream).
// Every webhook delivery is signature-verified, deduped, logged, and
// fail-closed (503 until its secret is set). React to events via
// `setupBilling({ events })` / `setupEmail({ events })`.
const http = httpRouter()
registerBackendRoutes(http, {
  auth: { authComponent, createAuth },
  billing,
  email,
  ai,
})

export default http
