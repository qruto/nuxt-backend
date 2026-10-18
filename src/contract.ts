/**
 * The deployed-function contract between the packaged composables and the
 * scaffolded `backend/` files, keyed by function module (file basename).
 *
 * Composables and the packaged components (`<BillingCheckoutLink>` and
 * `<BillingPortalLink>` among them) bind to these namespaces by name
 * (`useBackendNamespace`), so a renamed file or a trimmed export degrades
 * reads to silent undefineds.
 * `nuxt-backend doctor` verifies every name here against the deployment's
 * function specs, and a unit test pins the map to the scaffold templates so
 * contract and scaffold can never drift apart.
 *
 * The public form of this contract is STABILITY.md's scaffold promise; the
 * map itself is doctor plumbing, not an import surface.
 *
 * @internal
 */
export const REQUIRED_FUNCTION_EXPORTS = {
  auth: ['getAuthUser', 'authConfig', 'listWorkspaces', 'listWorkspaceMembers', 'updateProfile', 'listSessions', 'revokeSession'],
  billing: [
    'generateCheckoutLink',
    'generateCustomerPortalUrl',
    'getConfiguredProducts',
    'listAllSubscriptions',
    'giftCheckout',
    'getCurrentSubscription',
    'getFeatures',
    'getCredits',
    'syncEntitlements',
    'syncProducts',
    'getReceivedGifts',
    'claimGift',
    'getWebhookDeliveries',
    'updateSubscription',
    'cancelSubscription',
    'uncancelSubscription',
    'pauseSubscription',
    'resumeSubscription',
    'getOrders',
    'getInvoiceUrl',
    'getUsageHistory',
    'refundOrder',
  ],
  email: ['getEmailStatus'],
} as const satisfies Record<string, readonly string[]>

/**
 * The contract names a deployment lacks, given its function identifiers
 * (`module:name`).
 *
 * @internal
 */
export function missingContractFunctions(identifiers: ReadonlySet<string>): string[] {
  const missing: string[] = []
  for (const [module, names] of Object.entries(REQUIRED_FUNCTION_EXPORTS)) {
    for (const name of names) {
      if (!identifiers.has(`${module}:${name}`)) missing.push(`${module}:${name}`)
    }
  }
  return missing
}
