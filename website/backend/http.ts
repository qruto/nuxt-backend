import { registerBackendRoutes } from 'nuxt-backend/http'
import { httpRouter } from 'convex/server'
import { authComponent, createAuth, mcp } from './auth'
import { billing } from './billing'
import { email } from './email'

// Mounts every inbound webhook the backend handles: the auth routes, the
// billing events endpoint (/billing/events, BILLING_WEBHOOK_SECRET) —
// `webhookEvents` (from billing.ts) also logs each event to the showcase
// feed — the email events endpoint (/email/events, EMAIL_WEBHOOK_SECRET)
// that makes useEmailStatus reactive, and the agent token exchange
// (/mcp/exchange) behind the app's MCP endpoint.
const http = httpRouter()
registerBackendRoutes(http, {
  auth: { authComponent, createAuth },
  billing,
  email,
  mcp,
})

export default http
