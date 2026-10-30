/**
 * The agent skills the package ships under `skills/`: one small core skill
 * that every app's agent reads first, and the task skills it routes to.
 * Each is a folder with its own `SKILL.md` (name and description
 * frontmatter) and `references/`, so the skills CLI lists and installs every
 * one of them, and `nuxt-backend init` copies them into an app's
 * `.agents/skills/`.
 *
 * scripts/agent-guidance.mjs reads this registry to write each skill's
 * generated parts (`pnpm generate`): the core's router to the task skills,
 * and in each task skill its tasks (the how-to pages under its `docs`
 * prefixes) and `references/api.md` (the names it owns). Every public name,
 * how-to page, command and doctor finding belongs to exactly one skill;
 * test/docs/agent-guidance.test.ts fails while a new one has no owner.
 */

/** One shipped skill, and what of the public surface it covers. */
export interface AgentSkill {
  /** The folder under `skills/` and the `name` in its frontmatter. */
  name: string
  /** What the core's router says it is for, as a phrase. */
  covers: string
  /**
   * The docs routes whose how-to pages are its tasks. A page belongs to the
   * skill with the longest prefix that matches it.
   */
  docs: readonly string[]
  /** The import paths it lists. */
  entrypoints?: readonly string[]
  /** The auto-imported composables and utilities it lists. */
  composables?: readonly string[]
  /** The components it lists. */
  components?: readonly string[]
  /** The Nitro auto-imports it lists. */
  server?: readonly string[]
  /** The `npx nuxt-backend` commands it lists, by path (`env push`). */
  commands?: readonly string[]
  /**
   * The doctor findings it lists: by group, a file of src/findings/
   * (`billing`), or by id (`agent-files`) for one whose group another skill
   * lists. A finding belongs to the skill that names its id, else to the one
   * that names its group.
   */
  findings?: readonly string[]
  /** The scaffolded function files whose contract it lists (`billing` for `backend/billing.ts`). */
  functions?: readonly string[]
}

/** The core skill: the rules every task follows, install and version checks, and the router. */
export const CORE_SKILL = {
  name: 'nuxt-backend',
  covers: 'the ground rules, install, the CLI and env, and where each task lives',
  docs: ['/docs/start', '/docs/develop'],
  entrypoints: ['nuxt-backend', 'nuxt-backend/app', 'nuxt-backend/convex.config', 'nuxt-backend/_generated/component'],
  commands: ['init', 'dev'],
  // The `scaffold` group holds `agent-files`, which checks the coding-agent files this skill explains.
  findings: ['deployment', 'scaffold'],
} as const satisfies AgentSkill

/** The task skills, in the order the core routes to them. */
export const TASK_SKILLS = [
  {
    name: 'nuxt-backend-auth',
    covers: 'sign-in, sessions, passkeys, roles, user-scoped functions, workspaces and invitations, invite codes and the waitlist, the admin console with impersonation, the activity trail, consents, and account export and deletion',
    docs: ['/docs/build/auth', '/docs/build/growth/launch'],
    entrypoints: ['nuxt-backend/auth', 'nuxt-backend/auth.config', 'nuxt-backend/access', 'nuxt-backend/audit', 'nuxt-backend/account', 'nuxt-backend/admin'],
    composables: ['useAuth', 'useLoginFlow', 'useReturnPath', 'useEmailChange', 'useWorkspace', 'usePasskeys', 'useSessions', 'useHumanCheck', 'useReauthentication', 'useAccessPhase', 'useInvite', 'useAccessAdmin', 'useWaitlist', 'useWaitlistAdmin', 'useAuditLog', 'useAccount', 'useConsents', 'useAdmin'],
    components: ['AuthForm', 'WaitlistForm', 'ConsentPrompt', 'AccessDenied', 'AcceptInvitation', 'WorkspaceSettings', 'ProfileSettings', 'SecuritySettings', 'ReauthenticateDialog', 'AuditLog', 'AccountData', 'AdminUsers', 'AdminWorkspaces'],
    server: ['backendAuth'],
    findings: ['auth', 'protection'],
    functions: ['auth', 'audit', 'account', 'admin'],
  },
  {
    name: 'nuxt-backend-billing',
    covers: 'the catalog, plans, checkout, the portal, feature gates, plan quotas and credits',
    docs: ['/docs/build/billing'],
    entrypoints: ['nuxt-backend/billing'],
    composables: ['useBilling', 'useFeatures', 'useCredits', 'usePricing', 'useOrders', 'useUsage'],
    components: ['PricingTable', 'BillingCheckoutLink', 'BillingPortalLink', 'BillingHistory', 'UsageHistory', 'UpgradePrompt', 'CancelFlow', 'WithdrawalButton'],
    commands: ['billing sync'],
    findings: ['billing'],
    functions: ['billing'],
  },
  {
    name: 'nuxt-backend-growth',
    covers: 'launch phases, offers, referrals, gifts, lifecycle email and the funnel',
    docs: ['/docs/build/growth'],
    composables: ['useCampaign', 'useGifts', 'useOnboarding', 'useActivation', 'useExperiment', 'useReferrals', 'useReferralAdmin'],
    components: ['OnboardingFlow', 'ActivationChecklist', 'HowDidYouHear', 'ReferralCard'],
    findings: ['analytics'],
  },
  {
    name: 'nuxt-backend-email',
    covers: 'transactional email, templates, delivery tracking, the dev inbox and notifications',
    docs: ['/docs/build/email', '/docs/develop/dev-inbox'],
    entrypoints: ['nuxt-backend/email', 'nuxt-backend/notifications'],
    composables: ['useEmailStatus', 'useSandboxInbox', 'useNotifications', 'useNotificationInbox', 'useEmailPreferences', 'usePushSubscription', 'useAnnouncements', 'useAnnouncementsAdmin', 'useContactForm', 'useInboxAdmin'],
    components: ['NotificationInbox', 'ContactForm'],
    commands: ['inbox', 'email sync'],

    findings: ['email', 'notifications'],
    functions: ['email', 'notifications'],
  },
  {
    name: 'nuxt-backend-ai',
    covers: 'metered AI actions, streams and the job queue',
    docs: ['/docs/build/ai'],
    entrypoints: ['nuxt-backend/ai'],
    composables: ['useAiStream', 'useJob', 'useChat', 'useAiLabel'],
    components: ['AiLabel'],
    findings: ['ai'],
  },
  {
    name: 'nuxt-backend-data',
    covers: 'the function tiers, queries and mutations, errors, search, workflows, uploads, share links, retention, tokens and the Convex components for counts, queues, cached actions, crons and migrations',
    docs: ['/docs/build/data'],
    entrypoints: ['nuxt-backend/functions', 'nuxt-backend/search', 'nuxt-backend/workflows', 'nuxt-backend/storage'],
    composables: ['getBackendError', 'useBackendClient', 'useConnectionState', 'useSearch', 'useWorkflowStatus', 'useShareLink', 'useUploadField'],
    components: ['ConnectionStatus', 'UploadField'],
  },
  {
    name: 'nuxt-backend-ui',
    covers: 'the packaged pages and components, their parts, theming, labels, translation, slots, the headless composables and eject',
    docs: ['/docs/build/ui'],
    composables: ['useLabels', 'useBackendPagePath', 'useBackendConfig', 'useAppShell'],
    components: ['Gate', 'BackendNotices', 'AppShell'],
    commands: ['eject'],
  },
  {
    name: 'nuxt-backend-ship',
    covers: 'provider setup, tests, deploying, production checks, monitoring, flags and kill switches, webhooks and rate limits',
    docs: ['/docs/services', '/docs/develop/testing', '/docs/ship'],
    entrypoints: ['nuxt-backend/http', 'nuxt-backend/rate-limit', 'nuxt-backend/monitoring', 'nuxt-backend/flags', 'nuxt-backend/test', 'nuxt-backend/test-utils', 'nuxt-backend/eslint'],
    composables: ['useFlag', 'useFlagAdmin'],
    commands: ['doctor', 'status', 'env push', 'env rotate', 'deploy', 'analyze', 'mcp'],
    findings: ['monitoring', 'site'],
    functions: ['flags', 'webhooks'],
  },
  {
    name: 'nuxt-backend-upgrade',
    covers: 'moving an app to a new version, and every name a release renamed or removed',
    docs: ['/docs/ship/releases'],
    commands: ['upgrade'],
  },
] as const satisfies readonly AgentSkill[]

/** Every shipped skill, the core first. */
export const AGENT_SKILLS: readonly AgentSkill[] = [CORE_SKILL, ...TASK_SKILLS]

/**
 * The most bytes a `SKILL.md` may hold. Agents load the core with every task
 * and a task skill whole when they pick it, so lists go to `references/`.
 */
export const SKILL_BUDGETS = { core: 12_000, task: 20_000 } as const
