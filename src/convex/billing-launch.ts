// Whether billing sells on a deployment yet: the one rule the runtime (the
// pricing, checkout and gift refusals), the composables and `doctor` read.
// Pure: no Convex code, so the CLI imports it as it is.

/**
 * Why billing sells nothing yet on a production deployment: no provider
 * token (`no_access_token`), or a catalog `billing sync` has not pushed to
 * the provider's production (`no_catalog`).
 */
export type BillingLaunchReason = 'no_access_token' | 'no_catalog'

/**
 * Whether billing sells on a deployment. Billing is not launched while a
 * production deployment has no provider token or no production catalog:
 * the provider's account review can come after an app opens to its first
 * people, and until then its pricing reads "Plans open soon" and every
 * checkout is refused (`unavailable`, reason `not_launched`). On every
 * other deployment billing runs on the provider's sandbox, and is launched.
 */
export type BillingLaunch = { launched: true } | { launched: false, reason: BillingLaunchReason }

/** What {@link billingLaunch} decides from: the billing environment, the token, and the catalog's product ids. */
export interface BillingLaunchInput {
  /** The provider environment the deployment bills in (`BACKEND_ENVIRONMENT=production` bills in `production`). */
  environment: 'sandbox' | 'production'
  /** `BILLING_ACCESS_TOKEN`, or whether the deployment holds one. */
  accessToken: string | boolean | undefined
  /** The product ids in force for that environment: `billing.generated.ts`'s, or `setupBilling({ products })`. */
  products: Readonly<Record<string, string>> | undefined
}

/**
 * Whether billing sells on a deployment ({@link BillingLaunch}): on the
 * provider's production, once the deployment holds a token and the catalog
 * has products there, checked in that order; on its sandbox, always.
 */
export function billingLaunch({ environment, accessToken, products }: BillingLaunchInput): BillingLaunch {
  if (environment !== 'production') return { launched: true }
  if (!accessToken) return { launched: false, reason: 'no_access_token' }
  if (Object.keys(products ?? {}).length === 0) return { launched: false, reason: 'no_catalog' }
  return { launched: true }
}
