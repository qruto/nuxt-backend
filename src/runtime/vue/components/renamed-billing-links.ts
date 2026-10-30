import { defineAsyncComponent } from 'vue'
import { renamedComponent } from '../utils/renamed-component'

/**
 * `<CheckoutLink>` in development only: renders `<BillingCheckoutLink>` and
 * warns once to rename it.
 *
 * @internal
 */
export const CheckoutLink = renamedComponent('CheckoutLink', 'BillingCheckoutLink', defineAsyncComponent(() => import('./billing/BillingCheckoutLink.vue')))

/**
 * `<CustomerPortalLink>` in development only: renders `<BillingPortalLink>`
 * and warns once to rename it.
 *
 * @internal
 */
export const CustomerPortalLink = renamedComponent('CustomerPortalLink', 'BillingPortalLink', defineAsyncComponent(() => import('./billing/BillingPortalLink.vue')))
