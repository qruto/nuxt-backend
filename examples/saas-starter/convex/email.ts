import { setupEmail } from 'nuxt-backend/convex/email'
import { v } from 'convex/values'
import { api, components } from './_generated/api'
import { action } from './_generated/server'

// Transactional + marketing email over the Resend component nested in
// `backend`. Set RESEND_API_KEY to enable delivery (else it logs).
// React to delivery events with `setupEmail(components.backend, { events:
// { onBounced: async (ctx, event) => { ... } } })`.
export const email = setupEmail(components.backend)

// Reactive delivery-status query behind the `useEmailStatus` composable.
export const { getEmailStatus } = email.api

// Send a transactional email (gated: requires a signed-in user). The same
// nested Resend transport powers auth OTP / verification / welcome.
export const send = action({
  args: { to: v.string(), subject: v.string(), html: v.optional(v.string()), text: v.optional(v.string()) },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(api.auth.getAuthUser, {})
    if (!user) throw new Error('Sign in to send email.')
    return email.send(ctx, args)
  },
})

// Marketing (audiences / contacts / broadcasts) via the Resend SDK. Treat as
// admin actions — add your own authorization before exposing to clients.
export const createAudience = action({
  args: { name: v.string() },
  handler: async (ctx, { name }) => email.audiences.create({ name }),
})
export const addContact = action({
  args: { audienceId: v.string(), email: v.string(), firstName: v.optional(v.string()), lastName: v.optional(v.string()) },
  handler: async (ctx, args) => email.contacts.add(args),
})
export const createBroadcast = action({
  args: { audienceId: v.string(), from: v.string(), subject: v.string(), html: v.string() },
  handler: async (ctx, args) => email.broadcasts.create(args),
})
export const sendBroadcast = action({
  args: { broadcastId: v.string() },
  handler: async (ctx, { broadcastId }) => email.broadcasts.send(broadcastId),
})
