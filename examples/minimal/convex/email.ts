import { setupEmail } from 'nuxt-backend/convex/email'
import { v } from 'convex/values'
import { api, components } from './_generated/api'
import { action, internalAction } from './_generated/server'

// Transactional + marketing email over the backend component's email module.
// Delivery uses the required EMAIL_* env vars. React to delivery events with
// `setupEmail(components, { events: { onBounced: async (ctx, event) => { ... } } })`.
export const email = setupEmail(components)

// Reactive delivery-status query behind the `useEmailStatus` composable.
export const { getEmailStatus } = email.api

// Send a transactional email (gated: requires a signed-in user). The same
// transport powers auth OTP / verification / welcome / invitation email.
export const send = action({
  args: { to: v.string(), subject: v.string(), html: v.optional(v.string()), text: v.optional(v.string()) },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(api.auth.getAuthUser, {})
    if (!user) throw new Error('Sign in to send email.')
    return email.send(ctx, args)
  },
})

// Marketing (audiences / contacts / broadcasts) via the provider SDK. These
// are privileged — a public action would be an open spam/phishing relay on
// your verified domain — so they ship as internalActions: run them from ops
// or your own server code. To expose one to an admin UI, re-declare it with
// the `admin.action` builder from ./functions instead of internalAction.
export const createAudience = internalAction({
  args: { name: v.string() },
  handler: async (ctx, { name }) => email.audiences.create({ name }),
})
export const addContact = internalAction({
  args: { audienceId: v.string(), email: v.string(), firstName: v.optional(v.string()), lastName: v.optional(v.string()) },
  handler: async (ctx, args) => email.contacts.add(args),
})
export const createBroadcast = internalAction({
  args: { audienceId: v.string(), from: v.string(), subject: v.string(), html: v.string() },
  handler: async (ctx, args) => email.broadcasts.create(args),
})
export const sendBroadcast = internalAction({
  args: { broadcastId: v.string() },
  handler: async (ctx, { broadcastId }) => email.broadcasts.send(broadcastId),
})
