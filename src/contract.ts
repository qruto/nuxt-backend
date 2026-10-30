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
  auth: ['getAuthUser', 'authConfig', 'updateProfile', 'listSessions', 'revokeSession', 'listSignInAlerts'],
  billing: [
    'generateCheckoutLink',
    'generateCustomerPortalUrl',
    'getConfiguredProducts',
    'getPricing',
    'listAllSubscriptions',
    'giftCheckout',
    'getCurrentSubscription',
    'getFeatures',
    'getBillingAccess',
    'getCredits',
    'syncEntitlements',
    'syncProducts',
    'startFreePlan',
    'getReceivedGifts',
    'claimGift',
    'getSentGifts',
    'resendGift',
    'changeGiftRecipient',
    'rescheduleGift',
    'cancelGift',
    'runGiftSweep',
    'updateSubscription',
    'cancelSubscription',
    'acceptSaveOffer',
    'getWithdrawal',
    'withdraw',
    'uncancelSubscription',
    'cancelPendingChange',
    'pauseSubscription',
    'resumeSubscription',
    'getOrders',
    'getInvoiceUrl',
    'getUsageHistory',
    'refundOrder',
  ],
  email: ['getEmailStatus', 'previewEmails', 'sendEmailPreview', 'getEmailPreferences', 'setEmailTopic', 'unsubscribeAllTopics', 'getEmailLink', 'unsubscribeByLink', 'confirmEmailTopic', 'recordTimeZone', 'syncEmail', 'getAnnouncements', 'dismissAnnouncement', 'getAnnouncementsConsole', 'publishAnnouncement', 'endAnnouncement', 'previewAnnouncement', 'sendAnnouncement', 'cancelAnnouncement', 'getSuppressions', 'liftSuppression'],
  audit: ['listActivity', 'listWorkspaceActivity', 'listAllActivity', 'getActivation', 'dismissActivation'],
  notifications: ['listNotifications', 'getUnreadCount', 'markNotificationsRead', 'getNotificationChannels', 'setNotificationChannel', 'getPushConfig', 'subscribePush', 'unsubscribePush', 'deliverNotification'],
  account: ['exportAccountData', 'getAccountExport', 'eraseAccountData', 'getConsents', 'getConsentTerms', 'grantConsent', 'withdrawConsent', 'chooseStorage', 'getAccountDeletion', 'cancelAccountDeletion', 'getOnboarding', 'completeOnboarding'],

  admin: ['listUsers', 'getUser', 'listWorkspaces', 'getWorkspace'],
  flags: ['getFlags', 'listFlags', 'setFlag', 'exposeExperiment'],
  webhooks: ['getWebhookDeliveries', 'replayWebhookDelivery'],
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
