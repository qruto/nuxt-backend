import { setupEmail } from 'nuxt-backend/convex/email'
import { v } from 'convex/values'
import { api, components, internal } from './_generated/api'
import { type ActionCtx, action, internalMutation, query } from './_generated/server'
import { authComponent } from './auth'

// Transactional + marketing email over the Resend component nested in `backend`.
const email = setupEmail(components.backend)

// Reactive delivery-status query behind `useEmailStatus`.
export const { getEmailStatus } = email.api

/**
 * Send a transactional email (gated: requires a signed-in user). Records it so
 * the showcase can track delivery live. Defaults to a Resend test recipient so
 * the demo never emails real people (test mode accepts delivered@/bounced@/
 * complained@resend.dev without a verified domain).
 */
export const sendTest = action({
  args: { to: v.optional(v.string()), subject: v.optional(v.string()) },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { to, subject }) => {
    const user = await ctx.runQuery(api.auth.getAuthUser, {})
    if (!user) throw new Error('Sign in to send email.')
    const recipient = to ?? 'delivered@resend.dev'
    const subj = subject ?? 'Hello from nuxt-backend'
    const emailId = await email.send(ctx, {
      to: recipient,
      subject: subj,
      html: '<p>This email was delivered through the Resend component nested inside '
        + 'the <code>backend</code> Convex component.</p>',
    })
    if (emailId) {
      await ctx.runMutation(internal.email.recordSent, {
        userId: user._id,
        emailId,
        to: recipient,
        subject: subj,
      })
    }
    return emailId
  },
})

export const recordSent = internalMutation({
  args: { userId: v.string(), emailId: v.string(), to: v.string(), subject: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert('sentEmails', { ...args, createdAt: Date.now() })
    return null
  },
})

/** The current user's recently-sent emails (each row tracked live via useEmailStatus). */
export const listSentEmails = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []
    const user = await authComponent.getAuthUser(ctx)
    return ctx.db
      .query('sentEmails')
      .withIndex('userId', q => q.eq('userId', user._id))
      .order('desc')
      .take(10)
  },
})

// --- Marketing (audiences / contacts / broadcasts via the Resend SDK) --------
// Gated to signed-in users for the demo; treat as admin actions in production.

async function requireUser(ctx: ActionCtx): Promise<void> {
  const user = await ctx.runQuery(api.auth.getAuthUser, {})
  if (!user) throw new Error('Sign in to manage marketing email.')
}

export const createAudience = action({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    await requireUser(ctx)
    return email.audiences.create({ name })
  },
})

export const addContact = action({
  args: {
    audienceId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    unsubscribed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    return email.contacts.add(args)
  },
})

export const createBroadcast = action({
  args: { audienceId: v.string(), from: v.string(), subject: v.string(), html: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    return email.broadcasts.create(args)
  },
})

export const sendBroadcast = action({
  args: { broadcastId: v.string(), scheduledAt: v.optional(v.string()) },
  handler: async (ctx, { broadcastId, scheduledAt }) => {
    await requireUser(ctx)
    return email.broadcasts.send(broadcastId, scheduledAt ? { scheduledAt } : undefined)
  },
})
