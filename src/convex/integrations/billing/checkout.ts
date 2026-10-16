import { checkoutsCreate } from '@polar-sh/sdk/funcs/checkoutsCreate.js'
import { customersCreate } from '@polar-sh/sdk/funcs/customersCreate.js'
import { customersList } from '@polar-sh/sdk/funcs/customersList.js'
import { actionGeneric } from 'convex/server'
import { v } from 'convex/values'
import type { BillingContext } from './context.js'
import type { CheckoutCreateInput, PolarRunQueryCtx, RunWriteCtx } from './types/base.js'
import type { CheckoutOptions } from './types/options.js'

/** The checkout link: one provider customer per billing entity, then a checkout session. */
export function createCheckout({ provider, providerLib, getUserInfo, requireProviderAccess, unwrapProvider, throttle }: BillingContext) {
  /**
   * Find-or-create the provider customer for a billing entity and keep the
   * component's entity↔customer mapping in step. Matching on email first means
   * a customer who already paid (through a gift, say) keeps one billing
   * profile instead of sprouting a second.
   */
  const resolveCheckoutCustomer = async (ctx: RunWriteCtx, userId: string, email: string): Promise<string> => {
    const mapped = await provider.getCustomerByUserId(ctx as unknown as PolarRunQueryCtx, userId)
    if (mapped) return mapped.id
    const existing = await customersList(provider.polar, { email, limit: 1 })
    if (!existing.ok) throw existing.error
    let customerId = existing.value.result.items[0]?.id
    if (!customerId) {
      // The `userId` metadata is what lets the very first webhook resolve its
      // entity before any sync has run.
      const created = await customersCreate(provider.polar, { email, metadata: { userId } })
      if (!created.ok) throw created.error
      customerId = created.value.id
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
      requireProviderAccess('checkout')
      const { userId, email } = await getUserInfo(ctx as unknown as PolarRunQueryCtx)
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
