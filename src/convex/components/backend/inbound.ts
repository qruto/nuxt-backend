import { v } from 'convex/values'
import { isSandboxAddress } from '../../delivery.js'
import { isLive } from '../../environment.js'
import {
  contactEmail,
  INBOX_CONSOLE_ROWS,
  newContactRef,
  newReplyToken,
} from '../../inbound-rules.js'
import { logBackend } from '../../log.js'
import type { Doc } from './_generated/dataModel.js'
import { env, mutation, type MutationCtx, query, type QueryCtx } from './_generated/server.js'
import { resendClient } from './email.js'

/**
 * The contact form and inbound mail: the component's half. The app layer
 * (`setupEmail`, `integrations/inbound.ts`) checks the caller, the bot check
 * and the limits, then writes here: a contact message is stored first and
 * its copy for the team queued in the same transaction (the email
 * component's queue retries it, so a provider outage never loses one); an
 * inbound message is stored once per received email and recipient, so a
 * redelivered webhook never duplicates it; a reply address is the token a
 * reply-by-email address carries.
 *
 * Both kinds of message are personal data: they are kept 90 days (the
 * maintenance pass prunes them) and erased with the account that sent them
 * or by their sender's address.
 */

/** The most rows an erasure removes in one batch. */
const FORGET_BATCH = 200

/**
 * What an erasure batch leaves of the transaction's byte budget: a message
 * holds up to 20,000 characters of text, so a batch of long ones stops early
 * rather than read past the limit.
 */
const FORGET_BYTES_RESERVE = 4 * 1024 * 1024

/** The most rows one account's export carries of each kind. */
const EXPORT_ROWS_MAX = 500

/** About the most bytes one account's export reads of each kind of message, beside everything else the export reads. */
const EXPORT_BYTES_MAX = 2 * 1024 * 1024

/** How old a reply address's clock may get before handing the address out again moves it to now: a day, so the year it is kept counts from about its last email, without a write for every email. */
const REPLY_ADDRESS_REFRESH_MS = 24 * 60 * 60 * 1000

/** Where a contact message went. */
const vDelivery = v.union(v.literal('support'), v.literal('copy'), v.literal('kept'), v.literal('held'), v.literal('failed'))

/**
 * The reply address of a person and a thread: the same one every time, made
 * on first use. Handing it out again keeps it for another year from now, so
 * an address in a new email never expires before the reply it waits for.
 */
export const replyToken = mutation({
  args: { userId: v.string(), thread: v.string() },
  returns: v.string(),
  handler: async (ctx, { userId, thread }) => {
    const known = await ctx.db.query('replyAddresses').withIndex('userId_thread', q => q.eq('userId', userId).eq('thread', thread)).first()
    if (known) {
      const now = Date.now()
      if (known.createdAt < now - REPLY_ADDRESS_REFRESH_MS) await ctx.db.patch('replyAddresses', known._id, { createdAt: now })
      return known.token
    }
    // 80 random bits: a clash is not a case worth a second try, but one costs nothing to rule out.
    for (let attempt = 0; attempt < 3; attempt++) {
      const token = newReplyToken()
      if (await ctx.db.query('replyAddresses').withIndex('token', q => q.eq('token', token)).first()) continue
      await ctx.db.insert('replyAddresses', { token, userId, thread, createdAt: Date.now() })
      return token
    }
    throw new Error('[nuxt-backend] replyAddress: no free reply token after three tries.')
  },
})

/** The person and the thread a reply token names; `null` for a token nobody holds. */
export const replyOf = query({
  args: { token: v.string() },
  returns: v.union(v.object({ userId: v.string(), thread: v.string() }), v.null()),
  handler: async (ctx, { token }) => {
    const row = await ctx.db.query('replyAddresses').withIndex('token', q => q.eq('token', token)).first()
    return row ? { userId: row.userId, thread: row.thread } : null
  },
})

/** Where a contact message's copy for the team went, with what the provider answered. */
interface Copy {
  delivery: typeof vDelivery.type
  emailId?: string
  error?: string
}

/**
 * Queue the team's copy of a contact message: to the support inbox, else the
 * contact mailbox, else nowhere (the console alone). Test mode, and a
 * deployment without a key, hold it back as they do every other email. The
 * visitor's address is the email's Reply-To, never a recipient.
 */
async function queueCopy(ctx: MutationCtx, message: { ref: string, name?: string, email?: string, userId?: string, body: string }, destination: { support?: string, to?: string }): Promise<Copy> {
  const target = destination.support ?? destination.to
  if (!target) return { delivery: 'kept' }
  if (!env.EMAIL_API_KEY || (!isLive(env.BACKEND_ENVIRONMENT) && !isSandboxAddress(target))) {
    logBackend('warn', 'email.contact_held', 'A contact message was stored and not sent to the team: no EMAIL_API_KEY, or test mode with an address that is not a test one.')
    return { delivery: 'held' }
  }
  const { subject, text } = contactEmail({ ...(message.name ? { name: message.name } : {}), ...(message.email ? { email: message.email } : {}), ...(message.userId ? { accountId: message.userId } : {}), body: message.body, ref: message.ref })
  try {
    const emailId = await resendClient().sendEmail(ctx, {
      from: env.EMAIL_FROM ?? 'onboarding@resend.dev',
      to: target,
      ...(message.email ? { replyTo: [message.email] } : {}),
      subject,
      text,
      // One copy per message, whatever retries it.
      idempotencyKey: `nuxt-backend:contact:${message.ref}`,
    })
    return { delivery: destination.support ? 'support' : 'copy', emailId }
  }
  catch (cause) {
    logBackend('error', 'email.contact_failed', 'A contact message was stored, and the email provider refused to queue its copy for the team.', cause)
    return { delivery: 'failed', error: (cause instanceof Error ? cause.message : String(cause)).slice(0, 300) }
  }
}

/**
 * Store a contact message and queue its copy for the team in the same
 * transaction, so a message is never sent without being kept, and a provider
 * outage never loses one (the email component's queue retries the copy).
 */
export const storeContact = mutation({
  args: {
    userId: v.optional(v.string()),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    message: v.string(),
    locale: v.optional(v.string()),
    support: v.optional(v.string()),
    to: v.optional(v.string()),
  },
  returns: v.object({ id: v.id('contactMessages'), ref: v.string(), delivery: vDelivery }),
  handler: async (ctx, { support, to, ...args }) => {
    const ref = newContactRef()
    const copy = await queueCopy(ctx, { ref, ...(args.name ? { name: args.name } : {}), ...(args.email ? { email: args.email } : {}), ...(args.userId ? { userId: args.userId } : {}), body: args.message }, { ...(support ? { support } : {}), ...(to ? { to } : {}) })
    const id = await ctx.db.insert('contactMessages', { ref, ...args, sentAt: Date.now(), delivery: copy.delivery, ...(copy.emailId ? { emailId: copy.emailId } : {}), ...(copy.error ? { error: copy.error } : {}) })
    return { id, ref, delivery: copy.delivery }
  },
})

/**
 * The thread the support inbox made of a contact message, found by the
 * reference its email carried. A row takes one thread: `false` for a
 * reference nobody holds, and for a row already on another thread, so mail
 * that copies a reference never moves where the replies go.
 */
export const linkContact = mutation({
  args: { ref: v.string(), threadId: v.string(), inboxEmailId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { ref, threadId, inboxEmailId }) => {
    const row = await ctx.db.query('contactMessages').withIndex('ref', q => q.eq('ref', ref)).first()
    if (!row) return false
    // The same copy, delivered again, is already in place.
    if (row.threadId !== undefined) return row.threadId === threadId
    await ctx.db.patch('contactMessages', row._id, { threadId, inboxEmailId })
    return true
  },
})

/** What an inbound message is stored with. */
const vInbound = v.object({
  emailId: v.string(),
  route: v.union(v.literal('reply'), v.literal('workspace'), v.literal('support')),
  to: v.string(),
  from: v.string(),
  fromName: v.optional(v.string()),
  subject: v.string(),
  text: v.optional(v.string()),
  attachments: v.array(v.object({ name: v.string(), size: v.optional(v.number()) })),
  receivedAt: v.number(),
  userId: v.optional(v.string()),
  thread: v.optional(v.string()),
  workspaceId: v.optional(v.string()),
  threadId: v.optional(v.string()),
  inboxEmailId: v.optional(v.string()),
})

/**
 * Store one received email for one recipient, once: the provider delivers a
 * webhook again until it is answered, and a hook that threw is run again on
 * the stored copy. Answers the row, whether it is new, and whether the app's
 * hook already finished with it.
 */
export const recordInbound = mutation({
  args: { message: vInbound },
  returns: v.object({ id: v.id('inboundMessages'), fresh: v.boolean(), handled: v.boolean() }),
  handler: async (ctx, { message }) => {
    const known = await ctx.db.query('inboundMessages').withIndex('emailId_to', q => q.eq('emailId', message.emailId).eq('to', message.to)).first()
    if (known) return { id: known._id, fresh: false, handled: known.handledAt !== undefined }
    const id = await ctx.db.insert('inboundMessages', message)
    return { id, fresh: true, handled: false }
  },
})

/** The app's hook finished with a message. */
export const markHandled = mutation({
  args: { id: v.id('inboundMessages') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get('inboundMessages', id)
    if (row && row.handledAt === undefined) await ctx.db.patch('inboundMessages', id, { handledAt: Date.now() })
    return null
  },
})

/** What an administrator's reply answers: a stored message of the support inbox, or a contact message the inbox handed back. */
const vTarget = v.object({
  kind: v.union(v.literal('contact'), v.literal('support')),
  threadId: v.string(),
  inboxEmailId: v.string(),
})

/** The thread and email a console row's reply answers; `null` when the row has none (not from the support inbox, or the inbox has not handed it back yet). */
export const replyTarget = query({
  args: { kind: v.union(v.literal('contact'), v.literal('inbound')), id: v.string() },
  returns: v.union(vTarget, v.null()),
  handler: async (ctx, { kind, id }) => {
    if (kind === 'contact') {
      const normalized = ctx.db.normalizeId('contactMessages', id)
      const row = normalized ? await ctx.db.get('contactMessages', normalized) : null
      return row?.threadId && row.inboxEmailId ? { kind: 'contact' as const, threadId: row.threadId, inboxEmailId: row.inboxEmailId } : null
    }
    const normalized = ctx.db.normalizeId('inboundMessages', id)
    const row = normalized ? await ctx.db.get('inboundMessages', normalized) : null
    return row?.route === 'support' && row.threadId && row.inboxEmailId ? { kind: 'support' as const, threadId: row.threadId, inboxEmailId: row.inboxEmailId } : null
  },
})

/** An administrator answered a console row. */
export const markReplied = mutation({
  args: { kind: v.union(v.literal('contact'), v.literal('inbound')), id: v.string(), by: v.string() },
  returns: v.null(),
  handler: async (ctx, { kind, id, by }) => {
    if (kind === 'contact') {
      const normalized = ctx.db.normalizeId('contactMessages', id)
      if (normalized) await ctx.db.patch('contactMessages', normalized, { repliedAt: Date.now(), repliedBy: by })
    }
    else {
      const normalized = ctx.db.normalizeId('inboundMessages', id)
      if (normalized) await ctx.db.patch('inboundMessages', normalized, { repliedAt: Date.now(), repliedBy: by })
    }
    return null
  },
})

/** One row of the Inbox tab, before the app adds who the account is. */
const vRow = v.object({
  id: v.string(),
  kind: v.union(v.literal('contact'), v.literal('reply'), v.literal('workspace'), v.literal('support')),
  at: v.number(),
  from: v.union(v.string(), v.null()),
  name: v.union(v.string(), v.null()),
  subject: v.union(v.string(), v.null()),
  text: v.string(),
  attachments: v.array(v.object({ name: v.string(), size: v.optional(v.number()) })),
  userId: v.union(v.string(), v.null()),
  delivery: v.union(vDelivery, v.null()),
  workspaceId: v.union(v.string(), v.null()),
  thread: v.union(v.string(), v.null()),
  threadId: v.union(v.string(), v.null()),
  canReply: v.boolean(),
  repliedAt: v.union(v.number(), v.null()),
})

/** The newest messages of both kinds, newest first: what the Inbox tab lists. */
export const consoleRows = query({
  args: {},
  returns: v.array(vRow),
  handler: async (ctx): Promise<Array<typeof vRow.type>> => {
    const contacts = await ctx.db.query('contactMessages').withIndex('sentAt').order('desc').take(INBOX_CONSOLE_ROWS)
    const inbound = await ctx.db.query('inboundMessages').withIndex('receivedAt').order('desc').take(INBOX_CONSOLE_ROWS)
    const rows: Array<typeof vRow.type> = [
      ...contacts.map(row => ({
        id: row._id,
        kind: 'contact' as const,
        at: row.sentAt,
        from: row.email ?? null,
        name: row.name ?? null,
        subject: null,
        text: row.message,
        attachments: [],
        userId: row.userId ?? null,
        delivery: row.delivery,
        workspaceId: null,
        thread: null,
        threadId: row.threadId ?? null,
        canReply: Boolean(row.threadId && row.inboxEmailId),
        repliedAt: row.repliedAt ?? null,
      })),
      ...inbound.map(row => ({
        id: row._id,
        kind: row.route,
        at: row.receivedAt,
        from: row.from,
        name: row.fromName ?? null,
        subject: row.subject,
        text: row.text ?? '',
        attachments: row.attachments,
        userId: row.userId ?? null,
        delivery: null,
        workspaceId: row.workspaceId ?? null,
        thread: row.thread ?? null,
        threadId: row.threadId ?? null,
        canReply: row.route === 'support' && Boolean(row.threadId && row.inboxEmailId),
        repliedAt: row.repliedAt ?? null,
      })),
    ]
    return rows.sort((a, b) => b.at - a.at).slice(0, INBOX_CONSOLE_ROWS)
  },
})

/** A message as an export carries it: its own fields, without the store's. */
function exported<T extends { _id: unknown, _creationTime: unknown }>(row: T): Omit<T, '_id' | '_creationTime'> {
  const { _id, _creationTime, ...fields } = row
  return fields
}

/**
 * What the component keeps of an account, for its export: the contact
 * messages it sent and the mail it sent to the app (the reply addresses, which
 * hold only a token, a thread and a person, are left out).
 *
 * @internal
 */
export async function inboundRows(ctx: QueryCtx, userId: string): Promise<{ contactMessages: unknown[], inboundMessages: unknown[] }> {
  return {
    contactMessages: (await newest(ctx, ctx.db.query('contactMessages').withIndex('userId_sentAt', q => q.eq('userId', userId)).order('desc'))).map(({ ref: _ref, ...row }) => exported(row)),
    inboundMessages: (await newest(ctx, ctx.db.query('inboundMessages').withIndex('userId_receivedAt', q => q.eq('userId', userId)).order('desc'))).map(row => exported(row)),
  }
}

/** The newest rows a read yields for an export: up to {@link EXPORT_ROWS_MAX}, and about {@link EXPORT_BYTES_MAX} read. */
async function newest<Row>(ctx: QueryCtx, rows: AsyncIterable<Row>): Promise<Row[]> {
  const from = (await ctx.meta.getTransactionMetrics()).bytesRead.used
  const kept: Row[] = []
  for await (const row of rows) {
    kept.push(row)
    if (kept.length >= EXPORT_ROWS_MAX || (await ctx.meta.getTransactionMetrics()).bytesRead.used - from >= EXPORT_BYTES_MAX) break
  }
  return kept
}

/**
 * The inbound part of an erasure: the messages the account sent and those
 * sent from its address, and the reply addresses made for it, in batches.
 * A batch deletes as it reads, so a row both reads reach is read once, and
 * stops at {@link FORGET_BATCH} rows or when the transaction's bytes run
 * low. `true` while rows may be left.
 *
 * @internal
 */
export async function forgetInbound(ctx: MutationCtx, { userId, email }: { userId?: string, email?: string }): Promise<boolean> {
  let left = FORGET_BATCH
  /** Delete what a read yields while the batch lasts; `false` once it ran out. */
  async function drain<Table extends 'contactMessages' | 'inboundMessages' | 'replyAddresses'>(table: Table, rows: AsyncIterable<Doc<Table>>): Promise<boolean> {
    for await (const row of rows) {
      await ctx.db.delete(table, row._id)
      if (--left <= 0 || (await ctx.meta.getTransactionMetrics()).bytesRead.remaining < FORGET_BYTES_RESERVE) return false
    }
    return true
  }
  const reads: Array<() => Promise<boolean>> = [
    ...(userId
      ? [
          () => drain('contactMessages', ctx.db.query('contactMessages').withIndex('userId_sentAt', q => q.eq('userId', userId))),
          () => drain('inboundMessages', ctx.db.query('inboundMessages').withIndex('userId_receivedAt', q => q.eq('userId', userId))),
        ]
      : []),
    ...(email
      ? [
          () => drain('contactMessages', ctx.db.query('contactMessages').withIndex('email_sentAt', q => q.eq('email', email))),
          () => drain('inboundMessages', ctx.db.query('inboundMessages').withIndex('from_receivedAt', q => q.eq('from', email))),
        ]
      : []),
    ...(userId ? [() => drain('replyAddresses', ctx.db.query('replyAddresses').withIndex('userId_thread', q => q.eq('userId', userId)))] : []),
  ]
  for (const read of reads) {
    if (!await read()) return true
  }
  return false
}
