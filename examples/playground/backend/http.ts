import { registerBackendRoutes } from 'nuxt-backend/http'
import { httpRouter } from 'convex/server'
import { ai } from './ai'
import { authComponent, createAuth, mcp } from './auth'
import { billing } from './billing'
import { email } from './email'

// Mounts every inbound route the backend handles: the auth routes, the
// billing events endpoint (/billing/events, BILLING_WEBHOOK_SECRET) — the
// consumer `events` handlers in billing.ts also log into the showcase feed —
// the email events endpoint (/email/events, EMAIL_WEBHOOK_SECRET) that makes
// useEmailStatus reactive, the metered AI stream endpoint (/ai/stream) that
// `useAiStream` drives, and the agent token exchange (/mcp/exchange) behind
// the app's MCP endpoint.
const http = httpRouter()
registerBackendRoutes(http, {
  auth: { authComponent, createAuth },
  billing,
  email,
  ai,
  mcp,
})

export default http
