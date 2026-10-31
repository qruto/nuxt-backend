import { checkoutsClientUpdate } from '@polar-sh/sdk/funcs/checkoutsClientUpdate.js'
import { checkoutsCreate } from '@polar-sh/sdk/funcs/checkoutsCreate.js'
import { actionGeneric, type Auth, type GenericActionCtx, type GenericDataModel } from 'convex/server'
import { v } from 'convex/values'
import { BILLING_ACCESS, type BillingContext } from './context.js'
import type { BillingCustomers } from './customers.js'
import { type CatalogDiscounts, type KeyedDiscount, refusedDiscount } from './discounts.js'
import type { BillingFreePlan } from './free-plan.js'
import type { BillingLifecycleOps } from './lifecycle.js'
import { campaignMetadata, discountCodeOf, EMAIL_OPT_OUT_METADATA, type PurchaseRules, trialPayload } from './purchase.js'
import type { CheckoutCreateInput, ProviderCtx, RunWriteCtx } from './types/base.js'
import type { CheckoutTrial, ServerCheckoutOptions } from './types/options.js'
import type { BillingEntity } from './types/setup.js'
import { backendError } from '../../errors.js'
import { CHECKOUT_RETURN_PARAM } from '../../constants.js'
import { logBackend } from '../../log.js'
import { pauseCheck, refusePaused } from '../../pauses.js'

/**
 * Refused discount codes a billing entity may try per window, whether or not
 * the app configured a rate limiter: a checkout would otherwise answer
 * "valid or not" for any code anyone types, one after another. A code in
 * flight counts too, so parallel checkouts can't try more between them.
 */
const DISCOUNT_CODE_REFUSALS = { max: 10, windowMs: 60 * 60 * 1000 } as const

const TRIAL_IS_THE_SERVERS = 'a trial is the product\'s own (the catalog\'s `trial`); a different one is the server\'s, through billing.checkout(ctx, { trial })'

/**
 * Statuses of a subscription the entity still holds: a checkout for a
 * second plan beside one of these would bill it twice.
 */
const HELD_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due', 'paused'])

/** What a person reads when they try to subscribe again (see {@link createCheckout}). */
const ALREADY_SUBSCRIBED = 'This account already has a plan. Switch plans instead of subscribing again.'

/** What a client may not choose at checkout: the server's, through `billing.checkout`. */
const SERVER_ONLY = {
  trialInterval: TRIAL_IS_THE_SERVERS,
  trialIntervalCount: TRIAL_IS_THE_SERVERS,
  discountId: 'a discount by id is the server\'s, through billing.checkout(ctx, { discountId }); a client sends `discountCode`',
} as const

/** What a checkout reads when more than one discount is named: the provider takes one. */
const ONE_DISCOUNT = '[nuxt-backend] Billing: a checkout takes one discount — name one of `discount`, `discountCode` and `discountId`.'

/** The provider's placeholder for a checkout's id, which it fills in when it sends the customer back. */
const CHECKOUT_ID_PLACEHOLDER = '{CHECKOUT_ID}'

/**
 * A success URL that brings the checkout's id back to the module's
 * checkout-return plugin: `checkout_return` with the provider's
 * placeholder, before any fragment. Written by hand, not through
 * `URLSearchParams`, which would escape the braces the provider looks for.
 * The parameter is the package's own, so an app's own `checkout_id`
 * (the name the provider suggests) stays as the app wrote it, placeholder
 * and all: the provider fills in every placeholder. A URL that already
 * carries the package's parameter keeps it.
 */
export function withCheckoutReturn(successUrl: string): string {
  if (new URL(successUrl).searchParams.has(CHECKOUT_RETURN_PARAM)) return successUrl
  const hash = successUrl.indexOf('#')
  const base = hash === -1 ? successUrl : successUrl.slice(0, hash)
  const fragment = hash === -1 ? '' : successUrl.slice(hash)
  const separator = !base.includes('?') ? '?' : base.endsWith('?') || base.endsWith('&') ? '' : '&'
  return `${base}${separator}${CHECKOUT_RETURN_PARAM}=${CHECKOUT_ID_PLACEHOLDER}${fragment}`
}

/**
 * An IP address as a request names it: IPv4 dotted, or IPv6 in hex groups
 * (an embedded IPv4 tail included). Anything else is refused rather than
 * sent to the provider.
 */
export function isIpAddress(value: string): boolean {
  if (/^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(value)) return true
  return value.length <= 45 && value.includes(':') && /^[\da-f:.]+$/i.test(value) && (value.match(/::/g)?.length ?? 0) <= 1
}

/** The checkout link: the entity's own provider customer, then a checkout session by its external id. */
export function createCheckout(
  { components, config, provider, cache, catalogIds, requireEntity, requireProviderAccess, unwrapProvider, throttle, recordEvent }: BillingContext,
  { requireTrustedUrl, requireCatalogProducts, requireClientMetadata, requireCurrency }: PurchaseRules,
  { ensureCustomer, profileOf, trialAllowed }: BillingCustomers,
  { freeSubscriptionOf, isFreeProduct }: Pick<BillingFreePlan, 'freeSubscriptionOf' | 'isFreeProduct'>,
  discounts: CatalogDiscounts,
  { recordConsent }: Pick<BillingLifecycleOps, 'recordConsent'>,
) {
  // The pause_checkout kill switch, read on every checkout.
  const paused = pauseCheck(components.backend)
  /** The catalog's plans' products, every interval: what may take the free plan's place. */
  const planProductIds = new Set(Object.values(catalogIds?.plans ?? {}).flatMap(prices => Object.values(prices ?? {})))
  /** Product id → the catalog plan and interval it prices: what `checkoutDiscount` is told. */
  const planOfProduct = new Map(Object.entries(catalogIds?.plans ?? {}).flatMap(([plan, prices]) =>
    Object.entries(prices ?? {}).map(([interval, productId]) => [productId!, { plan, interval: interval as 'month' | 'year' }] as const)))

  /**
   * Build the provider checkout payload from checked options. Only fields
   * the installed `CheckoutCreate` actually has are set — `prefill` maps
   * onto the `customer*` fields, `customFields` onto `customFieldData`,
   * and the campaign onto `utm_*` metadata beside the app's own keys. An
   * owner who already had a trial gets none, whatever the product or the
   * server offers.
   */
  const buildCheckoutPayload = (options: ServerCheckoutOptions, entityId: string, hasCode: boolean, trialUsed: boolean, openedBy: string | undefined): CheckoutCreateInput => {
    const prefill = options.prefill ?? {}
    // Who opened it, for an abandoned checkout's lifecycle email (`billing.checkout_abandoned`).
    const metadata = {
      ...options.metadata,
      ...campaignMetadata(options.utm),
      ...(openedBy ? { openedBy } : {}),
      // The soft opt-in's box, read back on the paid order (`order.paid`).
      ...(options.emailOptOut === undefined ? {} : { [EMAIL_OPT_OUT_METADATA]: String(options.emailOptOut) }),
    }
    return {
      products: options.productIds,
      // By the entity's id, never the email: the customer is the entity's own.
      externalCustomerId: entityId,
      embedOrigin: options.origin,
      // A plan or pack checkout comes back with its id, which the client's
      // checkout-return plugin reads to refresh the entitlements once.
      successUrl: withCheckoutReturn(options.successUrl),
      subscriptionId: options.subscriptionId,
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      // One trial per owner: once one ran on any workspace they own, no checkout starts another.
      ...(trialUsed ? { allowTrial: false } : trialPayload(options.trial)),
      locale: options.locale,
      // The visitor's currency, checked against the catalog's prices: the provider's presentment price in it.
      ...(options.currency ? { currency: options.currency as CheckoutCreateInput['currency'] } : {}),
      // A code applied up front needs codes allowed: the provider refuses one otherwise.
      allowDiscountCodes: hasCode ? true : options.allowDiscountCodes ?? true,
      discountId: options.discountId,
      requireBillingAddress: options.requireBillingAddress,
      customFieldData: options.customFields,
      customerName: prefill.name,
      customerEmail: prefill.email,
      customerBillingName: prefill.billingName,
      // The SDK types `country` as a closed alpha-2 enum; the value is a plain
      // string at this boundary, validated by the provider on submit.
      customerBillingAddress: prefill.billingAddress as CheckoutCreateInput['customerBillingAddress'],
      customerTaxId: prefill.taxId,
      isBusinessCustomer: prefill.business,
      // The visitor's address, for the provider's local pricing; nothing keeps it.
      ...(options.customerIpAddress ? { customerIpAddress: options.customerIpAddress } : {}),
    }
  }

  /**
   * Whether a checkout would start a trial: one the server grants, or the
   * trial a product of the checkout carries (the catalog's `trial`, as the
   * products table synced it), unless the server removed it.
   */
  const offersTrial = async (ctx: RunWriteCtx, options: ServerCheckoutOptions): Promise<boolean> => {
    if (options.trial !== undefined) return options.trial !== false
    for (const productId of options.productIds) {
      const product = await provider.getProduct(ctx as unknown as ProviderCtx, { productId })
      if (product?.trialInterval) return true
    }
    return false
  }

  /**
   * Upgrading a free subscription through checkout acts on it, so it must
   * be the entity's own: the same refusal as the lifecycle operations.
   */
  const requireOwnSubscription = async (ctx: RunWriteCtx, userId: string, subscriptionId: string): Promise<void> => {
    const all = await provider.listAllUserSubscriptions(ctx as unknown as ProviderCtx, { userId })
    if (all.some(subscription => subscription.id === subscriptionId)) return
    throw backendError('forbidden', { reason: 'not_owner' }, `[nuxt-backend] Subscription ${subscriptionId} is not on this billing account.`)
  }

  /** Whether a checkout sells a plan: one of its products is recurring. */
  const sellsPlan = async (ctx: RunWriteCtx, options: ServerCheckoutOptions): Promise<boolean> => {
    for (const productId of options.productIds) {
      if ((await provider.getProduct(ctx as unknown as ProviderCtx, { productId }))?.isRecurring) return true
    }
    return false
  }

  /**
   * Whether a checkout takes the free plan's place: it sells a plan. With
   * `multipleSubscriptions`, only a catalog plan does — a recurring add-on
   * sits beside the free plan and leaves it, its credits and features, be.
   */
  const replacesFreePlan = async (ctx: RunWriteCtx, options: ServerCheckoutOptions): Promise<boolean> => {
    if (config.multipleSubscriptions) return options.productIds.some(productId => planProductIds.has(productId))
    return await sellsPlan(ctx, options)
  }

  /**
   * The subscription a plan's checkout acts on: the one the caller named,
   * else the entity's free subscription, which the provider upgrades in
   * place (its credits and features give way to the plan's, and no second
   * subscription starts). A pack's checkout acts on none.
   */
  const upgradedSubscription = async (ctx: RunWriteCtx, userId: string, options: ServerCheckoutOptions): Promise<string | undefined> => {
    if (options.subscriptionId || !await replacesFreePlan(ctx, options)) return options.subscriptionId
    return (await freeSubscriptionOf(ctx, userId))?.id
  }

  /**
   * One plan per entity: a checkout that would start a new subscription (a
   * recurring product, no `subscriptionId` to act on) is refused while the
   * entity holds one, so a stale or failed read in the browser can never
   * bill a subscriber twice. A plan change goes through
   * `updateSubscription`. The free plan is no plan held: its checkout
   * upgrades it — but only while no other plan is held beside it, so a
   * free plan that started late never lets a second paid plan in. Checked
   * on what the caller asked, before the free subscription is filled in.
   * Packs stay on sale, and `multipleSubscriptions` lifts the rule.
   */
  const requireNoHeldSubscription = async (ctx: RunWriteCtx, userId: string, options: ServerCheckoutOptions): Promise<void> => {
    if (config.multipleSubscriptions || options.subscriptionId) return
    if (!await sellsPlan(ctx, options)) return
    const all = await provider.listAllUserSubscriptions(ctx as unknown as ProviderCtx, { userId })
    const held = all.filter(subscription => subscription.endedAt == null && HELD_SUBSCRIPTION_STATUSES.has(subscription.status))
    let paid = false
    for (const subscription of held) paid ||= !await isFreeProduct(ctx, subscription.productId)
    if (!paid) return
    throw backendError(
      'forbidden',
      { reason: 'already_subscribed', message: ALREADY_SUBSCRIBED },
      '[nuxt-backend] checkout: this billing account already holds a subscription — switch it with updateSubscription (useBilling().changePlan), or turn on multipleSubscriptions.',
    )
  }

  /**
   * Count a discount-code attempt against the entity before a checkout is
   * created for it, check and count in one transaction, or refuse the code
   * while the entity has spent its refused codes for the window. Answers
   * the window the attempt counts in, for {@link releaseDiscountCode}.
   */
  const reserveDiscountCode = async (ctx: RunWriteCtx, userId: string): Promise<number> => {
    const reservation = await ctx.runMutation(cache.reserveDiscountCode, { userId, ...DISCOUNT_CODE_REFUSALS })
    if (reservation.reserved) return reservation.windowStart
    throw backendError(
      'rate_limited',
      { limit: 'discountCode', retryAfter: reservation.retryAfter },
      `[nuxt-backend] Billing: ${DISCOUNT_CODE_REFUSALS.max} discount codes were refused for this account within the hour — try again later.`,
    )
  }

  /** Give back a reserved attempt the provider did not refuse. */
  const releaseDiscountCode = async (ctx: RunWriteCtx, userId: string, windowStart: number): Promise<void> => {
    await ctx.runMutation(cache.releaseDiscountCode, { userId, windowStart })
  }

  /**
   * Apply a discount code the way the provider's own checkout page does: on
   * the created session, through its client secret. The provider checks the
   * code: `false` when it refuses it (unknown, expired, used up, not for
   * this product), and any other failure refuses the checkout as
   * `unavailable`.
   */
  const applyDiscountCode = async (clientSecret: string, discountCode: string): Promise<boolean> => {
    const applied = await checkoutsClientUpdate(provider.polar, { clientSecret, checkoutUpdatePublic: { discountCode } })
    if (applied.ok) return true
    const status = (applied.error as { statusCode?: unknown } | null)?.statusCode
    if (typeof status === 'number' && status >= 400 && status < 500) return false
    unwrapProvider(applied, 'checkout discount')
    return true
  }

  /**
   * The provider checkout itself, for the entity's own subscription and its
   * own customer, with no trial once its owner had one. `null` when the
   * provider refuses its `discountId` (ended, used up, not for this
   * product): the caller decides whether to go on without it.
   */
  const createCheckout = async (ctx: RunWriteCtx & { auth?: Auth }, entity: BillingEntity, requested: ServerCheckoutOptions, hasCode: boolean) => {
    const { userId } = entity
    if (requested.subscriptionId) await requireOwnSubscription(ctx, userId, requested.subscriptionId)
    await requireNoHeldSubscription(ctx, userId, requested)
    const options = { ...requested, subscriptionId: await upgradedSubscription(ctx, userId, requested) }
    const profile = await profileOf(ctx, userId)
    await ensureCustomer(ctx, entity, profile, 'checkout')
    const trialUsed = !(await trialAllowed(ctx, userId, profile, await offersTrial(ctx, options)))
    const openedBy = (await ctx.auth?.getUserIdentity())?.subject
    const created = await checkoutsCreate(provider.polar, buildCheckoutPayload(options, userId, hasCode, trialUsed, openedBy))
    if (!created.ok && options.discountId && refusedDiscount(created.error)) return null
    const checkout = unwrapProvider(created, 'checkout')
    // A renewing checkout's consent proof, kept as it is made (LIFECYCLE).
    await recordConsent(ctx, userId, checkout)
    return checkout
  }

  /**
   * The discount `setupBilling`'s `checkoutDiscount` picks for a checkout
   * of a catalog plan that names none of its own; `undefined` without one,
   * or for one that applies to none of the checkout's products. A key the
   * catalog does not have is the app's mistake, and throws.
   */
  const pickedDiscount = async (ctx: RunWriteCtx & { auth?: Auth }, entity: BillingEntity, options: ServerCheckoutOptions): Promise<KeyedDiscount | undefined> => {
    const pick = config.checkoutDiscount
    const priced = options.productIds.flatMap(productId => planOfProduct.has(productId) ? [{ productId, ...planOfProduct.get(productId)! }] : [])[0]
    if (!pick || !priced || options.discountId) return undefined
    const identity = await ctx.auth?.getUserIdentity()
    const key = await pick(ctx as unknown as GenericActionCtx<GenericDataModel>, { userId: identity?.subject ?? entity.userId, entityId: entity.userId, ...priced })
    if (key == null) return undefined
    const found = discounts.discountOf(key)
    if (!found) throw new Error(`[nuxt-backend] setupBilling's checkoutDiscount picked '${key}', which is no discount of the catalog: declare it in billing.catalog.ts and run \`npx nuxt-backend billing sync\`.`)
    return options.productIds.some(productId => found.productIds.includes(productId)) ? found : undefined
  }

  /**
   * A checkout with a discount of the catalog, by its id: locked on when it
   * has no code (the customer can't swap a server's discount for a typed
   * one). One the provider refuses is the caller's to hear of, as
   * `invalid_input` (`discount`), or, picked by `checkoutDiscount`, dropped:
   * the checkout opens again at the regular price.
   */
  const checkoutWithDiscount = async (ctx: RunWriteCtx & { auth?: Auth }, entity: BillingEntity, options: ServerCheckoutOptions, discount: KeyedDiscount, picked: boolean): Promise<{ url: string }> => {
    const created = await createCheckout(ctx, entity, { ...options, discountId: discount.id, allowDiscountCodes: discount.code ? options.allowDiscountCodes : false }, false)
    if (created) return { url: created.url }
    if (!picked) {
      throw backendError('invalid_input', { field: 'discount' }, `[nuxt-backend] Billing: the provider refused discount '${discount.key}' for this checkout — it has ended, is used up, or this customer redeemed it already.`)
    }
    logBackend('warn', 'billing.checkout_discount_dropped', `The provider refused discount '${discount.key}', which the server picked (checkoutDiscount, or a referral's); the checkout opened at the regular price.`)
    const plain = await createCheckout(ctx, entity, options, false)
    return { url: plain!.url }
  }

  /**
   * A checkout with a discount code. The attempt is reserved before the
   * provider hears of the checkout; a code it refuses keeps it counted and
   * refuses the checkout as `invalid_input`. An accepted code gives the
   * attempt back, and so does a checkout that failed before the code was
   * tried, so an outage spends nothing.
   */
  const checkoutWithCode = async (ctx: RunWriteCtx & { auth?: Auth }, entity: BillingEntity, options: ServerCheckoutOptions, discountCode: string): Promise<{ url: string }> => {
    const { userId } = entity
    const windowStart = await reserveDiscountCode(ctx, userId)
    let refused = false
    try {
      const created = (await createCheckout(ctx, entity, options, true))!
      refused = !(await applyDiscountCode(created.clientSecret, discountCode))
      if (!refused) return { url: created.url }
    }
    finally {
      if (!refused) await releaseDiscountCode(ctx, userId, windowStart)
    }
    throw backendError('invalid_input', { field: 'discountCode' }, '[nuxt-backend] Billing: the provider refused the discount code for this checkout.')
  }

  /**
   * The checked checkout's link: with a discount code, with a discount of
   * the catalog it names, with the one `checkoutDiscount` picks, or with
   * none. A `discountId` the provider refuses is the caller's to hear of.
   */
  const openCheckout = async (ctx: RunWriteCtx & { auth?: Auth }, entity: BillingEntity, checked: ServerCheckoutOptions, discountCode: string | undefined, named: KeyedDiscount | undefined): Promise<{ url: string }> => {
    if (discountCode) return checkoutWithCode(ctx, entity, checked, discountCode)
    if (named) return checkoutWithDiscount(ctx, entity, checked, named, false)
    const picked = await pickedDiscount(ctx, entity, checked)
    if (picked) return checkoutWithDiscount(ctx, entity, checked, picked, true)
    const created = await createCheckout(ctx, entity, checked, false)
    if (created) return { url: created.url }
    throw backendError('invalid_input', { field: 'discountId' }, '[nuxt-backend] Billing: the provider refused the discount for this checkout — it has ended, is used up, or is not for this product.')
  }

  /**
   * What a referral promised the person it brought, on their first paid
   * checkout (REF): the discount the program named, locked on, or its trial
   * days, kept on the referral as it was claimed. Only for the entity the
   * person pays for (their own, not a workspace someone else owns), and
   * only while the referral waits for their first payment; a discount that
   * applies to none of the checkout's products, and a trial on a checkout
   * that sells no plan, are left for another checkout.
   */
  const referralOffer = async (ctx: RunWriteCtx & { auth?: Auth }, entity: BillingEntity, options: ServerCheckoutOptions): Promise<{ discount?: KeyedDiscount, trial?: CheckoutTrial } | undefined> => {
    const userId = (await ctx.auth?.getUserIdentity())?.subject
    if (!userId) return undefined
    const profile = await profileOf(ctx, entity.userId)
    if (!(profile ? profile.owner?.userId === userId : entity.userId === userId)) return undefined
    const offerFor = components.backend.referrals?.offerFor
    const offer = offerFor ? await ctx.runQuery(offerFor, { userId }) : null
    if (!offer) return undefined
    if (offer.trialDays !== undefined) {
      return options.trial === undefined && await sellsPlan(ctx, options) ? { trial: { interval: 'day', count: offer.trialDays } } : undefined
    }
    const found = offer.discount === undefined ? undefined : discounts.discountOf(offer.discount)
    if (!found) {
      logBackend('warn', 'referrals.reward_unavailable', 'A referral promised a discount the catalog does not have, so the checkout opened at the regular price.')
      return undefined
    }
    return options.productIds.some(productId => found.productIds.includes(productId)) ? { discount: found } : undefined
  }

  /**
   * One checkout for the caller's billing entity, by one of its billing
   * managers and never an impersonating administrator, every input checked
   * before the provider is asked: catalog products, the site's own URLs,
   * no reserved metadata, a trial of at most 30 days, the entity's own
   * subscription, one discount at most (a catalog one for a product it
   * applies to). With none named, `checkoutDiscount` may pick one.
   * `billing.checkout` from server code, and the `generateCheckoutLink`
   * action without the server-only fields.
   */
  const checkout = async (ctx: RunWriteCtx & { auth?: Auth }, options: ServerCheckoutOptions): Promise<{ url: string }> => {
    const entity = await requireEntity(ctx, BILLING_ACCESS.checkout)
    const { userId } = entity
    // Who is asking first, then whether checkout is paused, before anything is checked or asked of the provider.
    await refusePaused(paused, ctx, 'checkout')
    requireProviderAccess('checkout')
    requireCatalogProducts(options.productIds, 'productIds')
    requireTrustedUrl(options.origin, 'origin')
    requireTrustedUrl(options.successUrl, 'successUrl')
    requireClientMetadata(options.metadata)
    if (options.customerIpAddress !== undefined && !isIpAddress(options.customerIpAddress)) {
      throw backendError('invalid_input', { field: 'customerIpAddress' }, '[nuxt-backend] Billing: `customerIpAddress` is no IP address.')
    }
    const currency = await requireCurrency(ctx, options.currency, options.productIds)
    const discountCode = discountCodeOf(options.discountCode)
    if ([options.discount, discountCode, options.discountId].filter(Boolean).length > 1) throw backendError('invalid_input', { field: 'discount' }, ONE_DISCOUNT)
    const named = options.discount === undefined ? undefined : discounts.requireDiscount(options.discount, options.productIds, { client: false })
    // Checked here, before anything reaches the provider.
    trialPayload(options.trial)
    await throttle(ctx, userId, 'checkouts')
    const { discount: _key, ...checked } = { ...options, currency }
    // With none named, the person's referral may have promised one.
    const referral = discountCode || named || options.discountId ? undefined : await referralOffer(ctx, entity, options)
    const opened = referral?.discount
      ? await checkoutWithDiscount(ctx, entity, checked, referral.discount, true)
      : await openCheckout(ctx, entity, referral?.trial ? { ...checked, trial: referral.trial } : checked, discountCode, named)
    // The billing manager who opened it acted; paying for it records the order.
    const productId = options.productIds[0]
    if (productId) await recordEvent(ctx, userId, { type: 'billing.checkout_started', data: { productId } })
    return opened
  }

  /**
   * Replaces the provider api()'s `generateCheckoutLink`: the same
   * arguments plus prefill, custom fields, billing-address control, a
   * discount code, a public promotion of the catalog by key and campaign
   * attribution, every one checked by {@link checkout}. Upstream appends
   * `locale` as a URL query parameter; the payload has a real `locale`
   * field, so it is passed properly here. The trial, a discount by id and a
   * promotion without a code are the server's: a client that sends them is
   * refused with the field named, so an older client fails clearly instead
   * of silently getting the product's defaults.
   */
  const generateCheckoutLink = actionGeneric({
    args: {
      productIds: v.array(v.string()),
      origin: v.string(),
      successUrl: v.string(),
      subscriptionId: v.optional(v.string()),
      metadata: v.optional(v.record(v.string(), v.string())),
      locale: v.optional(v.string()),
      currency: v.optional(v.string()),
      customerIpAddress: v.optional(v.string()),
      prefill: v.optional(v.object({
        name: v.optional(v.string()),
        email: v.optional(v.string()),
        billingName: v.optional(v.string()),
        billingAddress: v.optional(v.object({
          country: v.string(),
          line1: v.optional(v.string()),
          line2: v.optional(v.string()),
          postalCode: v.optional(v.string()),
          city: v.optional(v.string()),
          state: v.optional(v.string()),
        })),
        taxId: v.optional(v.string()),
        business: v.optional(v.boolean()),
      })),
      customFields: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
      requireBillingAddress: v.optional(v.boolean()),
      allowDiscountCodes: v.optional(v.boolean()),
      discountCode: v.optional(v.string()),
      discount: v.optional(v.string()),
      emailOptOut: v.optional(v.boolean()),
      utm: v.optional(v.object({
        source: v.optional(v.string()),
        medium: v.optional(v.string()),
        campaign: v.optional(v.string()),
        term: v.optional(v.string()),
        content: v.optional(v.string()),
      })),
      // Refused: the server's to choose (see SERVER_ONLY).
      trialInterval: v.optional(v.union(v.string(), v.null())),
      trialIntervalCount: v.optional(v.union(v.number(), v.null())),
      discountId: v.optional(v.string()),
    },
    returns: v.object({ url: v.string() }),
    handler: async (ctx, { trialInterval, trialIntervalCount, discountId, ...options }) => {
      // Who is asking comes first: a signed-out caller is `unauthenticated`,
      // and a member who manages no billing `forbidden`, whatever it sent.
      await requireEntity(ctx, BILLING_ACCESS.checkout)
      const sent = Object.entries({ trialInterval, trialIntervalCount, discountId }).find(([, value]) => value != null)
      if (sent) {
        const field = sent[0] as keyof typeof SERVER_ONLY
        throw backendError('invalid_input', { field }, `[nuxt-backend] generateCheckoutLink: \`${field}\` is refused from a client — ${SERVER_ONLY[field]}.`)
      }
      // A client names only a public promotion: one with a code, which anyone may type anyway.
      if (options.discount !== undefined) discounts.requireDiscount(options.discount, options.productIds, { client: true })
      return checkout(ctx, options)
    },
  })

  return { generateCheckoutLink, checkout }
}
