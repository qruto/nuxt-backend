import { BillingCheckoutLink, BillingPortalLink } from './billing-links'
import { renamedComponent } from '../utils/renamed-component'

/**
 * `<CheckoutLink>` in development only: renders `<BillingCheckoutLink>` and
 * warns once to rename it.
 *
 * @internal
 */
export const CheckoutLink = renamedComponent('CheckoutLink', 'BillingCheckoutLink', BillingCheckoutLink)

/**
 * `<CustomerPortalLink>` in development only: renders `<BillingPortalLink>`
 * and warns once to rename it.
 *
 * @internal
 */
export const CustomerPortalLink = renamedComponent('CustomerPortalLink', 'BillingPortalLink', BillingPortalLink)
