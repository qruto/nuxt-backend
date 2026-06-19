import { setupEmail } from 'nuxt-backend/convex/email'
import { httpRouter } from 'convex/server'
import { components } from './_generated/api'
import { httpAction } from './_generated/server'
import { authComponent, createAuth } from './auth'
import { polar, webhookEvents } from './billing'

const http = httpRouter()
authComponent.registerRoutes(http, createAuth)

const email = setupEmail(components.backend)

// Polar webhooks (default path /polar/events). The component auto-persists
// subscriptions/products; `webhookEvents` (from billing.ts) logs each event to the
// showcase feed and refreshes the reactive feature/credit cache. Set
// POLAR_WEBHOOK_SECRET to verify signatures.
polar.registerRoutes(http, { events: webhookEvents })

// Resend delivery/bounce/open webhooks → advance email status (makes
// useEmailStatus reactive). Set RESEND_WEBHOOK_SECRET to verify signatures.
http.route({
  path: '/resend-webhook',
  method: 'POST',
  handler: httpAction(async (ctx, request) => email.webhookHandler(ctx, request)),
})

export default http
