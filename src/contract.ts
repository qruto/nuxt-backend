/**
 * The deployed-function contract between the packaged composables and the
 * scaffolded `backend/` files, keyed by function module (file basename).
 *
 * Composables bind to these namespaces by name (`useBackendNamespace`), so a
 * renamed file or a trimmed export degrades reads to silent undefineds.
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
  auth: ['getAuthUser', 'authConfig', 'listWorkspaces', 'listWorkspaceMembers', 'updateProfile'],
  billing: [
    'generateCheckoutLink',
    'generateCustomerPortalUrl',
    'getConfiguredProducts',
    'listAllProducts',
    'listAllSubscriptions',
    'changeCurrentSubscription',
    'cancelCurrentSubscription',
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
 * Contract names that exist only while the organization plugin is on —
 * `setupAuth(components, query, { organization: false })` drops them, so
 * doctor skips them when the deployment reports workspaces disabled.
 *
 * @internal
 */
export const WORKSPACE_FUNCTION_EXPORTS: readonly string[] = ['listWorkspaces', 'listWorkspaceMembers']

/**
 * The contract names a deployment lacks, given its function identifiers
 * (`module:name`) and whether workspaces are on.
 *
 * @internal
 */
export function missingContractFunctions(identifiers: ReadonlySet<string>, { workspaces }: { workspaces: boolean }): string[] {
  const missing: string[] = []
  for (const [module, names] of Object.entries(REQUIRED_FUNCTION_EXPORTS)) {
    for (const name of names) {
      if (!workspaces && WORKSPACE_FUNCTION_EXPORTS.includes(name)) continue
      if (!identifiers.has(`${module}:${name}`)) missing.push(`${module}:${name}`)
    }
  }
  return missing
}
