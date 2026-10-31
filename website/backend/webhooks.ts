import { setupWebhooks } from 'nuxt-backend/admin'
import { components } from './_generated/api'

// The webhook delivery log of both providers (/billing/events and
// /email/events), for the app-wide admin role, read fresh on every call:
// the admin console's Webhooks tab and DevTools' webhook feed. Replay asks
// the provider to send a delivery again, signed, to the same route; it
// takes a recent sign-in and is recorded on the activity trail.
export const webhooks = setupWebhooks(components)

export const { getWebhookDeliveries, replayWebhookDelivery } = webhooks.api
