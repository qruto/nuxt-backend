import { registerBackendRoutes } from 'nuxt-backend/http'
import { httpRouter } from 'convex/server'
import { authComponent, createAuth } from './auth'
import { billing } from './billing'
import { email } from './email'

// CUSTOMIZATION: the inbound webhook endpoints live under /hooks/* instead of
// the default /billing/events and /email/events — point the provider
// dashboards at these paths.
const http = httpRouter()
registerBackendRoutes(http, {
  auth: { authComponent, createAuth },
  billing,
  email,
  billingPath: '/hooks/billing',
  emailPath: '/hooks/email',
})

export default http
