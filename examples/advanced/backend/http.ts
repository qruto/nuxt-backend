import { registerBackendRoutes } from 'nuxt-backend/http'
import { httpRouter } from 'convex/server'
import { authComponent, createAuth, mcp } from './auth'
import { billing } from './billing'
import { email } from './email'
import { ai } from './ai'

// The same routes the scaffold mounts (auth, billing + email events, the
// metered AI stream, the agent token exchange).
// CUSTOMIZATION: the inbound webhook endpoints live under /hooks/* instead of
// the default /billing/events and /email/events — point the provider
// dashboards at these paths.
const http = httpRouter()
registerBackendRoutes(http, {
  auth: { authComponent, createAuth },
  billing,
  email,
  ai,
  mcp,
  billingPath: '/hooks/billing',
  emailPath: '/hooks/email',
})

export default http
