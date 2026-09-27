import { setupEmail } from 'nuxt-backend/email'
import { ConvexError, v } from 'convex/values'
import { isAllowedTestEmail, normalizeTestEmail, TEST_EMAIL_HELP } from '../utils/testEmail'
import { api, components, internal } from './_generated/api'
import { action, internalMutation, query } from './_generated/server'
import { authComponent } from './auth'
import { admin } from './functions'
import { emailLimits, throttle } from './rateLimiter'

// Transactional + marketing email over the `email` component (Resend nested
// inside). The typed event handlers (full provider catalog — email.*,
// contact.*, domain.*) run after the component verified the webhook — the
// showcase logs them into the same feed as billing events, by email id: the
// feed is shared, and on the playground an address is the key to its account.
export const email = setupEmail(components, {
  events: {
    'email.delivered': async (ctx, event) => {
      await ctx.runMutation(internal.billing.recordWebhookEvent, {
        source: 'email',
        type: event.type,
        summary: `email ${event.data.email_id ?? 'unknown'} delivered`,
      })
    },
    'email.bounced': async (ctx, event) => {
      await ctx.runMutation(internal.billing.recordWebhookEvent, {
        source: 'email',
        type: event.type,
        summary: `email ${event.data.email_id ?? 'unknown'} bounced`,
      })
    },
    'email.complained': async (ctx, event) => {
      await ctx.runMutation(internal.billing.recordWebhookEvent, {
        source: 'email',
        type: event.type,
        summary: `email ${event.data.email_id ?? 'unknown'} marked as spam`,
      })
    },
  },
})

// Reactive delivery-status query behind `useEmailStatus`, and the sandbox
// inbox behind `useSandboxInbox`: the sign-in page reads a visitor's codes
// from it, since nobody can open a sandbox address's real mailbox.
export const { getEmailStatus, getSandboxInbox } = email.api

/** A Resend test inbox, lower-cased — or a refusal: the playground never emails a real person. */
function testRecipient(address: string): string {
  const recipient = normalizeTestEmail(address)
  if (!isAllowedTestEmail(recipient)) throw new ConvexError(TEST_EMAIL_HELP)
  return recipient
}

/**
 * Send a transactional email (gated: requires a signed-in user). Records it so
 * the showcase can track delivery live. Only Resend test inboxes are accepted,
 * checked here and not just in the form, and sends are throttled: they share
 * one provider quota with every visitor's sign-in codes.
 */
export const sendTest = action({
  args: { to: v.optional(v.string()), subject: v.optional(v.string()) },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { to, subject }) => {
    const user = await ctx.runQuery(api.auth.getAuthUser, {})
    if (!user) throw new ConvexError('Sign in to send email.')
    const recipient = testRecipient(to ?? 'delivered@resend.dev')
    await throttle(ctx, emailLimits(user._id))
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

/** How long the playground keeps a sent email's record: a week, as `email.cleanup` does. */
const EMAIL_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Daily retention (crons.ts): the component prunes finalized email records
 * after a week and abandoned ones after a month (its defaults), and the
 * showcase's own sent-email rows go with them, a batch at a time.
 */
export const pruneEmails = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await email.cleanup(ctx)
    await email.cleanupAbandoned(ctx)
    const cutoff = Date.now() - EMAIL_RETENTION_MS
    const rows = await ctx.db.query('sentEmails').withIndex('by_creation_time', q => q.lt('_creationTime', cutoff)).take(500)
    for (const row of rows) await ctx.db.delete(row._id)
    if (rows.length === 500) await ctx.scheduler.runAfter(0, internal.email.pruneEmails, {})
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

// --- Marketing (segments / contacts / broadcasts via the Resend SDK) ---------
// Admin-only, as the scaffold ships them: contacts live in the provider
// account, outside test mode, so a public action would let any visitor store
// an address there. Contacts are Resend test inboxes even for an admin.

export const createSegment = admin.action({
  args: { name: v.string() },
  handler: async (ctx, { name }) => email.segments.create({ name }),
})

export const addContact = admin.action({
  args: {
    segmentId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    unsubscribed: v.optional(v.boolean()),
  },
  handler: async (ctx, { segmentId, ...fields }) => {
    const contact = { ...fields, email: testRecipient(fields.email) }
    // A contact is one record per address, and the demo reuses the same test
    // address on every run: when it already exists, creating it again fails,
    // so put the existing contact in the new segment instead. If that fails
    // too, the create error is the one worth reporting.
    try {
      return await email.contacts.add({ ...contact, segments: [{ id: segmentId }] })
    }
    catch (createError) {
      return email.segments.addContact({ email: contact.email, segmentId }).catch(() => {
        throw createError
      })
    }
  },
})

export const createBroadcast = admin.action({
  args: { segmentId: v.string(), from: v.string(), subject: v.string(), html: v.string() },
  handler: async (ctx, args) => email.broadcasts.create(args),
})

export const sendBroadcast = admin.action({
  args: { broadcastId: v.string(), scheduledAt: v.optional(v.string()) },
  handler: async (ctx, { broadcastId, scheduledAt }) =>
    email.broadcasts.send(broadcastId, scheduledAt ? { scheduledAt } : undefined),
})
