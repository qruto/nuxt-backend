/**
 * The area tags: which area of the docs each thing the package ships belongs
 * to (registry.mjs AREAS: Start, a Build group, Develop's agents or Ship). A
 * landing's "What you get" (`::what-you-get{area}`) lists what carries
 * its tag, and the composables lookup groups by it. Findings take theirs from
 * their service and env names from their prefix; everything else is named
 * here, and a lookup throws on a name with no tag, so a new composable,
 * component, page, route or helper lands with one.
 */

import { AREAS } from './registry.mjs'

/** Composables and auto-imported helpers, by name. */
export const COMPOSABLE_AREAS = {
  useAuth: 'auth',
  useConnectionState: 'data',
  useBackendClient: 'data',
  useLoginFlow: 'auth',
  useReturnPath: 'auth',
  useEmailChange: 'auth',
  useWorkspace: 'auth',
  useSearch: 'data',
  useShareLink: 'data',
  useUploadField: 'data',
  useNotifications: 'email',
  useNotificationInbox: 'email',
  useEmailPreferences: 'email',
  usePushSubscription: 'email',
  useAnnouncements: 'email',
  useAnnouncementsAdmin: 'email',
  useBilling: 'billing',
  useFeatures: 'billing',
  useCredits: 'billing',
  usePricing: 'billing',
  useCampaign: 'billing',
  useOrders: 'billing',
  useUsage: 'billing',
  useGifts: 'billing',
  useReferrals: 'billing',
  useReferralAdmin: 'auth',
  usePasskeys: 'auth',
  useSessions: 'auth',
  useReauthentication: 'auth',
  useAuditLog: 'auth',
  useAccount: 'auth',
  useAccessPhase: 'auth',
  useInvite: 'auth',
  useAccessAdmin: 'auth',
  useWaitlist: 'auth',
  useConsents: 'auth',
  useWaitlistAdmin: 'auth',
  useAdmin: 'auth',
  useFlag: 'ship',
  useExperiment: 'ship',
  useFlagAdmin: 'ship',
  getBackendError: 'data',
  useBackendConfig: 'ui',
  useLabels: 'ui',
  useBackendPagePath: 'ui',
  useEmailStatus: 'email',
  useContactForm: 'email',
  useInboxAdmin: 'email',
  useOnboarding: 'auth',
  useActivation: 'auth',
  useAppShell: 'ui',
  useSandboxInbox: 'email',
  useWorkflowStatus: 'data',
  useAiStream: 'ai',
  useJob: 'ai',
  useAiLabel: 'ai',
  useChat: 'ai',
  useHumanCheck: 'auth',
}

/** The package's components, by name. */
export const COMPONENT_AREAS = {
  AuthForm: 'auth',
  Gate: 'ui',
  BackendNotices: 'ui',
  AcceptInvitation: 'auth',
  WaitlistForm: 'auth',
  ConsentPrompt: 'auth',
  PricingTable: 'billing',
  BillingCheckoutLink: 'billing',
  BillingPortalLink: 'billing',
  BillingHistory: 'billing',
  UsageHistory: 'billing',
  UpgradePrompt: 'billing',
  CancelFlow: 'billing',
  WithdrawalButton: 'billing',
  ReferralCard: 'billing',
  WorkspaceSettings: 'auth',
  ProfileSettings: 'auth',
  SecuritySettings: 'auth',
  ReauthenticateDialog: 'auth',
  AuditLog: 'auth',
  AccountData: 'auth',
  AdminUsers: 'auth',
  AdminWorkspaces: 'auth',
  AccessDenied: 'auth',
  ConnectionStatus: 'data',
  UploadField: 'data',
  NotificationInbox: 'email',
  ContactForm: 'email',
  AppShell: 'ui',
  OnboardingFlow: 'auth',
  ActivationChecklist: 'auth',
  HowDidYouHear: 'auth',
  AiLabel: 'ai',
}

/** The ready-made pages, by their `backend.pages` key. */
export const PAGE_AREAS = {
  acceptInvitation: 'auth',
  invite: 'auth',
  waitlist: 'auth',
  admin: 'auth',
  keepAccount: 'auth',
  unsubscribe: 'email',
  gifts: 'billing',
  referral: 'billing',
  login: 'auth',
  pricing: 'billing',
  profile: 'auth',
  report: 'ai',
  security: 'auth',
  settings: 'auth',
  welcome: 'auth',
  privacy: 'ship',
  terms: 'ship',
  subprocessors: 'ship',
  accessibility: 'ship',
}

/** The Convex-side setup helpers (Reference › Backend › Setup helpers), by name. */
export const HELPER_AREAS = {
  setupAuth: 'auth',
  defineBackendAuthConfig: 'auth',
  createFunctions: 'auth',
  setupAudit: 'auth',
  defineActivation: 'auth',
  setupAccount: 'auth',
  setupAccess: 'auth',
  setupWaitlist: 'auth',
  setupAdmin: 'auth',
  setupWebhooks: 'ship',
  setupFlags: 'ship',
  defineFlags: 'ship',
  registerBackendRoutes: 'start',
  setupBilling: 'billing',
  defineBillingCatalog: 'billing',
  setupReferrals: 'billing',
  setupEmail: 'email',
  setupAi: 'ai',
  defineJobQueue: 'ai',
  setupRateLimiter: 'ship',
  setupWorkflows: 'data',
  defineEmailSequence: 'email',
  defineSearch: 'data',
  setupStorage: 'data',
  setupNotifications: 'email',
  defineRetention: 'data',
}

/** The Nitro auto-imports the module adds, by name. */
export const SERVER_AREAS = {
  backendAuth: 'auth',
}

/** The routes the package mounts, by the area each belongs to; test/docs/docs-lookups.test.ts holds them to the routes tables. */
export const ROUTE_AREAS = {
  '/api/auth': 'auth',
  '/api/human-proof': 'auth',
  '/billing/events': 'billing',
  '/email/events': 'email',
  '/ai/stream': 'ai',
}

/** The area of a finding's group (src/findings/). */
export const FINDING_GROUP_AREAS = {
  deployment: 'ship',
  auth: 'auth',
  workspaces: 'auth',
  email: 'email',
  billing: 'billing',
  ai: 'ai',
  scaffold: 'start',
  protection: 'auth',
}

/** The area of an env name, by its prefix. */
export function envArea(name) {
  if (/^(?:AUTH_|SITE_URL$|PROTECTION_|NUXT_PUBLIC_BACKEND_CHALLENGE_)/.test(name)) return 'auth'
  if (name.startsWith('EMAIL_')) return 'email'
  if (name.startsWith('BILLING_')) return 'billing'
  return 'start'
}

/** A name's tag from one of the maps above; throws when it has none, or names no area. */
export function tagOf(map, name, what) {
  const area = map[name]
  if (!area) throw new Error(`${what} ${name} has no area tag: add it to scripts/docs-lookups/areas.mjs`)
  if (!Object.hasOwn(AREAS, area)) throw new Error(`${what} ${name} is tagged ${area}, which is no area (registry.mjs AREAS)`)
  return area
}

/** The keys of a tag map that name nothing the code has: each one a dead tag to drop. */
export const deadTags = (map, names) => Object.keys(map).filter(name => !names.includes(name))
