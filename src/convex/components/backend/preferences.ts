import { v } from 'convex/values'
import { Resend } from 'resend'
import { undeliverableReason } from '../../delivery.js'
import { ALL_TOPICS, CONFIRMATION_TTL_MS, MINUTE_MS, PER_WEEK_MAX, quietHoursEnd, topicConsentKind, type TopicState, vResolvedCaps, WEEK_MS } from '../../email-preferences.js'
import { logBackend } from '../../log.js'
import { normalizeEmail } from '../../tokens.js'
import { addressDigest } from '../../waitlist-rules.js'
import { internal } from './_generated/api.js'
import type { Doc, Id } from './_generated/dataModel.js'
import { env, internalAction, internalMutation, internalQuery, mutation, type MutationCtx, query, type QueryCtx } from './_generated/server.js'
import { recordFor } from './consents.js'
import { armStalled } from './lifecycleActivity.js'

/**
 * Email preferences: the component's half of `setupEmail({ topics, caps })`.
 * Each person's topic choices live here, beside the sends that read them,
 * so a send under a topic checks the choice and the sending rules (the
 * weekly cap, quiet hours, the sunset) in its own transaction. A choice made
 * here reaches the provider's contact by a job right after; a choice made at
 * the provider (its hosted page, its API) comes back by its
 * `contact.topics.updated` webhook (`providerTopics`), and an unsubscribe
 * from everything there by its `contact.updated` (`providerContact`).
 *
 * The app's `setupEmail` holds the topics' words and defaults and passes
 * what a call needs; nothing here knows a topic it was not told about. Every
 * function trusts its caller, the app, which decides who may call it.
 */

const vTopicRef = v.object({ key: v.string(), subscribedByDefault: v.boolean() })
const vState = v.union(v.literal('subscribed'), v.literal('unsubscribed'), v.literal('pending'))
/** What the consent ledger records of a topic when a choice is a consent. */
const vConsent = v.object({ version: v.string(), text: v.string() })

type Contact = Doc<'emailContacts'>

/** The most sends the weekly cap remembers for one address: as many as the highest cap counts. */
const RECENT_SENDS_MAX = PER_WEEK_MAX

/** The most one-click unsubscribes one contact takes in a minute: mail providers send them from shared addresses, so the limit counts tokens, never IP addresses. */
const UNSUBSCRIBES_PER_MINUTE = 20

/** How long after a double opt-in's confirmation went out another may go, however often the person asks or toggles the topic. */
const CONFIRMATION_RESEND_MS = 5 * MINUTE_MS

/** Engagement is written at most once in this long, so activity does not churn the row. */
const ENGAGEMENT_GRANULARITY_MS = 60 * MINUTE_MS

/** How many times a contact's write to the provider is tried before it waits for the next change. */
const PROVIDER_ATTEMPTS = 5

async function contactByEmail(ctx: QueryCtx, email: string): Promise<Contact | null> {
  return ctx.db.query('emailContacts').withIndex('email', q => q.eq('email', normalizeEmail(email))).first()
}

async function contactByUser(ctx: QueryCtx, userId: string): Promise<Contact | null> {
  return ctx.db.query('emailContacts').withIndex('userId', q => q.eq('userId', userId)).first()
}

/** The account an address belongs to, from the auth tables beside these. */
async function accountAt(ctx: QueryCtx, address: string): Promise<string | undefined> {
  return (await ctx.db.query('user').withIndex('email_name', q => q.eq('email', address)).first())?._id
}

/**
 * The contact of an address, made when there is none. An account's contact
 * follows its address: a new address moves the account's row, so its
 * choices stay with the person. A call by address alone (a send under a
 * topic) reaches the account that holds the address, so a send right after
 * an address change reads the account's choices.
 */
export async function contactFor(ctx: MutationCtx, email: string, userId?: string): Promise<Contact> {
  const address = normalizeEmail(email)
  const account = userId ?? await accountAt(ctx, address)
  const owned = account ? await contactByUser(ctx, account) : null
  if (owned) return await followAddress(ctx, owned, address)
  const existing = await contactByEmail(ctx, address)
  if (!existing) return (await ctx.db.get('emailContacts', await ctx.db.insert('emailContacts', { email: address, ...(account ? { userId: account } : {}) })))!
  if (account && existing.userId !== account) await ctx.db.patch('emailContacts', existing._id, { userId: account })
  return (await ctx.db.get('emailContacts', existing._id))!
}

/**
 * An account's contact, at the account's address now. An address another
 * contact already holds (a waitlist entry that signed up) keeps that row:
 * the account's choices move onto it and the old row goes, so no row is
 * left holding the old address. The old address's contact at the provider
 * is removed, and the new one written.
 */
async function followAddress(ctx: MutationCtx, owned: Contact, address: string): Promise<Contact> {
  if (owned.email === address) return owned
  const other = await contactByEmail(ctx, address)
  const kept = other && other._id !== owned._id ? await mergeInto(ctx, owned, other) : owned._id
  if (kept === owned._id) await ctx.db.patch('emailContacts', owned._id, { email: address })
  await ctx.scheduler.runAfter(0, internal.preferences.removeContact, { email: owned.email, attempt: 1 })
  await queueProviderSync(ctx, kept)
  return (await ctx.db.get('emailContacts', kept))!
}

/**
 * Move an account's contact onto the row that holds its new address: each
 * topic choice (the newer one winning for a topic both rows chose), and
 * what the sending rules read. The account's old row goes, its id kept as
 * an alias of the row kept, so the links already sent with it still work.
 * Answers the row kept.
 */
async function mergeInto(ctx: MutationCtx, owned: Contact, other: Contact): Promise<Id<'emailContacts'>> {
  for (const choice of await ctx.db.query('emailTopicChoices').withIndex('contactId_topic', q => q.eq('contactId', owned._id)).take(200)) {
    const theirs = await choiceOf(ctx, other._id, choice.topic)
    const fields = { state: choice.state, source: choice.source, at: choice.at, pendingUntil: choice.pendingUntil }
    if (!theirs) await ctx.db.insert('emailTopicChoices', { contactId: other._id, topic: choice.topic, ...fields })
    else if (theirs.at < choice.at) await ctx.db.patch('emailTopicChoices', theirs._id, fields)
    await ctx.db.delete('emailTopicChoices', choice._id)
  }
  const engagedAt = Math.max(owned.engagedAt ?? 0, other.engagedAt ?? 0)
  await ctx.db.patch('emailContacts', other._id, {
    userId: owned.userId,
    timeZone: owned.timeZone ?? other.timeZone,
    ...(engagedAt > 0 ? { engagedAt } : {}),
    recentSends: [...(owned.recentSends ?? []), ...(other.recentSends ?? [])].sort((a, b) => a - b).slice(-RECENT_SENDS_MAX),
  })
  for (const alias of await ctx.db.query('emailContactAliases').withIndex('contactId', q => q.eq('contactId', owned._id)).take(100)) {
    await ctx.db.patch('emailContactAliases', alias._id, { contactId: other._id })
  }
  await ctx.db.insert('emailContactAliases', { formerId: owned._id, contactId: other._id })
  await ctx.db.delete('emailContacts', owned._id)
  return other._id
}

/** The contact a signed link names by id: its row, or the row an address change merged it onto. */
async function contactById(ctx: QueryCtx, contactId: string): Promise<Contact | null> {
  const id = ctx.db.normalizeId('emailContacts', contactId)
  const row = id ? await ctx.db.get('emailContacts', id) : null
  if (row) return row
  const alias = await ctx.db.query('emailContactAliases').withIndex('formerId', q => q.eq('formerId', contactId)).first()
  return alias ? await ctx.db.get('emailContacts', alias.contactId) : null
}

async function choiceOf(ctx: QueryCtx, contactId: Id<'emailContacts'>, topic: string): Promise<Doc<'emailTopicChoices'> | null> {
  return ctx.db.query('emailTopicChoices').withIndex('contactId_topic', q => q.eq('contactId', contactId).eq('topic', topic)).first()
}

/** A topic's state for a contact: its choice, a lapsed pending one as no choice, else the topic's default. */
function stateOf(choice: Doc<'emailTopicChoices'> | null, subscribedByDefault: boolean, now: number): TopicState {
  if (choice && !(choice.state === 'pending' && (choice.pendingUntil ?? 0) <= now)) return choice.state
  return subscribedByDefault ? 'subscribed' : 'unsubscribed'
}

/** Write a contact's choice about one topic (`askedAt`: a confirmation goes out now). Answers the state before and after. */
async function writeChoice(ctx: MutationCtx, contactId: Id<'emailContacts'>, topic: { key: string, subscribedByDefault: boolean }, state: TopicState, source: string, now: number, askedAt?: number): Promise<{ before: TopicState, after: TopicState }> {
  const choice = await choiceOf(ctx, contactId, topic.key)
  const before = stateOf(choice, topic.subscribedByDefault, now)
  const fields = { state, source, at: now, pendingUntil: state === 'pending' ? now + CONFIRMATION_TTL_MS : undefined, ...(askedAt !== undefined ? { askedAt } : {}) }
  if (choice) await ctx.db.patch('emailTopicChoices', choice._id, fields)
  else await ctx.db.insert('emailTopicChoices', { contactId, topic: topic.key, ...fields })
  return { before, after: state }
}

/**
 * Record a topic consent on the ledger: joining a topic that is off by
 * default grants it, leaving it withdraws it. A topic on by default is no
 * consent, so nothing is written for it. The account's row, else (no
 * account yet) a hash of the address.
 */
async function recordTopicConsent(ctx: MutationCtx, contact: Contact, topic: { key: string, subscribedByDefault: boolean }, consent: { version: string, text: string } | undefined, granted: boolean, source: string, reference?: string): Promise<void> {
  if (topic.subscribedByDefault || !consent) return
  const subject = contact.userId ? { userId: contact.userId } : { emailHash: await emailHashOf(contact.email) }
  await recordFor(ctx, subject, [{ kind: topicConsentKind(topic.key), version: consent.version, granted, source, text: consent.text, ...(reference ? { reference } : {}) }])
}

function emailHashOf(email: string): Promise<string> {
  return addressDigest(email)
}

/** Queue the write of a contact's choices to the provider. */
export async function queueProviderSync(ctx: MutationCtx, contactId: Id<'emailContacts'>): Promise<void> {
  await ctx.db.patch('emailContacts', contactId, { pendingSync: true })
  await ctx.scheduler.runAfter(0, internal.preferences.writeContact, { contactId, attempt: 1 })
}

// ── Reading ───────────────────────────────────────────────────────────────

/** A person's state for each topic named, and their contact's id (`null` before they have one). */
export const read = query({
  args: { userId: v.optional(v.string()), email: v.optional(v.string()), topics: v.array(vTopicRef) },
  returns: v.object({ contactId: v.union(v.string(), v.null()), topics: v.array(v.object({ key: v.string(), state: vState })) }),
  handler: async (ctx, { userId, email, topics }) => {
    const contact = (userId ? await contactByUser(ctx, userId) : null) ?? (email ? await contactByEmail(ctx, email) : null)
    const now = Date.now()
    const states = await Promise.all(topics.map(async topic => ({
      key: topic.key,
      state: stateOf(contact ? await choiceOf(ctx, contact._id, topic.key) : null, topic.subscribedByDefault, now),
    })))
    return { contactId: contact ? (contact._id as string) : null, topics: states }
  },
})

/** Whether the contact an unsubscribe link names exists, and its state for each topic named. */
export const readContact = query({
  args: { contactId: v.string(), topics: v.array(vTopicRef) },
  returns: v.union(v.null(), v.array(v.object({ key: v.string(), state: vState }))),
  handler: async (ctx, { contactId, topics }) => {
    const contact = await contactById(ctx, contactId)
    if (!contact) return null
    const now = Date.now()
    return await Promise.all(topics.map(async topic => ({ key: topic.key, state: stateOf(await choiceOf(ctx, contact._id, topic.key), topic.subscribedByDefault, now) })))
  },
})

// ── Choosing ──────────────────────────────────────────────────────────────

/**
 * A person joins or leaves one topic. Joining a topic with double opt-in
 * from anywhere but its confirmation click leaves it `pending` (the app
 * sends the confirmation email). Answers the contact and the new state, and
 * whether it changed: a pending one changes, and so sends a fresh link, at
 * most once in `CONFIRMATION_RESEND_MS`, however often the person asks.
 */
export const choose = mutation({
  args: {
    email: v.string(),
    userId: v.optional(v.string()),
    topic: v.object({ key: v.string(), subscribedByDefault: v.boolean(), doubleOptIn: v.boolean(), consent: v.optional(vConsent) }),
    subscribe: v.boolean(),
    source: v.string(),
    /** What the choice came with, for the consent ledger: `checkout:<id>` for a soft opt-in. */
    reference: v.optional(v.string()),
  },
  returns: v.object({ contactId: v.string(), state: vState, changed: v.boolean() }),
  handler: async (ctx, { email, userId, topic, subscribe, source, reference }) => {
    const now = Date.now()
    const contact = await contactFor(ctx, email, userId)
    const wanted = wantedState(topic.doubleOptIn, subscribe, source)
    const choice = await choiceOf(ctx, contact._id, topic.key)
    const current = stateOf(choice, topic.subscribedByDefault, now)
    if (current === wanted && wanted !== 'pending') return { contactId: contact._id as string, state: current, changed: false }
    if (wanted === 'pending') {
      // Asking again sends a fresh link with a new lapse, but not within minutes of the last one: leaving and joining again counts too.
      const asked = choice?.askedAt !== undefined && now - choice.askedAt < CONFIRMATION_RESEND_MS
      if (!asked || current !== 'pending') await writeChoice(ctx, contact._id, topic, 'pending', source, now, asked ? undefined : now)
      return { contactId: contact._id as string, state: 'pending' as const, changed: !asked }
    }
    await writeChoice(ctx, contact._id, topic, wanted, source, now)
    await recordTopicConsent(ctx, contact, topic, topic.consent, wanted === 'subscribed', source, reference)
    await queueProviderSync(ctx, contact._id)
    return { contactId: contact._id as string, state: wanted, changed: true }
  },
})

/** The state a choice asks for: joining a double opt-in topic waits for its confirmation, unless it is that confirmation or a soft opt-in. */
function wantedState(doubleOptIn: boolean, subscribe: boolean, source: string): TopicState {
  if (!subscribe) return 'unsubscribed'
  return !doubleOptIn || source === 'double-opt-in' || source === 'soft-opt-in' ? 'subscribed' : 'pending'
}

/**
 * The confirmation click of a double opt-in: a pending choice becomes
 * `subscribed`. `nothing` when there is no pending choice to confirm (it
 * lapsed, or the link was used): the link works once.
 */
export const confirm = mutation({
  args: { contactId: v.string(), topic: v.object({ key: v.string(), subscribedByDefault: v.boolean(), consent: v.optional(vConsent) }) },
  returns: v.union(v.literal('confirmed'), v.literal('nothing')),
  handler: async (ctx, { contactId, topic }) => {
    const contact = await contactById(ctx, contactId)
    if (!contact) return 'nothing'
    const now = Date.now()
    const choice = await choiceOf(ctx, contact._id, topic.key)
    if (!choice || choice.state !== 'pending' || (choice.pendingUntil ?? 0) <= now) return 'nothing'
    await writeChoice(ctx, contact._id, topic, 'subscribed', 'double-opt-in', now)
    await recordTopicConsent(ctx, contact, topic, topic.consent, true, 'double-opt-in')
    await queueProviderSync(ctx, contact._id)
    return 'confirmed'
  },
})

/**
 * Leave one topic, or every topic named (`*`): the unsubscribe link, the
 * one-click route, the profile's "Unsubscribe from all". By the contact's
 * id (from a signed link) or the account's. `false` for a contact that does
 * not exist, or one past the per-token limit, so a caller answers the same
 * either way.
 */
export const unsubscribe = mutation({
  args: {
    contactId: v.optional(v.string()),
    userId: v.optional(v.string()),
    topic: v.string(),
    topics: v.array(v.object({ key: v.string(), subscribedByDefault: v.boolean(), consent: v.optional(vConsent) })),
    source: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, { contactId, userId, topic, topics, source }) => {
    const contact = await namedContact(ctx, contactId, userId)
    if (!contact) return false
    if (contactId && !await counted(ctx, contact)) return false
    const now = Date.now()
    let changed = false
    for (const entry of topics.filter(entry => topic === ALL_TOPICS || entry.key === topic)) {
      changed = await leave(ctx, contact, entry, source, now) || changed
    }
    if (changed) await queueProviderSync(ctx, contact._id)
    return true
  },
})

/** The contact a call names: by its id (from a signed link), else by the account. */
async function namedContact(ctx: MutationCtx, contactId: string | undefined, userId: string | undefined): Promise<Contact | null> {
  if (contactId) return await contactById(ctx, contactId)
  return userId ? await contactByUser(ctx, userId) : null
}

/** Count one unsubscribe by a contact's token, in fixed one-minute windows: `false` past the limit. */
async function counted(ctx: MutationCtx, contact: Contact): Promise<boolean> {
  const now = Date.now()
  const hits = contact.unsubscribeHits && now - contact.unsubscribeHits.windowStart < MINUTE_MS ? contact.unsubscribeHits : { windowStart: now, count: 0 }
  if (hits.count >= UNSUBSCRIBES_PER_MINUTE) return false
  await ctx.db.patch('emailContacts', contact._id, { unsubscribeHits: { windowStart: hits.windowStart, count: hits.count + 1 } })
  return true
}

/** Leave one topic: whether anything changed. A topic the contact was in withdraws its consent. */
async function leave(ctx: MutationCtx, contact: Contact, topic: { key: string, subscribedByDefault: boolean, consent?: { version: string, text: string } }, source: string, now: number): Promise<boolean> {
  const current = stateOf(await choiceOf(ctx, contact._id, topic.key), topic.subscribedByDefault, now)
  if (current === 'unsubscribed') return false
  await writeChoice(ctx, contact._id, topic, 'unsubscribed', source, now)
  if (current === 'subscribed') await recordTopicConsent(ctx, contact, topic, topic.consent, false, source)
  return true
}

/** Whether a choice was made after the provider's event (`at`): a late or repeated event never undoes it. */
function newerThan(choice: Doc<'emailTopicChoices'> | null, at: number | undefined): boolean {
  return choice !== null && at !== undefined && choice.at > at
}

/**
 * A choice made at the provider (its hosted page, its API, an automation),
 * from its `contact.topics.updated` webhook, by the provider's topic ids.
 * The copy here follows; nothing goes back to the provider. Topics this
 * deployment has no id for are skipped, and so is a topic chosen here after
 * the event (`at`, when the provider made it).
 */
export const providerTopics = mutation({
  args: { email: v.string(), at: v.optional(v.number()), topics: v.array(v.object({ id: v.string(), subscription: v.string() })) },
  returns: v.number(),
  handler: async (ctx, { email, at, topics }) => {
    const contact = await contactByEmail(ctx, email)
    if (!contact) return 0
    let applied = 0
    for (const { id, subscription } of topics) {
      if (subscription !== 'opt_in' && subscription !== 'opt_out') continue
      if (await followProvider(ctx, contact, id, subscription === 'opt_in' ? 'subscribed' : 'unsubscribed', at)) applied++
    }
    return applied
  },
})

/**
 * The provider's contact changed (`contact.updated`): unsubscribed from
 * everything there (its hosted page's "unsubscribe from everything") leaves
 * every topic named here, once, as a withdrawal; a topic chosen here after
 * the event keeps its choice. `unsubscribed: false` there subscribes nobody:
 * it only lets the next unsubscribe count again. Answers how many topics it
 * left.
 */
export const providerContact = mutation({
  args: {
    email: v.string(),
    unsubscribed: v.boolean(),
    at: v.optional(v.number()),
    topics: v.array(v.object({ key: v.string(), subscribedByDefault: v.boolean(), consent: v.optional(vConsent) })),
  },
  returns: v.number(),
  handler: async (ctx, { email, unsubscribed, at, topics }) => {
    const contact = await contactByEmail(ctx, email)
    // Every later change of the contact repeats the flag: only its change counts.
    if (!contact || unsubscribed === (contact.providerUnsubscribed === true)) return 0
    await ctx.db.patch('emailContacts', contact._id, { providerUnsubscribed: unsubscribed })
    if (!unsubscribed) return 0
    const now = Date.now()
    let left = 0
    for (const topic of topics) {
      if (newerThan(await choiceOf(ctx, contact._id, topic.key), at)) continue
      if (await leave(ctx, contact, topic, 'provider', at ?? now)) left++
    }
    return left
  },
})

/** Follow the provider's word on one topic, by its id: whether it changed anything. A withdrawal there is a withdrawal here. */
async function followProvider(ctx: MutationCtx, contact: Contact, providerId: string, state: 'subscribed' | 'unsubscribed', at: number | undefined): Promise<boolean> {
  const known = await ctx.db.query('emailProviderIds').withIndex('providerId', q => q.eq('providerId', providerId)).first()
  if (!known || known.kind !== 'topic') return false
  const choice = await choiceOf(ctx, contact._id, known.key)
  if (choice?.state === state || newerThan(choice, at)) return false
  // Dated when the provider made it, so its own later changes still follow.
  const fields = { state, source: 'provider', at: at ?? Date.now(), pendingUntil: undefined }
  if (choice) await ctx.db.patch('emailTopicChoices', choice._id, fields)
  else await ctx.db.insert('emailTopicChoices', { contactId: contact._id, topic: known.key, ...fields })
  // A grant there was recorded where it was given.
  if (state === 'unsubscribed') {
    const subject = contact.userId ? { userId: contact.userId } : { emailHash: await emailHashOf(contact.email) }
    await recordFor(ctx, subject, [{ kind: topicConsentKind(known.key), version: known.version ?? '', granted: false, source: 'provider' }])
  }
  return true
}

// ── The sending rules ─────────────────────────────────────────────────────

/** What a send under a topic may do: go out (at `at` when quiet hours hold it), or be skipped, and why. */
const vGate = v.union(
  v.object({ outcome: v.literal('send'), contactId: v.string(), at: v.union(v.number(), v.null()) }),
  v.object({ outcome: v.literal('skipped'), reason: v.union(v.literal('unsubscribed'), v.literal('capped'), v.literal('sunset')) }),
)

/** The sending rules as the app resolved them (`resolveCaps`). */
const vCaps = vResolvedCaps

/**
 * Decide one non-transactional send to one address: the topic's choice (when
 * there is a topic), then the sunset, then the weekly cap, then the quiet
 * hours. A send that goes out is counted for the cap here, so two sends in
 * one moment never both slip under it. Engagement counts clicks and app
 * activity, never opens; a contact with none is measured from when it was
 * made.
 */
export const gate = mutation({
  args: { email: v.string(), userId: v.optional(v.string()), topic: v.optional(vTopicRef), caps: vCaps, sunset: v.optional(v.boolean()) },
  returns: vGate,
  handler: async (ctx, args) => decideSend(ctx, args),
})

/**
 * The gate's decision, for a caller in this component: a lifecycle flow's
 * step. `explicit` asks for a choice the person made on purpose: a topic
 * on by default does not count, as for every flow a billing event starts.
 */
export async function decideSend(ctx: MutationCtx, { email, userId, topic, caps, explicit, sunset }: { email: string, userId?: string, topic?: { key: string, subscribedByDefault: boolean }, caps: typeof vCaps.type, explicit?: boolean, sunset?: boolean }): Promise<typeof vGate.type> {
  const now = Date.now()
  const contact = await contactFor(ctx, email, userId)
  // A notification is news about the person's own account or work: the sunset rule, which stops mail nobody reads, leaves it be.
  const reason = await skipReason(ctx, contact, topic, sunset === false ? { ...caps, sunsetAfterMs: Number.POSITIVE_INFINITY } : caps, now, explicit === true)
  if (reason) return { outcome: 'skipped' as const, reason }
  const at = quietHoursEnd(now, contact.timeZone, caps.quietHours)
  await ctx.db.patch('emailContacts', contact._id, { recentSends: [...recentSends(contact, now), at ?? now].slice(-RECENT_SENDS_MAX) })
  return { outcome: 'send' as const, contactId: contact._id as string, at }
}

/**
 * Whether a contact is in a topic now (`explicit`: joined on purpose, as
 * `decideSend` reads it). A send the quiet hours held asks again as it
 * goes, so a person who left the topic meanwhile gets nothing.
 */
export async function inTopic(ctx: QueryCtx, contactId: Id<'emailContacts'>, topic: { key: string, subscribedByDefault: boolean }, explicit = false): Promise<boolean> {
  return stateOf(await choiceOf(ctx, contactId, topic.key), explicit ? false : topic.subscribedByDefault, Date.now()) === 'subscribed'
}

/** The sends the weekly cap counts: those of the last 7 days. */
function recentSends(contact: Contact, now: number): number[] {
  return (contact.recentSends ?? []).filter(at => now - at < WEEK_MS)
}

/** Why a send is skipped: the topic's choice, the sunset (a contact with no engagement is measured from when it was made), the weekly cap; `null` when it goes. */
async function skipReason(ctx: MutationCtx, contact: Contact, topic: { key: string, subscribedByDefault: boolean } | undefined, caps: typeof vCaps.type, now: number, explicit = false): Promise<'unsubscribed' | 'sunset' | 'capped' | null> {
  if (topic && !await inTopic(ctx, contact._id, topic, explicit)) return 'unsubscribed'
  if (now - Math.max(contact.engagedAt ?? 0, contact._creationTime) > caps.sunsetAfterMs) return 'sunset'
  if (caps.perWeek !== null && recentSends(contact, now).length >= caps.perWeek) return 'capped'
  return null
}

/**
 * When a send held by the quiet hours may go: the end of the window the
 * person is in now, or `null`. For a push notification, which is not
 * counted for the cap.
 */
export const quietUntil = query({
  args: { userId: v.string(), quietHours: v.union(v.object({ start: v.number(), end: v.number() }), v.null()) },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, { userId, quietHours }) => quietHoursEnd(Date.now(), (await contactByUser(ctx, userId))?.timeZone, quietHours),
})

/** A click in an email, or activity in the app: the person is engaged now, which the sunset rule reads. */
export const engaged = mutation({
  args: { email: v.optional(v.string()), userId: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { email, userId }) => {
    const contact = (userId ? await contactByUser(ctx, userId) : null) ?? (email ? await contactByEmail(ctx, email) : null)
    const now = Date.now()
    if (contact && now - (contact.engagedAt ?? 0) >= ENGAGEMENT_GRANULARITY_MS) {
      await ctx.db.patch('emailContacts', contact._id, { engagedAt: now })
      await armStalled(ctx, contact)
    }
    return null
  },
})

/** The time zone a person's browser reported at sign-in, which quiet hours read. Activity at the same time. */
export const seen = mutation({
  args: { userId: v.string(), email: v.string(), timeZone: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { userId, email, timeZone }) => {
    const contact = await contactFor(ctx, email, userId)
    const now = Date.now()
    const patch: Partial<Contact> = {}
    if (timeZone && timeZone !== contact.timeZone) patch.timeZone = timeZone
    if (now - (contact.engagedAt ?? 0) >= ENGAGEMENT_GRANULARITY_MS) patch.engagedAt = now
    if (Object.keys(patch).length > 0) await ctx.db.patch('emailContacts', contact._id, patch)
    if (patch.engagedAt !== undefined) await armStalled(ctx, contact)
    // An account becomes the provider's contact once, in the accounts' segment, and again when its address changed.
    if (contact.pendingSync !== false) await queueProviderSync(ctx, contact._id)
    return null
  },
})

// ── The provider's ids ────────────────────────────────────────────────────

const vProviderId = v.object({ kind: v.union(v.literal('topic'), v.literal('segment')), key: v.string(), providerId: v.string(), version: v.optional(v.string()) })

/** The provider's id of each object `email sync` made or found: the topics, and the accounts' segment. */
export const providerIds = query({
  args: {},
  returns: v.array(vProviderId),
  handler: async ctx => (await ctx.db.query('emailProviderIds').take(200)).map(({ kind, key, providerId, version }) => ({ kind, key, providerId, ...(version !== undefined ? { version } : {}) })),
})

/** Keep the provider's ids, as `email sync` found or made them. */
export const saveProviderIds = mutation({
  args: { ids: v.array(vProviderId) },
  returns: v.null(),
  handler: async (ctx, { ids }) => {
    const now = Date.now()
    for (const entry of ids) {
      const row = await ctx.db.query('emailProviderIds').withIndex('kind_key', q => q.eq('kind', entry.kind).eq('key', entry.key)).first()
      if (row) await ctx.db.patch('emailProviderIds', row._id, { providerId: entry.providerId, version: entry.version, syncedAt: now })
      else await ctx.db.insert('emailProviderIds', { ...entry, syncedAt: now })
    }
    return null
  },
})

// ── Writing to the provider ───────────────────────────────────────────────

/** The key of the segment that holds the app's accounts. */
export const ACCOUNTS_SEGMENT = 'accounts'

/** Whether the provider's refusal is the contact being there already. */
const alreadyThere = (error: { name?: string, statusCode?: number | null }) => error.statusCode === 409 || error.name === 'already_exists'

/** Whether the provider's refusal is the contact being gone already. */
const alreadyGone = (error: { name?: string, statusCode?: number | null }) => error.statusCode === 404 || error.name === 'not_found'

/** A contact as the provider is given it: the address, the accounts' segment for an account's contact (no other), and each topic with an id, opted in or out. */
export const contactForProvider = internalQuery({
  args: { contactId: v.id('emailContacts') },
  returns: v.union(v.null(), v.object({ email: v.string(), segmentId: v.union(v.string(), v.null()), topics: v.array(v.object({ id: v.string(), subscription: v.union(v.literal('opt_in'), v.literal('opt_out')) })) })),
  handler: async (ctx, { contactId }) => {
    const contact = await ctx.db.get('emailContacts', contactId)
    if (!contact || !contact.pendingSync) return null
    const topics: Array<{ id: string, subscription: 'opt_in' | 'opt_out' }> = []
    for await (const choice of ctx.db.query('emailTopicChoices').withIndex('contactId_topic', q => q.eq('contactId', contactId))) {
      if (choice.state === 'pending') continue
      const known = await ctx.db.query('emailProviderIds').withIndex('kind_key', q => q.eq('kind', 'topic').eq('key', choice.topic)).first()
      if (known) topics.push({ id: known.providerId, subscription: choice.state === 'subscribed' ? 'opt_in' : 'opt_out' })
    }
    // Only an account joins the accounts' segment, which announcements to every account reach.
    const segment = contact.userId ? await ctx.db.query('emailProviderIds').withIndex('kind_key', q => q.eq('kind', 'segment').eq('key', ACCOUNTS_SEGMENT)).first() : null
    return { email: contact.email, segmentId: segment?.providerId ?? null, topics }
  },
})

/** The contact is written: nothing pending until the next change. */
export const contactWritten = internalMutation({
  args: { contactId: v.id('emailContacts') },
  returns: v.null(),
  handler: async (ctx, { contactId }) => {
    if (await ctx.db.get('emailContacts', contactId)) await ctx.db.patch('emailContacts', contactId, { pendingSync: false })
    return null
  },
})

/** One contact at the provider: made (in the accounts' segment) or found, then its topics. A refusal throws. */
async function writeToProvider(resend: Resend, contact: { email: string, segmentId: string | null, topics: Array<{ id: string, subscription: 'opt_in' | 'opt_out' }> }): Promise<void> {
  const created = await resend.contacts.create({ email: contact.email, ...(contact.segmentId ? { segments: [{ id: contact.segmentId }] } : {}) })
  if (created.error && !alreadyThere(created.error)) throw new Error(`create the contact: ${created.error.message}`)
  if (created.error && contact.segmentId) {
    const added = await resend.contacts.segments.add({ email: contact.email, segmentId: contact.segmentId })
    if (added.error && !alreadyThere(added.error)) throw new Error(`add the contact to the accounts' segment: ${added.error.message}`)
  }
  if (contact.topics.length === 0) return
  const updated = await resend.contacts.topics.update({ email: contact.email, topics: contact.topics })
  if (updated.error) throw new Error(`update the contact's topics: ${updated.error.message}`)
}

/**
 * Write a contact's choices to the provider: the contact made when it is
 * not there, then its topics. A deployment that cannot deliver to the
 * address (no key, or test mode with an address that is no test one)
 * writes nothing. A failure is tried again with backoff, a few times; the
 * next change writes it in any case.
 */
export const writeContact = internalAction({
  args: { contactId: v.id('emailContacts'), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, { contactId, attempt }) => {
    const contact = await ctx.runQuery(internal.preferences.contactForProvider, { contactId })
    if (!contact) return null
    const key = env.EMAIL_API_KEY
    if (!key || undeliverableReason(contact.email)) {
      await ctx.runMutation(internal.preferences.contactWritten, { contactId })
      return null
    }
    try {
      await writeToProvider(new Resend(key), contact)
      await ctx.runMutation(internal.preferences.contactWritten, { contactId })
    }
    catch (error) {
      if (attempt >= PROVIDER_ATTEMPTS) {
        logBackend('warn', 'email.preferences_unsynced', 'An email contact\'s topic choices did not reach the email provider; the deployment\'s copy holds them, and the next change writes them again.', error)
        return null
      }
      await ctx.scheduler.runAfter(2 ** attempt * 1000, internal.preferences.writeContact, { contactId, attempt: attempt + 1 })
    }
    return null
  },
})

/** Whether a contact here holds the address. */
export const addressHeld = internalQuery({
  args: { email: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { email }) => (await contactByEmail(ctx, email)) !== null,
})

/**
 * Remove the provider's contact of an address no contact here holds any
 * more: an account's old address, once the account moved to a new one, so
 * neither broadcasts nor an erasure miss it. One the provider does not
 * have is fine; a failure is tried again with backoff, a few times.
 */
export const removeContact = internalAction({
  args: { email: v.string(), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, { email, attempt }) => {
    const key = env.EMAIL_API_KEY
    if (!key || undeliverableReason(email) || await ctx.runQuery(internal.preferences.addressHeld, { email })) return null
    const { error } = await new Resend(key).contacts.remove({ email })
    if (!error || alreadyGone(error)) return null
    if (attempt >= PROVIDER_ATTEMPTS) {
      logBackend('warn', 'email.preferences_unsynced', 'An account\'s old address could not be removed from the email provider\'s contacts after a few tries; remove it there by hand.', error)
      return null
    }
    await ctx.scheduler.runAfter(2 ** attempt * 1000, internal.preferences.removeContact, { email, attempt: attempt + 1 })
    return null
  },
})

// ── Erasure and export ────────────────────────────────────────────────────

/** The most choices an erasure batch deletes. */
const FORGET_BATCH = 200

/**
 * An account's part of an erasure, one batch: its contact and the choices
 * of it, by the account and by its address. `true` while rows are left.
 */
export async function forgetEmailContact(ctx: MutationCtx, { userId, email }: { userId?: string, email?: string }): Promise<boolean> {
  const contacts = [
    ...(userId ? await ctx.db.query('emailContacts').withIndex('userId', q => q.eq('userId', userId)).take(5) : []),
    ...(email ? await ctx.db.query('emailContacts').withIndex('email', q => q.eq('email', normalizeEmail(email))).take(5) : []),
  ]
  let left = FORGET_BATCH
  for (const contact of contacts) {
    const choices = await ctx.db.query('emailTopicChoices').withIndex('contactId_topic', q => q.eq('contactId', contact._id)).take(left)
    for (const choice of choices) await ctx.db.delete('emailTopicChoices', choice._id)
    left -= choices.length
    const aliases = await ctx.db.query('emailContactAliases').withIndex('contactId', q => q.eq('contactId', contact._id)).take(left)
    for (const alias of aliases) await ctx.db.delete('emailContactAliases', alias._id)
    left -= aliases.length
    if (left <= 0) return true
    if (await ctx.db.get('emailContacts', contact._id)) await ctx.db.delete('emailContacts', contact._id)
  }
  return false
}

/** A person's topic choices for their export. */
export async function exportEmailPreferences(ctx: QueryCtx, userId: string) {
  const contact = await contactByUser(ctx, userId)
  if (!contact) return { emailTopics: [] }
  const choices = await ctx.db.query('emailTopicChoices').withIndex('contactId_topic', q => q.eq('contactId', contact._id)).take(200)
  return { emailTopics: choices.map(({ topic, state, source, at }) => ({ topic, state, source, at })), ...(contact.timeZone ? { timeZone: contact.timeZone } : {}) }
}
