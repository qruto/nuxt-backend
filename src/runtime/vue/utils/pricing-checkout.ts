import type { PricedPromotion } from '../../../convex/integrations/billing/types/records.js'
import type { CheckoutOptions } from '../composables/use-billing'
import type { UseCampaignReturn } from '../composables/use-campaign'
import { getBackendError } from './backend-error'

// A checkout from a pricing view carries the address's campaign the same
// way wherever it starts — `<PricingTable>`'s plan and pack buttons and
// `usePricing().checkout`: the view's promotion on a price it is offered on,
// else the campaign link's own code, one discount per checkout, and a
// discount the server refuses never blocks the purchase.

/** What a pricing view's checkout reads. */
export interface PricingCheckoutContext {
  /** The address's campaign: its discount code and UTM attribution. */
  campaign: Pick<UseCampaignReturn, 'checkoutOptions'>
  /** The promotion the view asked the pricing for (`usePricing({ discount })`): a key, a code, or the campaign link's own code. */
  asked: () => string | undefined
  /** The promotion that runs now (`usePricing().activePromotion`). */
  active: () => PricedPromotion | undefined
  /** Every currency the catalog prices (`usePricing().currencies`). */
  currencies: () => string[]
}

/** The campaign's part of one checkout: a discount, and the attribution. */
export type CampaignCheckoutOptions = Pick<CheckoutOptions, 'discount' | 'discountCode' | 'utm'>

/** A pricing view's checkout, as far as the campaign and the currency go. */
export interface PricingCheckout {
  /**
   * The currency a checkout of a price shown in `currency` pays in: a
   * product the catalog prices in one currency only shows, and is paid, in
   * that one whatever the page's. Named only where the catalog prices more
   * than one; a single-currency checkout keeps the provider's own.
   */
  payIn: (currency: string | undefined) => { currency?: string }
  /**
   * Start a checkout with the campaign: the view's promotion, on a price it
   * is `offered` on, in the place of the campaign link's code (one discount
   * per checkout), else that code. A view that shows a promotion for the
   * campaign link's own code sends the code. When the server refuses the
   * discount (an expired, used-up or unknown code, a promotion no longer
   * redeemed), the checkout starts again without it, the attribution kept.
   */
  withCampaign: <T>(offered: boolean, start: (options: CampaignCheckoutOptions) => Promise<T>) => Promise<T>
}

/** A refusal of a checkout's discount: an expired, used-up or unknown campaign code, or a promotion no longer redeemed. */
function refusedCode(failure: unknown): boolean {
  const refusal = getBackendError(failure)
  const field = (refusal?.data as { field?: unknown } | undefined)?.field
  return refusal?.code === 'invalid_input' && (field === 'discountCode' || field === 'discount')
}

/** The campaign and currency rules of one pricing view's checkouts. */
export function pricingCheckout(context: PricingCheckoutContext): PricingCheckout {
  return {
    payIn: currency => (currency && context.currencies().length > 1 ? { currency } : {}),
    withCampaign: async (offered, start) => {
      const { discountCode, ...attribution } = context.campaign.checkoutOptions.value
      // The view's promotion, unless what it shows is the campaign link's own code: that goes as the code.
      const promotion = context.asked() === discountCode ? undefined : context.active()?.key
      const options: CampaignCheckoutOptions = promotion && offered
        ? { ...attribution, discount: promotion }
        : { ...attribution, ...(discountCode ? { discountCode } : {}) }
      try {
        return await start(options)
      }
      catch (failure) {
        if (!('discountCode' in options || 'discount' in options) || !refusedCode(failure)) throw failure
        return start(attribution)
      }
    },
  }
}
