/**
 * The deployed-function contract between the packaged composables and the
 * scaffolded `backend/` files, keyed by function module (file basename).
 *
 * Composables bind to these namespaces by name (`useBackendNamespace`), so a
 * renamed file or a trimmed export degrades reads to silent undefineds.
 * `nuxt-backend doctor` verifies every name here against the deployment's
 * function specs, and a unit test pins the map to the scaffold templates so
 * contract and scaffold can never drift apart.
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
    'getReceivedGifts',
    'claimGift',
    'getWebhookDeliveries',
  ],
  email: ['getEmailStatus'],
} as const satisfies Record<string, readonly string[]>
