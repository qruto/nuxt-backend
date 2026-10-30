/**
 * Names a coding agent writes by habit or by analogy with other stacks, none
 * of which exists in a nuxt-backend app, each with the name that does. The
 * skill's wrong-name list is generated from this and from the rename map's
 * plain renames (the names 0.1 used), so an agent can check a name before it
 * writes one.
 *
 * test/docs/agent-guidance.test.ts holds both columns to the public-surface
 * manifest: every wrong name must be missing from it, and every right name
 * present.
 */

/** What kind of name an entry is, which says where the test looks it up. */
export type WrongNameKind = 'composable' | 'component' | 'env' | 'command' | 'import' | 'function'

/** One wrong guess and the real name. */
export interface WrongName {
  /** The guess, as an agent would write it. */
  wrong: string
  /** What to write instead, as code. */
  right: string
  kind: WrongNameKind
  /** When the right name needs a word of context. */
  note?: string
}

/** The guesses, grouped by kind. */
export const WRONG_NAMES: readonly WrongName[] = [
  { wrong: 'useUser()', right: 'useAuth().user', kind: 'composable' },
  { wrong: 'useSession()', right: 'useAuth()', kind: 'composable', note: '`useSessions()` lists devices' },
  { wrong: 'useSignIn()', right: 'useLoginFlow()', kind: 'composable' },
  { wrong: 'useLogout()', right: 'useAuth().signOut', kind: 'composable' },
  { wrong: 'useOrganization()', right: 'useWorkspace()', kind: 'composable' },
  { wrong: 'useWorkspaces()', right: 'useWorkspace().workspaces', kind: 'composable' },
  { wrong: 'useMembers()', right: 'useWorkspace().members', kind: 'composable' },
  { wrong: 'useInvitations()', right: 'useWorkspace().invitations', kind: 'composable' },
  { wrong: 'useSubscription()', right: 'useBilling().subscription', kind: 'composable' },
  { wrong: 'useCheckout()', right: 'useBilling().checkout', kind: 'composable' },
  { wrong: 'usePlans()', right: 'useBilling().products', kind: 'composable' },
  { wrong: 'useCreditBalance()', right: 'useCredits().balance', kind: 'composable' },
  { wrong: 'useEntitlements()', right: 'useFeatures()', kind: 'composable' },
  { wrong: 'useBackendError()', right: 'getBackendError(error)', kind: 'composable' },

  { wrong: '<SignIn>', right: '<AuthForm>', kind: 'component' },
  { wrong: '<LoginForm>', right: '<AuthForm>', kind: 'component' },
  { wrong: '<PricingPlans>', right: '<PricingTable>', kind: 'component' },
  { wrong: '<CheckoutButton>', right: '<BillingCheckoutLink>', kind: 'component' },
  { wrong: '<CustomerPortalButton>', right: '<BillingPortalLink>', kind: 'component' },
  { wrong: '<AuthGuard>', right: '<Gate>', kind: 'component', note: 'a page: `definePageMeta({ auth: true })`' },
  { wrong: '<Paywall>', right: '<Gate>', kind: 'component', note: 'with `feature`' },
  { wrong: '<UserProfile>', right: '<ProfileSettings>', kind: 'component' },

  { wrong: 'BETTER_AUTH_SECRET', right: 'AUTH_SECRET', kind: 'env' },
  { wrong: 'BETTER_AUTH_URL', right: 'SITE_URL', kind: 'env' },
  { wrong: 'RESEND_API_KEY', right: 'EMAIL_API_KEY', kind: 'env' },
  { wrong: 'RESEND_WEBHOOK_SECRET', right: 'EMAIL_WEBHOOK_SECRET', kind: 'env' },
  { wrong: 'POLAR_ACCESS_TOKEN', right: 'BILLING_ACCESS_TOKEN', kind: 'env' },
  { wrong: 'POLAR_WEBHOOK_SECRET', right: 'BILLING_WEBHOOK_SECRET', kind: 'env' },
  { wrong: 'POLAR_SERVER', right: 'BACKEND_ENVIRONMENT', kind: 'env', note: 'sandbox everywhere but production' },

  { wrong: 'npx nuxt-backend setup', right: 'npx nuxt-backend init', kind: 'command' },
  { wrong: 'npx nuxt-backend check', right: 'npx nuxt-backend doctor', kind: 'command' },
  { wrong: 'npx nuxt-backend sync', right: 'npx nuxt-backend billing sync', kind: 'command' },

  { wrong: 'nuxt-backend/server', right: '#backend/server', kind: 'import' },
  { wrong: 'nuxt-backend/better-auth', right: 'nuxt-backend/auth', kind: 'import' },
  { wrong: 'nuxt-backend/polar', right: 'nuxt-backend/billing', kind: 'import' },
  { wrong: 'nuxt-backend/resend', right: 'nuxt-backend/email', kind: 'import' },
  { wrong: 'nuxt-backend/convex', right: 'nuxt-backend/convex.config', kind: 'import' },

  { wrong: 'api.auth.getCurrentUser', right: 'api.auth.getAuthUser', kind: 'function' },
  { wrong: 'api.billing.getSubscription', right: 'api.billing.getCurrentSubscription', kind: 'function' },
  { wrong: 'api.billing.getBalance', right: 'api.billing.getCredits', kind: 'function' },
]
