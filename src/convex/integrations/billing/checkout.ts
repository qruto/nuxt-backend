import { checkoutsCreate } from '@polar-sh/sdk/funcs/checkoutsCreate.js'
import { customersCreate } from '@polar-sh/sdk/funcs/customersCreate.js'
import { customersList } from '@polar-sh/sdk/funcs/customersList.js'
import { customersUpdate } from '@polar-sh/sdk/funcs/customersUpdate.js'
import { actionGeneric } from 'convex/server'
import { v } from 'convex/values'
import type { BillingContext } from './context.js'
import type { CheckoutCreateInput, ProviderCtx, RunWriteCtx } from './types/base.js'
import type { CheckoutOptions } from './types/options.js'
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

/** The checkout link: one provider customer per billing entity, then a checkout session. */
export function createCheckout({ billTo, provider, providerLib, requireEntity, requireProviderAccess, unwrapProvider, throttle, customerOwner }: BillingContext) {
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
   * Build the provider checkout payload from this package's options. Only
   * fields the installed `CheckoutCreate` actually has are set — `prefill`
   * maps onto the `customer*` fields, `customFields` onto `customFieldData`.
   */
  const buildCheckoutPayload = (options: CheckoutOptions, customerId: string): CheckoutCreateInput => {
    const prefill = options.prefill ?? {}
    return {
      products: options.productIds,
      customerId,
      embedOrigin: options.origin,
      successUrl: options.successUrl,
      subscriptionId: options.subscriptionId,
      metadata: options.metadata,
      trialInterval: options.trialInterval,
      trialIntervalCount: options.trialIntervalCount,
      locale: options.locale,
      allowDiscountCodes: options.allowDiscountCodes ?? true,
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
   * Replaces the provider api()'s `generateCheckoutLink` with a superset: the
   * same arguments plus prefill, custom fields, billing-address and discount
   * control. Upstream appends `locale` as a URL query parameter; the payload
   * has a real `locale` field, so it is passed properly here.
   */
  const generateCheckoutLink = actionGeneric({
    args: {
      productIds: v.array(v.string()),
      origin: v.string(),
      successUrl: v.string(),
      subscriptionId: v.optional(v.string()),
      metadata: v.optional(v.record(v.string(), v.string())),
      trialInterval: v.optional(v.union(v.string(), v.null())),
      trialIntervalCount: v.optional(v.union(v.number(), v.null())),
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
      discountId: v.optional(v.string()),
    },
    returns: v.object({ url: v.string() }),
    handler: async (ctx, args) => {
      const { userId, email } = await requireEntity(ctx)
      requireProviderAccess('checkout')
      await throttle(ctx, userId, 'checkouts')
      const customerId = await resolveCheckoutCustomer(ctx, userId, email)
      const payload = buildCheckoutPayload(
        { ...args, trialInterval: args.trialInterval as CheckoutOptions['trialInterval'] },
        customerId,
      )
      const checkout = await checkoutsCreate(provider.polar, payload)
      return { url: unwrapProvider(checkout, 'checkout').url }
    },
  })

  return { generateCheckoutLink }
}
