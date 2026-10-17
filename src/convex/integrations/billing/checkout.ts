import { checkoutsClientUpdate } from '@polar-sh/sdk/funcs/checkoutsClientUpdate.js'
import { checkoutsCreate } from '@polar-sh/sdk/funcs/checkoutsCreate.js'
import { customersCreate } from '@polar-sh/sdk/funcs/customersCreate.js'
import { customersList } from '@polar-sh/sdk/funcs/customersList.js'
import { customersUpdate } from '@polar-sh/sdk/funcs/customersUpdate.js'
import { actionGeneric, type Auth } from 'convex/server'
import { v } from 'convex/values'
import type { BillingContext } from './context.js'
import { campaignMetadata, discountCodeOf, type PurchaseRules, trialPayload } from './purchase.js'
import type { CheckoutCreateInput, ProviderCtx, RunWriteCtx } from './types/base.js'
import type { ServerCheckoutOptions } from './types/options.js'
import { backendError } from '../../errors.js'

/**
 * What a checkout says when the member's email already pays for another
 * billing entity — what happened, and what gets the entity its own customer.
 */
const CUSTOMER_TAKEN = {
  organization: 'Your email already pays for another workspace, and one email can pay for only one workspace for now. '
    + 'Check out from an account with a different email — another member of this workspace can — until each workspace gets a billing profile of its own.',
  user: 'Your email already pays for another account, and one email can pay for only one account for now. '
    + 'Check out with a different email until each account gets a billing profile of its own.',
} as const

/**
 * Refused discount codes a billing entity may try per window, whether or not
 * the app configured a rate limiter: a checkout would otherwise answer
 * "valid or not" for any code anyone types, one after another. A code in
 * flight counts too, so parallel checkouts can't try more between them.
 */
const DISCOUNT_CODE_REFUSALS = { max: 10, windowMs: 60 * 60 * 1000 } as const

const TRIAL_IS_THE_SERVERS = 'a trial is the product\'s own (the catalog\'s `trial`); a different one is the server\'s, through billing.checkout(ctx, { trial })'

/** What a client may not choose at checkout: the server's, through `billing.checkout`. */
const SERVER_ONLY = {
  trialInterval: TRIAL_IS_THE_SERVERS,
  trialIntervalCount: TRIAL_IS_THE_SERVERS,
  discountId: 'a discount by id is the server\'s, through billing.checkout(ctx, { discountId }); a client sends `discountCode`',
} as const

/** The checkout link: one provider customer per billing entity, then a checkout session. */
export function createCheckout(
  { billTo, provider, providerLib, cache, requireEntity, requireProviderAccess, unwrapProvider, throttle, customerOwner }: BillingContext,
  { requireTrustedUrl, requireCatalogProducts, requireClientMetadata }: PurchaseRules,
) {
  /**
   * Adopt the provider customer that already carries this email — unless it
   * pays for another billing entity. The provider keys customers by email,
   * and in workspace mode one member's email can stand behind several
   * workspaces: adopting a customer another one bills through would merge the
   * two (one set of benefits and credits, and the single-subscription read
   * throws once both subscribe). One customer per billing entity, keyed by
   * external id, is the planned fix; until then the checkout refuses.
   */
  const adoptCustomer = async (
    ctx: RunWriteCtx,
    customer: { id: string, metadata: Record<string, string | number | boolean> },
    userId: string,
  ): Promise<string> => {
    const owner = await customerOwner(ctx, customer)
    if (owner !== null && owner !== userId) {
      throw backendError('forbidden', { reason: 'customer_taken', message: CUSTOMER_TAKEN[billTo] }, CUSTOMER_TAKEN[billTo])
    }
    if (owner === null) {
      // Claim it the way a created customer is claimed: the tag is what the
      // next entity to meet this email is refused on, and what lets the first
      // webhook resolve this one before any sync has run.
      const tagged = await customersUpdate(provider.polar, {
        id: customer.id,
        customerUpdate: { metadata: { ...customer.metadata, userId } },
      })
      unwrapProvider(tagged, 'checkout')
    }
    return customer.id
  }

  /**
   * Find-or-create the provider customer for a billing entity and keep the
   * component's entity↔customer mapping in step. Matching on email first means
   * a customer who already paid (through a gift, say) keeps one billing
   * profile instead of sprouting a second.
   */
  const resolveCheckoutCustomer = async (ctx: RunWriteCtx, userId: string, email: string): Promise<string> => {
    const mapped = await provider.getCustomerByUserId(ctx as unknown as ProviderCtx, userId)
    if (mapped) return mapped.id
    const existing = unwrapProvider(await customersList(provider.polar, { email, limit: 1 }), 'checkout')
    const found = existing.result.items[0]
    let customerId: string
    if (found) {
      customerId = await adoptCustomer(ctx, found, userId)
    }
    else {
      // The `userId` metadata is what lets the very first webhook resolve its
      // entity before any sync has run.
      const created = await customersCreate(provider.polar, { email, metadata: { userId } })
      customerId = unwrapProvider(created, 'checkout').id
    }
    await ctx.runMutation(providerLib.insertCustomer, { id: customerId, userId })
    return customerId
  }

  /**
   * Build the provider checkout payload from checked options. Only fields
   * the installed `CheckoutCreate` actually has are set — `prefill` maps
   * onto the `customer*` fields, `customFields` onto `customFieldData`,
   * and the campaign onto `utm_*` metadata beside the app's own keys.
   */
  const buildCheckoutPayload = (options: ServerCheckoutOptions, customerId: string, hasCode: boolean): CheckoutCreateInput => {
    const prefill = options.prefill ?? {}
    const metadata = { ...options.metadata, ...campaignMetadata(options.utm) }
    return {
      products: options.productIds,
      customerId,
      embedOrigin: options.origin,
      successUrl: options.successUrl,
      subscriptionId: options.subscriptionId,
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      ...trialPayload(options.trial),
      locale: options.locale,
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
    }
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

  /** The provider checkout itself, for the entity's own subscription and customer. */
  const createCheckout = async (ctx: RunWriteCtx, userId: string, email: string, options: ServerCheckoutOptions, hasCode: boolean) => {
    if (options.subscriptionId) await requireOwnSubscription(ctx, userId, options.subscriptionId)
    const customerId = await resolveCheckoutCustomer(ctx, userId, email)
    return unwrapProvider(await checkoutsCreate(provider.polar, buildCheckoutPayload(options, customerId, hasCode)), 'checkout')
  }

  /**
   * A checkout with a discount code. The attempt is reserved before the
   * provider hears of the checkout; a code it refuses keeps it counted and
   * refuses the checkout as `invalid_input`. An accepted code gives the
   * attempt back, and so does a checkout that failed before the code was
   * tried, so an outage spends nothing.
   */
  const checkoutWithCode = async (ctx: RunWriteCtx, userId: string, email: string, options: ServerCheckoutOptions, discountCode: string): Promise<{ url: string }> => {
    const windowStart = await reserveDiscountCode(ctx, userId)
    let refused = false
    try {
      const created = await createCheckout(ctx, userId, email, options, true)
      refused = !(await applyDiscountCode(created.clientSecret, discountCode))
      if (!refused) return { url: created.url }
    }
    finally {
      if (!refused) await releaseDiscountCode(ctx, userId, windowStart)
    }
    throw backendError('invalid_input', { field: 'discountCode' }, '[nuxt-backend] Billing: the provider refused the discount code for this checkout.')
  }

  /**
   * One checkout for the caller's billing entity, every input checked
   * before the provider is asked: catalog products, the site's own URLs,
   * no reserved metadata, a trial of at most 30 days, the entity's own
   * subscription. `billing.checkout` from server code, and the
   * `generateCheckoutLink` action without the server-only fields.
   */
  const checkout = async (ctx: RunWriteCtx & { auth?: Auth }, options: ServerCheckoutOptions): Promise<{ url: string }> => {
    const { userId, email } = await requireEntity(ctx)
    requireProviderAccess('checkout')
    requireCatalogProducts(options.productIds, 'productIds')
    requireTrustedUrl(options.origin, 'origin')
    requireTrustedUrl(options.successUrl, 'successUrl')
    requireClientMetadata(options.metadata)
    const discountCode = discountCodeOf(options.discountCode)
    // Checked here, before anything reaches the provider.
    trialPayload(options.trial)
    await throttle(ctx, userId, 'checkouts')
    if (discountCode) return checkoutWithCode(ctx, userId, email, options, discountCode)
    const created = await createCheckout(ctx, userId, email, options, false)
    return { url: created.url }
  }

  /**
   * Replaces the provider api()'s `generateCheckoutLink`: the same
   * arguments plus prefill, custom fields, billing-address control, a
   * discount code and campaign attribution, every one checked by
   * {@link checkout}. Upstream appends `locale` as a URL query parameter;
   * the payload has a real `locale` field, so it is passed properly here.
   * The trial and a discount by id are the server's: a client that sends
   * them is refused with the field named, so an older client fails clearly
   * instead of silently getting the product's defaults.
   */
  const generateCheckoutLink = actionGeneric({
    args: {
      productIds: v.array(v.string()),
      origin: v.string(),
      successUrl: v.string(),
      subscriptionId: v.optional(v.string()),
      metadata: v.optional(v.record(v.string(), v.string())),
      locale: v.optional(v.string()),
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
      // Who is asking comes first: a signed-out caller is `unauthenticated`
      // whatever it sent.
      await requireEntity(ctx)
      const sent = Object.entries({ trialInterval, trialIntervalCount, discountId }).find(([, value]) => value != null)
      if (sent) {
        const field = sent[0] as keyof typeof SERVER_ONLY
        throw backendError('invalid_input', { field }, `[nuxt-backend] generateCheckoutLink: \`${field}\` is refused from a client — ${SERVER_ONLY[field]}.`)
      }
      return checkout(ctx, options)
    },
  })

  return { generateCheckoutLink, checkout }
}
