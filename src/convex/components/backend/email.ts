import { type EmailId, Resend, type SendEmailOptions, vStatus } from '@convex-dev/resend'
import { type Infer, v } from 'convex/values'
import { isSandboxAddress } from '../../delivery.js'
import { isLive } from '../../environment.js'
import { sendArgs } from '../../email-validators.js'
import { backendError } from '../../errors.js'
import { components, internal } from './_generated/api.js'
import { action, env, internalAction, internalMutation, internalQuery, type MutationCtx, mutation, query } from './_generated/server.js'
import { logBackend } from '../../log.js'
import { inTopic } from './preferences.js'
import { createSandboxInboxCache, readSandboxMail, SandboxInboxError } from '../../sandbox-inbox.js'
import { verifyWebhookSignature } from '../../webhook-signatures.js'

/**
 * Email sending, served by the `backend` component itself via the nested Resend
 * component. Consumers get transactional email out of the box: mount `backend`
 * and set `EMAIL_API_KEY` — no extra component to install or wire.
 *
 * Configuration comes from the env vars declared on this component in
 * `convex.config.ts` and forwarded by the mounting app. They are read here
 * type-safely via the generated `env`:
 * - `EMAIL_API_KEY` — the provider API key (required on deploy; absent in
 *   tests/previews ⇒ defensive no-op, logs instead)
 * - `EMAIL_FROM` — default From address (falls back to the provider's onboarding sender)
 * - `BACKEND_ENVIRONMENT` — test mode everywhere but `production`: only the
 *   provider's test addresses receive mail. `production` delivers to
 *   arbitrary recipients
 * - `EMAIL_WEBHOOK_SECRET` — verifies delivery/bounce/open webhooks
 */
export function resendClient(): Resend {
  return new Resend(components.resend, {
    apiKey: env.EMAIL_API_KEY,
    testMode: !isLive(env.BACKEND_ENVIRONMENT),
    webhookSecret: env.EMAIL_WEBHOOK_SECRET,
  })
}

const vSendArgs = v.object(sendArgs)

/** What a send under a topic that the quiet hours hold carries, so its release asks the topic again: the contact and the topic. */
const vHold = v.object({ contactId: v.string(), topic: v.object({ key: v.string(), subscribedByDefault: v.boolean() }) })

/** How long the email records are kept: see `setupEmail({ retention })`. */
export const vEmailRetention = v.object({
  /** After an email's final status: delivered, bounced, failed or cancelled. */
  finalizedMs: v.optional(v.number()),
  /** After an email was created, when it never got a final status. */
  abandonedMs: v.optional(v.number()),
})

/**
 * Record the app's email retention, which every send carries, when it
 * differs from the one on record: the maintenance pass prunes by it. One
 * row, written only on a change, so sends do not contend on it.
 */
async function recordRetention(ctx: MutationCtx, retention: Infer<typeof vEmailRetention> | undefined): Promise<void> {
  // No retention is no opinion: a send made without setupEmail (a workflow
  // step calling the component directly) leaves the app's setting alone.
  if (retention === undefined) return
  const current = await ctx.db.query('emailSettings').first()
  const wanted = { finalizedMs: retention.finalizedMs, abandonedMs: retention.abandonedMs }
  if (current?.finalizedMs === wanted.finalizedMs && current?.abandonedMs === wanted.abandonedMs) return
  if (!current && wanted.finalizedMs === undefined && wanted.abandonedMs === undefined) return
  if (current) await ctx.db.replace('emailSettings', current._id, wanted)
  else await ctx.db.insert('emailSettings', wanted)
}

/**
 * A send mutation: it takes what `send` takes, plus the app's retention
 * and, read by a secret email only, when its secret stops working (`send`
 * ignores it: a record outlives its secret). It first picks
 * the sender and stops without an API key (returning `null`). `deliver` hands the message on and returns the
 * email's id, or `null` for one with no record.
 */
function sendMutation(deliver: (ctx: MutationCtx, args: Infer<typeof vSendArgs>, from: string, expiresAt: number | undefined) => Promise<string | null>) {
  return mutation({
    args: { ...sendArgs, retention: v.optional(vEmailRetention), expiresAt: v.optional(v.number()), deliverAt: v.optional(v.number()), hold: v.optional(vHold) },
    returns: v.union(v.string(), v.null()),
    handler: async (ctx, { retention, expiresAt, deliverAt, hold, ...args }) => {
      await recordRetention(ctx, retention)
      const from = args.from ?? env.EMAIL_FROM ?? 'onboarding@resend.dev'
      if (!env.EMAIL_API_KEY) {
        // No recipient or subject: logs are kept, and both can name a person.
        logBackend('warn', 'email.skipped_no_api_key', 'Email skipped: the required EMAIL_API_KEY env var is missing on this deployment.')
        return null
      }
      // Held by the person's quiet hours: kept in a table erasure reaches, and
      // handed on at their end by its row id, so no address or body waits in
      // a scheduled function's arguments. No email id until then.
      if (deliverAt !== undefined && deliverAt > Date.now()) {
        const id = await ctx.db.insert('heldEmails', { message: args, from, email: heldAddress(args), deliverAt, ...(hold ? { hold } : {}) })
        await ctx.scheduler.runAt(deliverAt, internal.email.sendHeld, { id })
        return null
      }
      return await deliver(ctx, args, from, expiresAt)
    },
  })
}

/**
 * Enqueue a transactional email through the nested Resend component.
 *
 * Exposed as a `public` component function so the parent app (e.g. the auth
 * flows, or `setupEmail`) can call it via `components.backend.email.send`.
 * Component functions are only reachable through the parent — never directly by
 * browser clients.
 */
export const send = sendMutation((ctx, args, from) => enqueue(ctx, args, from))

/** Hand a message to the nested provider component, which sends it and tracks its delivery. */
async function enqueue(ctx: MutationCtx, args: Infer<typeof vSendArgs>, from: string): Promise<string> {
  const common = {
    from,
    to: args.to,
    cc: args.cc,
    bcc: args.bcc,
    replyTo: args.replyTo,
    headers: args.headers,
    // A repeated key returns the first send's id instead of a second email.
    ...(args.idempotencyKey ? { idempotencyKey: args.idempotencyKey } : {}),
  }
  const options = (args.template
    ? { ...common, subject: args.subject, template: args.template }
    : { ...common, subject: args.subject ?? '', html: args.html, text: args.text }) as SendEmailOptions
  return resendClient().sendEmail(ctx, options)
}

/** The address a held send is erased by: its first recipient, as accounts write it. */
function heldAddress(message: Infer<typeof vSendArgs>): string {
  const to = Array.isArray(message.to) ? message.to[0] : message.to
  return (to ?? '').trim().toLowerCase()
}

/**
 * A send the quiet hours held, at their end: handed on as it was asked for,
 * unless its row is gone (its person was erased) or they left the topic
 * meanwhile. The row goes either way.
 */
export const sendHeld = internalMutation({
  args: { id: v.id('heldEmails') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get('heldEmails', id)
    if (!row) return null
    await ctx.db.delete('heldEmails', id)
    const { message: args, from, hold } = row
    if (!env.EMAIL_API_KEY) return null
    if (hold) {
      const contactId = ctx.db.normalizeId('emailContacts', hold.contactId)
      // An erased person's contact is gone: nothing goes.
      if (!contactId || !await ctx.db.get('emailContacts', contactId)) return null
      if (!await inTopic(ctx, contactId, hold.topic)) {
        logBackend('info', 'email.skipped_unsubscribed', `An email under the ${hold.topic.key} topic, held by the quiet hours, was not sent: its recipient left the topic meanwhile.`)
        return null
      }
    }
    await enqueue(ctx, args, from)
    return null
  },
})

// --- Secret emails -------------------------------------------------------------
//
// A sign-in code is a credential for as long as
// it is valid, and an email record keeps its body for days. So such an email
// takes its own path and leaves no record: the message waits in
// `secretOutbox` only until the provider's API answers, and the row is
// deleted then, whatever the answer. A failure leaves a log line, never a
// status: nothing reads a secret email's status. A watchdog re-runs a
// delivery that never settled, and each row also expires on its own at
// SECRET_OUTBOX_TTL_MS, with the maintenance pass as a backstop.

/** The provider's single-send endpoint. */
const PROVIDER_SEND_URL = 'https://api.resend.com/emails'

/**
 * The longest a secret email waits in the outbox: its code has expired by
 * then, so a row still there is deleted, unsent.
 */
export const SECRET_OUTBOX_TTL_MS = 15 * 60 * 1000

/** When the watchdog checks that a delivery settled, and runs it again if not. */
const SECRET_WATCHDOG_MS = 60 * 1000

/** The first retry's wait; each next one doubles, up to SECRET_RETRY_CAP_MS. */
const SECRET_RETRY_BASE_MS = 1000

/** The longest wait between two attempts, unless the provider asks for more. */
const SECRET_RETRY_CAP_MS = 2 * 60 * 1000

/** A Retry-After header's wait in milliseconds: seconds, or an HTTP date; 0 without one. */
function retryAfterMs(header: string | null): number {
  if (!header?.trim()) return 0
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const at = Date.parse(header)
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : 0
}

/** The wait before attempt `attempts + 1`: the provider's Retry-After or a doubling backoff, whichever is longer, plus up to a quarter of jitter. */
export function secretRetryDelay(attempts: number, retryAfter: string | null, random: () => number = Math.random): number {
  const asked = retryAfterMs(retryAfter)
  const backoff = Math.min(SECRET_RETRY_BASE_MS * 2 ** (attempts - 1), SECRET_RETRY_CAP_MS)
  const wait = Math.max(asked, backoff)
  return Math.round(wait + wait * 0.25 * random())
}

/** Every recipient is one of the provider's test addresses: all test mode delivers to. */
function onlySandboxAddresses(args: Infer<typeof vSendArgs>): boolean {
  const all = [args.to, args.cc ?? [], args.bcc ?? []].flat()
  return all.every(address => isSandboxAddress(address))
}

/**
 * Send an email that carries a secret: a sign-in or verification code.
 * Takes what `send` takes and returns `null`: the
 * email leaves no record, so it has no id and no status. A caller-supplied
 * `idempotencyKey` dedupes against a message still waiting, and only then.
 * `expiresAt` is when the secret stops working: the message is not sent
 * after it (nor after SECRET_OUTBOX_TTL_MS). Called by `setupEmail`'s
 * `sendTemplate` for the `otp` template.
 */
export const sendSecret = sendMutation(async (ctx, args, from, secretExpiresAt) => {
  if (!args.template && (args.subject === undefined || (args.html === undefined && args.text === undefined))) {
    throw new Error('A secret email needs a subject and html or text, or a template.')
  }
  if (!isLive(env.BACKEND_ENVIRONMENT) && !onlySandboxAddresses(args)) {
    // What the provider component refuses in test mode, refused the same way.
    throw new Error('Test mode is enabled, but an address is not one of the provider\'s sandbox addresses. Only a production deployment (BACKEND_ENVIRONMENT=production) delivers to real inboxes.')
  }
  const { idempotencyKey, ...message } = args
  if (idempotencyKey !== undefined) {
    const waiting = await ctx.db.query('secretOutbox').withIndex('idempotencyKey', q => q.eq('idempotencyKey', idempotencyKey)).first()
    if (waiting) return null
  }
  const now = Date.now()
  const expiresAt = Math.min(now + SECRET_OUTBOX_TTL_MS, secretExpiresAt ?? Number.POSITIVE_INFINITY)
  const id = await ctx.db.insert('secretOutbox', {
    message: { ...message, from },
    attempts: 0,
    generation: 0,
    nextAttemptAt: now,
    expiresAt,
    ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
  })
  await ctx.scheduler.runAfter(0, internal.email.deliverSecret, { id, generation: 0 })
  await ctx.scheduler.runAfter(SECRET_WATCHDOG_MS, internal.email.watchSecret, { id })
  await ctx.scheduler.runAt(expiresAt, internal.email.expireSecret, { id })
  return null
})

/** The outbox row `deliverSecret` sends, or `null` once it is gone or its secret expired by `now`. */
export const secretInOutbox = internalQuery({
  args: { id: v.id('secretOutbox'), now: v.number() },
  returns: v.union(v.object({ message: vSendArgs, attempts: v.number(), generation: v.number() }), v.null()),
  handler: async (ctx, { id, now }) => {
    const row = await ctx.db.get('secretOutbox', id)
    if (!row || row.expiresAt <= now) return null
    return { message: row.message, attempts: row.attempts, generation: row.generation }
  },
})

/** The provider API's request body for one message. */
function providerPayload(message: Infer<typeof vSendArgs>): Record<string, unknown> {
  return Object.fromEntries(Object.entries({
    from: message.from,
    to: message.to,
    cc: message.cc,
    bcc: message.bcc,
    subject: message.subject,
    html: message.html,
    text: message.text,
    template: message.template,
    reply_to: message.replyTo,
    headers: message.headers && Object.fromEntries(message.headers.map(header => [header.name, header.value])),
  }).filter(([, value]) => value !== undefined))
}

/** One attempt's outcome: sent, refused for good, or worth another try after `delay` ms. */
type Attempt = { outcome: 'sent' } | { outcome: 'refused', reason: string } | { outcome: 'retry', reason: string, delay: number }

/** Post one message to the provider. A rate limit, a conflicting request with the same key, a server error or a network failure is worth another try. */
async function attemptSecret(id: string, message: Infer<typeof vSendArgs>, attempts: number): Promise<Attempt> {
  let response: Response
  try {
    response = await fetch(PROVIDER_SEND_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.EMAIL_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': id },
      body: JSON.stringify(providerPayload(message)),
    })
  }
  catch {
    return { outcome: 'retry', reason: 'the request failed', delay: secretRetryDelay(attempts + 1, null) }
  }
  if (response.ok) return { outcome: 'sent' }
  const reason = `the provider answered ${response.status}`
  // 409: the provider is still handling a request with this key.
  if (response.status === 409 || response.status === 429 || response.status >= 500) {
    return { outcome: 'retry', reason, delay: secretRetryDelay(attempts + 1, response.headers.get('retry-after')) }
  }
  return { outcome: 'refused', reason }
}

/**
 * Hand one secret email to the provider. The row's id is the idempotency
 * key, so a retry or the watchdog never sends twice. Each run carries the
 * row's `generation`: a run of an older one (a chain the watchdog or a
 * retry replaced) stops at once, so two chains never run side by side.
 * Whatever happens, the row is deleted at the end, unless another attempt
 * is scheduled (only while it can still run before the secret expires) or
 * a newer chain owns the row.
 */
export const deliverSecret = internalAction({
  args: { id: v.id('secretOutbox'), generation: v.number() },
  returns: v.null(),
  handler: async (ctx, { id, generation }) => {
    const row = await ctx.runQuery(internal.email.secretInOutbox, { id, now: Date.now() })
    if (!row || row.generation !== generation) return null
    let handedOn = false
    let failure: string | undefined = 'it was never sent'
    try {
      if (!env.EMAIL_API_KEY) {
        failure = 'EMAIL_API_KEY is not set'
        return null
      }
      const attempt = await attemptSecret(id, row.message, row.attempts)
      failure = attempt.outcome === 'sent' ? undefined : attempt.reason
      if (attempt.outcome === 'retry') {
        handedOn = (await ctx.runMutation(internal.email.retrySecret, { id, generation, delay: attempt.delay })) !== 'expired'
      }
    }
    finally {
      if (!handedOn) await ctx.runMutation(internal.email.dropSecret, { id, ...(failure !== undefined ? { failure } : {}) })
    }
    return null
  },
})

/**
 * Schedule another attempt as a new generation: `scheduled`, or `expired`
 * when it could not run before the secret expires, or `stale` when the
 * caller's chain was already replaced (the newer one carries on).
 */
export const retrySecret = internalMutation({
  args: { id: v.id('secretOutbox'), generation: v.number(), delay: v.number() },
  returns: v.union(v.literal('scheduled'), v.literal('expired'), v.literal('stale')),
  handler: async (ctx, { id, generation, delay }) => {
    const row = await ctx.db.get('secretOutbox', id)
    if (!row || row.generation !== generation) return 'stale'
    if (row.expiresAt <= Date.now() + delay) return 'expired'
    const next = generation + 1
    await ctx.db.patch('secretOutbox', id, { attempts: row.attempts + 1, generation: next, nextAttemptAt: Date.now() + delay })
    await ctx.scheduler.runAfter(delay, internal.email.deliverSecret, { id, generation: next })
    return 'scheduled'
  },
})

/** Delete a secret email's row; with a `failure`, log that it was not delivered (no address, no provider words). */
export const dropSecret = internalMutation({
  args: { id: v.id('secretOutbox'), failure: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { id, failure }) => {
    if (!(await ctx.db.get('secretOutbox', id))) return null
    await ctx.db.delete('secretOutbox', id)
    if (failure !== undefined) logBackend('warn', 'email.secret_failed', `A secret email was not delivered: ${failure}.`)
    return null
  },
})

/**
 * The watchdog, every SECRET_WATCHDOG_MS while the row waits: an attempt
 * that was due a while ago and never settled (its run was lost) gets
 * another run. One that is waiting out a retry is left to it.
 */
export const watchSecret = internalMutation({
  args: { id: v.id('secretOutbox') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get('secretOutbox', id)
    if (!row) return null
    if (row.nextAttemptAt + SECRET_WATCHDOG_MS / 2 < Date.now()) {
      // A new generation: the lost run, should it surface, stops.
      const generation = row.generation + 1
      await ctx.db.patch('secretOutbox', id, { generation, nextAttemptAt: Date.now() })
      await ctx.scheduler.runAfter(0, internal.email.deliverSecret, { id, generation })
    }
    await ctx.scheduler.runAfter(SECRET_WATCHDOG_MS, internal.email.watchSecret, { id })
    return null
  },
})

/** A row's own expiry, run at its `expiresAt`: still there, it is deleted unsent. */
export const expireSecret = internalMutation({
  args: { id: v.id('secretOutbox') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    if (!(await ctx.db.get('secretOutbox', id))) return null
    await ctx.db.delete('secretOutbox', id)
    logBackend('warn', 'email.secret_failed', 'A secret email was not delivered: its code expired first.')
    return null
  },
})

/** Reads within a few seconds share the provider's list and each body, so open pages, whatever addresses they ask, cost the provider (10 requests a second a team) one list and a retrieval per email between them. */
const inboxCache = createSandboxInboxCache()

/**
 * A test address's inbox: the mail test mode sent to it within the last hour,
 * newest first, read back from the email provider's own log of sent email
 * with the deployment's `EMAIL_API_KEY` (a key restricted to sending cannot
 * read it). Empty for any address that is not a provider test address, for
 * every address once test mode is off, and without a key. Nothing is kept
 * here: the provider's log is the inbox. A read is a list of the newest sent
 * emails and a retrieval of the newest one's body, and the answer is shared
 * for five seconds by everyone who asks for the address.
 * Exposed to the app as `components.backend.email.inbox`, and to the CLI as
 * `nuxt-backend inbox`; the app decides whether to publish it
 * (`setupEmail(…).api.getSandboxInbox`).
 */
export const inbox = action({
  args: { address: v.string() },
  returns: v.array(v.object({
    from: v.string(),
    subject: v.string(),
    text: v.optional(v.string()),
    html: v.optional(v.string()),
    receivedAt: v.number(),
  })),
  handler: async (_ctx, { address }) => {
    // Only a deployment that says it is no production one: unset reads nothing either.
    if (env.BACKEND_ENVIRONMENT === undefined || isLive(env.BACKEND_ENVIRONMENT)) return []
    if (!isSandboxAddress(address) || !env.EMAIL_API_KEY) return []
    try {
      return await readSandboxMail({ apiKey: env.EMAIL_API_KEY, address, cache: inboxCache })
    }
    catch (error) {
      if (!(error instanceof SandboxInboxError)) throw error
      throw backendError('unavailable', { service: 'email', reason: 'provider_refused' }, `[nuxt-backend] ${error.message}`)
    }
  },
})

/**
 * A sent email's delivery state — what `status` returns and `get` includes.
 * Picked field by field rather than passed through from the provider
 * component, so a field it adds later cannot break these return validators,
 * and the provider's own identifiers stay behind this boundary.
 */
const deliveryFields = {
  status: vStatus,
  errorMessage: v.union(v.string(), v.null()),
  bounced: v.boolean(),
  complained: v.boolean(),
  failed: v.boolean(),
  deliveryDelayed: v.boolean(),
  opened: v.boolean(),
  clicked: v.boolean(),
}

interface ProviderDelivery {
  status: Infer<typeof vStatus>
  errorMessage?: string | null
  bounced?: boolean
  complained: boolean
  failed?: boolean
  deliveryDelayed?: boolean
  opened?: boolean
  clicked?: boolean
}

function delivery(email: ProviderDelivery) {
  return {
    status: email.status,
    errorMessage: email.errorMessage ?? null,
    bounced: Boolean(email.bounced),
    complained: email.complained,
    failed: Boolean(email.failed),
    deliveryDelayed: Boolean(email.deliveryDelayed),
    opened: Boolean(email.opened),
    clicked: Boolean(email.clicked),
  }
}

/** Delivery status for a sent email (waiting → queued → sent → delivered/bounced/…). */
export const status = query({
  args: { emailId: v.string() },
  returns: v.union(v.object(deliveryFields), v.null()),
  handler: async (ctx, args) => {
    const email = await resendClient().status(ctx, args.emailId as EmailId)
    return email && delivery(email)
  },
})

/** Every entry of `fields` that is not `undefined` — a return value carries no undefined fields. */
function defined<T extends Record<string, unknown>>(fields: T): Partial<T> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as Partial<T>
}

/**
 * A sent email's record: what was sent (the same fields `send` takes, with
 * the recipients normalised to lists), its delivery state and its timestamps.
 */
export const get = query({
  args: { emailId: v.string() },
  returns: v.union(v.object({
    from: v.string(),
    to: v.array(v.string()),
    cc: v.optional(v.array(v.string())),
    bcc: v.optional(v.array(v.string())),
    subject: sendArgs.subject,
    replyTo: v.array(v.string()),
    html: sendArgs.html,
    text: sendArgs.text,
    template: sendArgs.template,
    headers: sendArgs.headers,
    ...deliveryFields,
    createdAt: v.number(),
    finalizedAt: v.number(),
  }), v.null()),
  handler: async (ctx, args) => {
    const email = await resendClient().get(ctx, args.emailId as EmailId)
    if (!email) return null
    // The provider stores cc/bcc but leaves them out of its declared type.
    const copies = email as { cc?: string[], bcc?: string[] }
    return {
      from: email.from,
      to: email.to,
      replyTo: email.replyTo,
      ...delivery(email),
      createdAt: email.createdAt,
      finalizedAt: email.finalizedAt,
      ...defined({
        cc: copies.cc,
        bcc: copies.bcc,
        subject: email.subject,
        html: email.html,
        text: email.text,
        template: email.template,
        headers: email.headers,
      }),
    }
  },
})

/** Cancel a not-yet-sent email (no-op once Resend has sent it). */
export const cancel = mutation({
  args: { emailId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await resendClient().cancelEmail(ctx, args.emailId as EmailId)
    return null
  },
})

/**
 * A mutation that hands one of the provider's prune jobs to the scheduler and
 * returns at once: the provider batches and re-schedules itself until the
 * backlog is gone, so both prunes are safe to call from a cron.
 */
function scheduledCleanup(job: typeof components.resend.lib.cleanupOldEmails) {
  return mutation({
    args: { olderThanMs: v.optional(v.number()) },
    returns: v.null(),
    handler: async (ctx, { olderThanMs }) => {
      await ctx.scheduler.runAfter(0, job, { olderThan: olderThanMs })
      return null
    },
  })
}

/**
 * Prune finalized emails (delivered, bounced, cancelled, failed …) older than
 * `olderThanMs` (the nested provider's default: 7 days) from the provider
 * component's tables. Scheduled rather than run inline — the provider batches
 * and re-schedules itself until the backlog is gone — so this returns at once
 * and is safe to call from a cron. Exposed as `components.backend.email.cleanup`.
 */
export const cleanup = scheduledCleanup(components.resend.lib.cleanupOldEmails)

/**
 * Prune abandoned emails — created more than `olderThanMs` ago (the nested
 * provider's default: 30 days) and never finalized, e.g. because a delivery
 * webhook never arrived. Scheduled like {@link cleanup}. Exposed as
 * `components.backend.email.cleanupAbandoned`.
 */
export const cleanupAbandoned = scheduledCleanup(components.resend.lib.cleanupAbandonedEmails)

/**
 * The event types the nested provider component tracks against sent-email
 * records (delivery status behind `useEmailStatus`). Everything else the
 * provider can send (`contact.*`, `domain.*`, scheduling events) is verified
 * here too and dispatched to the app's typed handlers — just not
 * status-tracked.
 */
const TRACKED_EMAIL_EVENTS = new Set([
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.complained',
  'email.bounced',
  'email.opened',
  'email.clicked',
  'email.failed',
])

/**
 * Verify and process an email-provider event webhook. The mounting app routes
 * its public `/email/events` endpoint here (via `setupEmail().webhookHandler`),
 * passing the raw body + headers.
 *
 * Fail-closed: no `EMAIL_WEBHOOK_SECRET` → `503` (never silent acceptance);
 * signature invalid across the rotation accept-list (comma-separated secrets)
 * → `403`; verified → the 8 status-tracked `email.*` types update the email's
 * delivery record (making `useEmailStatus()` reactive) and everything answers
 * `202` with the parsed type so the app layer can dispatch its handlers.
 * The one webhook verifier (`webhook-signatures.ts`, Standard Webhooks, which
 * Svix's scheme is) refuses a timestamp more than five minutes off either
 * way, so stale replays fail verification.
 */
export const handleWebhook = action({
  args: { body: v.string(), headers: v.record(v.string(), v.string()) },
  returns: v.object({ status: v.number(), body: v.string(), type: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const secrets = (env.EMAIL_WEBHOOK_SECRET ?? '')
      .split(',')
      .map(entry => entry.trim())
      .filter(Boolean)
    if (secrets.length === 0) {
      return { status: 503, body: 'Webhook secret not configured' }
    }

    if (!verifyWebhookSignature(secrets, args.body, args.headers)) {
      return { status: 403, body: 'Invalid signature' }
    }

    // The verifier parses nothing, so the event is parsed here, from the
    // body it verified. An authentic body that is not JSON carries no event
    // type and takes the unknown-event path below.
    let payload: unknown
    try {
      payload = JSON.parse(args.body)
    }
    catch {
      // Authentic but not JSON: no event type.
    }

    const type = typeof (payload as { type?: unknown } | null)?.type === 'string'
      ? (payload as { type: string }).type
      : undefined
    if (type && TRACKED_EMAIL_EVENTS.has(type)) {
      // The exact call the provider component's own webhook handler makes
      // after ITS verification — forwarding pre-verified events skips the
      // duplicate check (and its missing-secret throw). Pinned by tests.
      await ctx.runMutation(components.resend.lib.handleEmailEvent, { event: payload })
    }
    return { status: 202, body: '', type }
  },
})
