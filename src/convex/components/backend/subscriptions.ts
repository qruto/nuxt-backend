import { v } from 'convex/values'
import { mutation, query } from './_generated/server.js'
import { vRenewalConsent, vSaveOfferTerms } from './schema.js'

// The billing lifecycle's own records (LIFECYCLE): the cancel flow's save
// offers, the renewal consent proof, what was sent once (an annual reminder,
// an abandoned checkout's hand-off) and the withdrawals. The app's
// `setupBilling` decides; these only keep what it decided, each write
// checked and taken once.

/** How long an offer stays open after the cancel flow made it: the flow is one sitting. */
export const SAVE_OFFER_OPEN_MS = 60 * 60 * 1000

/** A confirmed consent proof, as an administrator reads it. */
const vConsentProof = vRenewalConsent.omit('checkoutId', 'entityId', 'createdAt', 'consentedAt').extend({ consentedAt: v.number() })

const vOfferRow = v.object({
  id: v.string(),
  entityId: v.string(),
  subscriptionId: v.string(),
  reason: v.string(),
  offer: vSaveOfferTerms,
  madeAt: v.number(),
  acceptedAt: v.optional(v.number()),
})

/**
 * Keep an offer the cancel flow makes; answers its id, the one the browser
 * names it by, or `null` when the entity was made one since `since`: the
 * one-in-12-months rule is kept where the offer is, so two cancellations at
 * once get one offer.
 */
export const recordOffer = mutation({
  args: { entityId: v.string(), subscriptionId: v.string(), reason: v.string(), offer: vSaveOfferTerms, since: v.number() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { since, ...args }) => {
    if (await ctx.db.query('billingSaveOffers').withIndex('entityId_madeAt', q => q.eq('entityId', args.entityId).gte('madeAt', since)).first()) return null
    return await ctx.db.insert('billingSaveOffers', { ...args, madeAt: Date.now() }) as string
  },
})

/** When the entity was last made an offer since `since`, or `null`: the one-in-12-months rule reads it. */
export const lastOffer = query({
  args: { entityId: v.string(), since: v.number() },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, { entityId, since }) => {
    const row = await ctx.db.query('billingSaveOffers').withIndex('entityId_madeAt', q => q.eq('entityId', entityId).gte('madeAt', since)).order('desc').first()
    return row?.madeAt ?? null
  },
})

/** The most offers {@link offerCounts} reads: a cancel flow makes one per entity a year, so a window rarely holds this many. */
const OFFER_COUNT_LIMIT = 10_000

/**
 * How many save offers the cancel flow made in `[since, until)`, and how
 * many of those were accepted: the Revenue view's count beside the billing
 * provider's cancellations per reason. A bounded read through `madeAt`;
 * `truncated` when the window held more than {@link OFFER_COUNT_LIMIT}.
 */
export const offerCounts = query({
  args: { since: v.number(), until: v.number() },
  returns: v.object({ made: v.number(), accepted: v.number(), truncated: v.boolean() }),
  handler: async (ctx, { since, until }) => {
    const rows = await ctx.db.query('billingSaveOffers').withIndex('madeAt', q => q.gte('madeAt', since).lt('madeAt', until)).take(OFFER_COUNT_LIMIT + 1)
    const counted = rows.slice(0, OFFER_COUNT_LIMIT)
    return { made: counted.length, accepted: counted.filter(row => row.acceptedAt !== undefined).length, truncated: rows.length > OFFER_COUNT_LIMIT }
  },
})

/**
 * Take an offer for acceptance, once: the entity's own, made for this
 * subscription when the subscription is named, still open, and not taken
 * before. Answers the offer, or `null` when it is none of these.
 */
export const takeOffer = mutation({
  args: { offerId: v.string(), entityId: v.string() },
  returns: v.union(vOfferRow, v.null()),
  handler: async (ctx, { offerId, entityId }) => {
    const id = ctx.db.normalizeId('billingSaveOffers', offerId)
    const row = id ? await ctx.db.get('billingSaveOffers', id) : null
    const now = Date.now()
    if (!row || row.entityId !== entityId || row.acceptedAt !== undefined || now - row.madeAt > SAVE_OFFER_OPEN_MS) return null
    await ctx.db.patch('billingSaveOffers', row._id, { acceptedAt: now })
    const { _id, _creationTime, ...rest } = row
    return { ...rest, id: _id as string, acceptedAt: now }
  },
})

/** Give an offer back when applying it failed at the provider, so the customer may try again. */
export const releaseOffer = mutation({
  args: { offerId: v.string() },
  returns: v.null(),
  handler: async (ctx, { offerId }) => {
    const id = ctx.db.normalizeId('billingSaveOffers', offerId)
    if (id) await ctx.db.patch('billingSaveOffers', id, { acceptedAt: undefined })
    return null
  },
})

/** The renewal consent a checkout showed, kept as it is made and confirmed when its subscription arrives. */
export const recordConsent = mutation({
  args: vRenewalConsent.omit('createdAt', 'subscriptionId', 'consentedAt'),
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('billingRenewalConsents').withIndex('checkoutId', q => q.eq('checkoutId', args.checkoutId)).first()
    if (!existing) await ctx.db.insert('billingRenewalConsents', { ...args, createdAt: Date.now() })
    return null
  },
})

/** The subscription a checkout started arrived: its consent proof is confirmed, with the time it was given. Answers whether one was. */
export const confirmConsent = mutation({
  args: { checkoutId: v.string(), subscriptionId: v.string(), at: v.number() },
  returns: v.boolean(),
  handler: async (ctx, { checkoutId, subscriptionId, at }) => {
    const row = await ctx.db.query('billingRenewalConsents').withIndex('checkoutId', q => q.eq('checkoutId', checkoutId)).first()
    if (!row || row.consentedAt !== undefined) return false
    await ctx.db.patch('billingRenewalConsents', row._id, { subscriptionId, consentedAt: at })
    return true
  },
})

/**
 * When a subscription's plan was last bought through a renewing checkout:
 * its newest confirmed consent proof, or `null`. An upgrade from the free
 * plan keeps the free plan's subscription and its start, so this is the
 * purchase the withdrawal period runs from.
 */
export const purchasedAt = query({
  args: { subscriptionId: v.string() },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, { subscriptionId }) => {
    const row = await ctx.db.query('billingRenewalConsents').withIndex('subscriptionId_consentedAt', q => q.eq('subscriptionId', subscriptionId).gt('consentedAt', 0)).order('desc').first()
    return row?.consentedAt ?? null
  },
})

/** A billing entity's confirmed consent proofs, newest first: what an administrator shows a regulator. */
export const consents = query({
  args: { entityId: v.string() },
  returns: v.array(vConsentProof),
  handler: async (ctx, { entityId }) => {
    const rows = await ctx.db.query('billingRenewalConsents').withIndex('entityId', q => q.eq('entityId', entityId)).order('desc').take(100)
    return rows.flatMap(({ subscriptionId, productId, amount, currency, interval, intervalCount, termsVersion, userId, consentedAt }) =>
      consentedAt === undefined ? [] : [{ subscriptionId, productId, amount, currency, interval, intervalCount, termsVersion, userId, consentedAt }])
  },
})

/**
 * Mark a step of the lifecycle done, once per `every` milliseconds: answers
 * `true` when it was not done within that window (and marks it now), `false`
 * when it was. Without `every`, once for good.
 */
export const markOnce = mutation({
  args: { key: v.string(), every: v.optional(v.number()) },
  returns: v.boolean(),
  handler: async (ctx, { key, every }) => {
    const now = Date.now()
    const row = await ctx.db.query('billingLifecycleMarks').withIndex('key', q => q.eq('key', key)).first()
    if (row && (every === undefined || now - row.at < every)) return false
    if (row) await ctx.db.patch('billingLifecycleMarks', row._id, { at: now })
    else await ctx.db.insert('billingLifecycleMarks', { key, at: now })
    return true
  },
})

/** Give a mark back: the step it stood for failed after it was taken. */
export const unmark = mutation({
  args: { key: v.string() },
  returns: v.null(),
  handler: async (ctx, { key }) => {
    const row = await ctx.db.query('billingLifecycleMarks').withIndex('key', q => q.eq('key', key)).first()
    if (row) await ctx.db.delete('billingLifecycleMarks', row._id)
    return null
  },
})

/** Record a withdrawal, once per subscription. Answers whether this call recorded it. */
export const recordWithdrawal = mutation({
  args: { entityId: v.string(), subscriptionId: v.string(), userId: v.string(), productId: v.string(), at: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('billingWithdrawals').withIndex('subscriptionId', q => q.eq('subscriptionId', args.subscriptionId)).first()
    if (existing) return false
    await ctx.db.insert('billingWithdrawals', args)
    return true
  },
})

/** The withdrawal of a subscription, if one was made: when. */
export const withdrawalOf = query({
  args: { subscriptionId: v.string() },
  returns: v.union(v.object({ at: v.number(), userId: v.string() }), v.null()),
  handler: async (ctx, { subscriptionId }) => {
    const row = await ctx.db.query('billingWithdrawals').withIndex('subscriptionId', q => q.eq('subscriptionId', subscriptionId)).first()
    return row ? { at: row.at, userId: row.userId } : null
  },
})

/** How many of each kind of record the admin console's Billing tab lists. */
const CONSOLE_ROWS = 50

/**
 * The billing lifecycle's records for the admin console, newest first: the
 * save offers the cancel flow made (and whether each was taken), the EU
 * withdrawals, and the confirmed renewal consent proofs, the latest 50 of
 * each. With `entityId`, that billing entity's alone: what an administrator
 * shows a regulator or a customer who asks.
 */
export const lifecycleConsole = query({
  args: { entityId: v.optional(v.string()) },
  returns: v.object({
    saveOffers: v.array(vOfferRow),
    withdrawals: v.array(v.object({ entityId: v.string(), subscriptionId: v.string(), userId: v.string(), productId: v.string(), at: v.number() })),
    consents: v.array(vConsentProof.extend({ entityId: v.string() })),
  }),
  handler: async (ctx, { entityId }) => {
    const offers = entityId === undefined
      ? ctx.db.query('billingSaveOffers').withIndex('madeAt')
      : ctx.db.query('billingSaveOffers').withIndex('entityId_madeAt', q => q.eq('entityId', entityId))
    const withdrawals = entityId === undefined
      ? ctx.db.query('billingWithdrawals').withIndex('at')
      : ctx.db.query('billingWithdrawals').withIndex('entityId', q => q.eq('entityId', entityId))
    // A proof counts once its subscription arrived: the checkouts that started none stay out.
    const consents = entityId === undefined
      ? await ctx.db.query('billingRenewalConsents').withIndex('consentedAt_createdAt', q => q.gt('consentedAt', 0)).order('desc').take(CONSOLE_ROWS)
      : (await ctx.db.query('billingRenewalConsents').withIndex('entityId', q => q.eq('entityId', entityId)).order('desc').take(CONSOLE_ROWS * 2))
          .filter(row => row.consentedAt !== undefined)
          .sort((a, b) => b.consentedAt! - a.consentedAt!)
          .slice(0, CONSOLE_ROWS)
    return {
      saveOffers: (await offers.order('desc').take(CONSOLE_ROWS)).map(({ _id, _creationTime, ...row }) => ({ ...row, id: _id as string })),
      withdrawals: (await withdrawals.order('desc').take(CONSOLE_ROWS)).map(({ entityId, subscriptionId, userId, productId, at }) => ({ entityId, subscriptionId, userId, productId, at })),
      consents: consents.map(({ entityId, subscriptionId, productId, amount, currency, interval, intervalCount, termsVersion, userId, consentedAt }) => ({
        entityId, subscriptionId, productId, amount, currency, interval, intervalCount, termsVersion, userId, consentedAt: consentedAt!,
      })),
    }
  },
})
