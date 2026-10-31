// The packaged UI, as the module registers it, the stylesheet loads it and
// `nuxt-backend eject` copies it: one row per `.vue` file under
// src/runtime/vue/components/, each by the name an app sees it under.
//
// - A `component` is public: registered under its name, with a row in the
//   component contract (test/nuxt/component-contract.ts).
// - A `part` is one region of a component, registered under its own name
//   too, so an app component of the same name replaces it everywhere: the
//   parent renders it by name, and Nuxt resolves the name to the app's.
// - An `internal` file is a piece of a component or page, never registered.
//
// Every file has its stylesheet beside it (`<Name>.css`, its rules inside
// `@layer nuxt-backend`), loaded when its capability is detected, unless
// the app shadows the name (src/nuxt/styles.ts).

/** The folder a file sits in, under src/runtime/vue/components/. */
export type UiFolder = 'auth' | 'account' | 'workspaces' | 'billing' | 'admin' | 'shell'

/** What loads a file's stylesheet: `auth` is every app's, `billing` an app with a billing catalog, `notifications` an app with an inbox (`backend/notifications.ts`). */
export type UiCapability = 'auth' | 'billing' | 'notifications'

/** One packaged `.vue` file. */
export interface UiEntry {
  /** The name an app sees it under, and the file's name. */
  name: string
  folder: UiFolder
  kind: 'component' | 'part' | 'internal'
  capability: UiCapability
  /** A part's component. */
  parent?: string
  /** Registered lazily: its code is fetched when one first renders (src/nuxt/registry.ts, `lazily`). */
  lazy?: true
  /** It has no stylesheet of its own. */
  unstyled?: true
}

// A component and a part are written as one object, its `name` first: the
// shape the docs and the surface tests read every registered name in.
const component = (entry: Omit<UiEntry, 'kind'>): UiEntry => ({ ...entry, kind: 'component' })
const part = (entry: Omit<UiEntry, 'kind'>): UiEntry => ({ ...entry, kind: 'part' })
const internal = (name: string, folder: UiFolder, capability: UiCapability, extra: Partial<UiEntry> = {}): UiEntry => ({ name, folder, kind: 'internal', capability, ...extra })

/** Every packaged `.vue` file, components before their parts. */
export const UI_ENTRIES: readonly UiEntry[] = [
  component({ name: 'AuthForm', folder: 'auth', capability: 'auth' }),
  part({ name: 'AuthFormHeader', parent: 'AuthForm', folder: 'auth', capability: 'auth' }),
  part({ name: 'AuthFormChoose', parent: 'AuthForm', folder: 'auth', capability: 'auth' }),
  part({ name: 'AuthFormPasskey', parent: 'AuthForm', folder: 'auth', capability: 'auth' }),
  part({ name: 'AuthFormEmail', parent: 'AuthForm', folder: 'auth', capability: 'auth' }),
  part({ name: 'AuthFormCode', parent: 'AuthForm', folder: 'auth', capability: 'auth' }),
  part({ name: 'AuthFormRecover', parent: 'AuthForm', folder: 'auth', capability: 'auth' }),
  part({ name: 'AuthFormWaitlisted', parent: 'AuthForm', folder: 'auth', capability: 'auth' }),
  part({ name: 'AuthFormInviteCode', parent: 'AuthForm', folder: 'auth', capability: 'auth' }),
  part({ name: 'AuthFormAge', parent: 'AuthForm', folder: 'auth', capability: 'auth' }),
  part({ name: 'AuthFormUndeliverable', parent: 'AuthForm', folder: 'auth', capability: 'auth' }),
  part({ name: 'AuthFormPasskeyOffer', parent: 'AuthForm', folder: 'auth', capability: 'auth' }),
  part({ name: 'AuthFormAgreement', parent: 'AuthForm', folder: 'auth', capability: 'auth' }),
  part({ name: 'AuthFormError', parent: 'AuthForm', folder: 'auth', capability: 'auth' }),
  component({ name: 'WaitlistForm', folder: 'auth', capability: 'auth' }),
  part({ name: 'WaitlistJoin', parent: 'WaitlistForm', folder: 'auth', capability: 'auth' }),
  part({ name: 'WaitlistCode', parent: 'WaitlistForm', folder: 'auth', capability: 'auth' }),
  part({ name: 'WaitlistPlace', parent: 'WaitlistForm', folder: 'auth', capability: 'auth' }),
  part({ name: 'WaitlistShare', parent: 'WaitlistForm', folder: 'auth', capability: 'auth' }),
  component({ name: 'ReauthenticateDialog', folder: 'auth', capability: 'auth' }),
  part({ name: 'ReauthenticatePasskey', parent: 'ReauthenticateDialog', folder: 'auth', capability: 'auth' }),
  part({ name: 'ReauthenticateCode', parent: 'ReauthenticateDialog', folder: 'auth', capability: 'auth' }),

  component({ name: 'ProfileSettings', folder: 'account', capability: 'auth' }),
  part({ name: 'ProfileIdentity', parent: 'ProfileSettings', folder: 'account', capability: 'auth' }),
  part({ name: 'ProfileNameSection', parent: 'ProfileSettings', folder: 'account', capability: 'auth' }),
  part({ name: 'ProfileEmailSection', parent: 'ProfileSettings', folder: 'account', capability: 'auth' }),
  part({ name: 'ProfileLanguageSection', parent: 'ProfileSettings', folder: 'account', capability: 'auth' }),
  part({ name: 'ProfilePreferencesSection', parent: 'ProfileSettings', folder: 'account', capability: 'auth' }),
  component({ name: 'SecuritySettings', folder: 'account', capability: 'auth' }),
  part({ name: 'SecurityPasskeys', parent: 'SecuritySettings', folder: 'account', capability: 'auth' }),
  part({ name: 'SecuritySessions', parent: 'SecuritySettings', folder: 'account', capability: 'auth' }),
  part({ name: 'SecurityAlerts', parent: 'SecuritySettings', folder: 'account', capability: 'auth' }),
  component({ name: 'ConsentPrompt', folder: 'account', capability: 'auth' }),
  component({ name: 'OnboardingFlow', folder: 'account', capability: 'auth' }),
  part({ name: 'OnboardingProfile', parent: 'OnboardingFlow', folder: 'account', capability: 'auth' }),
  part({ name: 'OnboardingWorkspace', parent: 'OnboardingFlow', folder: 'account', capability: 'auth' }),
  part({ name: 'OnboardingTeammates', parent: 'OnboardingFlow', folder: 'account', capability: 'auth' }),
  part({ name: 'OnboardingPlan', parent: 'OnboardingFlow', folder: 'account', capability: 'auth' }),
  component({ name: 'ActivationChecklist', folder: 'account', capability: 'auth' }),
  component({ name: 'HowDidYouHear', folder: 'account', capability: 'auth' }),
  component({ name: 'AccountData', folder: 'account', capability: 'auth' }),
  part({ name: 'AccountExport', parent: 'AccountData', folder: 'account', capability: 'auth' }),
  part({ name: 'AccountDeletion', parent: 'AccountData', folder: 'account', capability: 'auth' }),

  component({ name: 'WorkspaceSettings', folder: 'workspaces', capability: 'auth' }),
  part({ name: 'WorkspaceList', parent: 'WorkspaceSettings', folder: 'workspaces', capability: 'auth' }),
  part({ name: 'WorkspaceBilling', parent: 'WorkspaceSettings', folder: 'workspaces', capability: 'billing' }),
  part({ name: 'WorkspaceCredits', parent: 'WorkspaceSettings', folder: 'workspaces', capability: 'billing' }),
  component({ name: 'AcceptInvitation', folder: 'workspaces', capability: 'auth' }),
  part({ name: 'AcceptInvitationActions', parent: 'AcceptInvitation', folder: 'workspaces', capability: 'auth' }),
  component({ name: 'AuditLog', folder: 'workspaces', capability: 'auth' }),
  part({ name: 'AuditLogEvent', parent: 'AuditLog', folder: 'workspaces', capability: 'auth' }),

  component({ name: 'PricingTable', folder: 'billing', capability: 'billing' }),
  part({ name: 'PricingPeriodSwitch', parent: 'PricingTable', folder: 'billing', capability: 'billing' }),
  part({ name: 'PricingCurrencySelect', parent: 'PricingTable', folder: 'billing', capability: 'billing' }),
  part({ name: 'PricingPlanCard', parent: 'PricingTable', folder: 'billing', capability: 'billing' }),
  part({ name: 'PricingPackCard', parent: 'PricingTable', folder: 'billing', capability: 'billing' }),
  part({ name: 'PricingCancelConfirm', parent: 'PricingTable', folder: 'billing', capability: 'billing' }),
  part({ name: 'PricingEmailOptOut', parent: 'PricingTable', folder: 'billing', capability: 'billing' }),
  component({ name: 'BillingCheckoutLink', folder: 'billing', capability: 'billing', unstyled: true }),
  component({ name: 'BillingPortalLink', folder: 'billing', capability: 'billing', unstyled: true }),
  component({ name: 'BillingHistory', folder: 'billing', capability: 'billing' }),
  part({ name: 'BillingHistoryOrder', parent: 'BillingHistory', folder: 'billing', capability: 'billing' }),
  component({ name: 'UsageHistory', folder: 'billing', capability: 'billing' }),
  part({ name: 'UsageHistoryEvent', parent: 'UsageHistory', folder: 'billing', capability: 'billing' }),
  component({ name: 'UpgradePrompt', folder: 'billing', capability: 'billing' }),
  component({ name: 'CancelFlow', folder: 'billing', capability: 'billing' }),
  part({ name: 'CancelFlowQuestion', parent: 'CancelFlow', folder: 'billing', capability: 'billing', unstyled: true }),
  part({ name: 'CancelFlowOffer', parent: 'CancelFlow', folder: 'billing', capability: 'billing', unstyled: true }),
  part({ name: 'CancelFlowEnd', parent: 'CancelFlow', folder: 'billing', capability: 'billing', unstyled: true }),
  component({ name: 'WithdrawalButton', folder: 'billing', capability: 'billing' }),
  component({ name: 'ReferralCard', folder: 'billing', capability: 'billing' }),

  component({ name: 'AdminUsers', folder: 'admin', capability: 'auth', lazy: true }),
  part({ name: 'AdminUsersTable', parent: 'AdminUsers', folder: 'admin', capability: 'auth' }),
  part({ name: 'AdminUserDrawer', parent: 'AdminUsers', folder: 'admin', capability: 'auth' }),
  component({ name: 'AdminWorkspaces', folder: 'admin', capability: 'auth', lazy: true }),
  part({ name: 'AdminWorkspacesTable', parent: 'AdminWorkspaces', folder: 'admin', capability: 'auth' }),
  part({ name: 'AdminWorkspaceDrawer', parent: 'AdminWorkspaces', folder: 'admin', capability: 'auth' }),
  internal('AdminConsole', 'admin', 'auth'),
  internal('AdminFlags', 'admin', 'auth'),
  internal('AdminAccess', 'admin', 'auth'),
  internal('AdminWaitlist', 'admin', 'auth'),
  internal('AdminAnnouncements', 'admin', 'auth'),
  internal('AdminCosts', 'admin', 'auth'),
  internal('AdminAnalytics', 'admin', 'auth'),
  internal('AdminInbox', 'admin', 'auth'),
  internal('AdminReports', 'admin', 'auth'),
  internal('AdminReferrals', 'admin', 'auth'),
  internal('AdminBilling', 'admin', 'auth'),
  internal('AdminQueue', 'admin', 'auth'),
  internal('AdminWebhooks', 'admin', 'auth'),
  internal('AdminSuppressions', 'admin', 'auth'),
  internal('AdminSystem', 'admin', 'auth'),

  component({ name: 'Gate', folder: 'shell', capability: 'auth' }),
  component({ name: 'BackendNotices', folder: 'shell', capability: 'auth' }),
  component({ name: 'AccessDenied', folder: 'shell', capability: 'auth' }),
  component({ name: 'ConnectionStatus', folder: 'shell', capability: 'auth' }),
  component({ name: 'UploadField', folder: 'shell', capability: 'auth' }),
  component({ name: 'NotificationInbox', folder: 'shell', capability: 'notifications' }),
  part({ name: 'NotificationInboxBell', parent: 'NotificationInbox', folder: 'shell', capability: 'notifications', unstyled: true }),
  part({ name: 'NotificationInboxItem', parent: 'NotificationInbox', folder: 'shell', capability: 'notifications', unstyled: true }),
  component({ name: 'ContactForm', folder: 'shell', capability: 'auth' }),
  component({ name: 'AppShell', folder: 'shell', capability: 'auth' }),
  part({ name: 'AccountMenu', parent: 'AppShell', folder: 'shell', capability: 'auth' }),
  part({ name: 'WorkspaceSwitcher', parent: 'AppShell', folder: 'shell', capability: 'auth' }),
  component({ name: 'AiLabel', folder: 'shell', capability: 'auth' }),
  internal('ErrorPage', 'shell', 'auth', { unstyled: true }),
  internal('PageFrame', 'shell', 'auth'),
]

/** The registered names: every component and part. */
export const REGISTERED_UI: readonly UiEntry[] = UI_ENTRIES.filter(entry => entry.kind !== 'internal')

/** The parts, in the order their components list them. */
export const UI_PARTS: readonly UiEntry[] = UI_ENTRIES.filter(entry => entry.kind === 'part')

/** A file's path under src/runtime/vue/components/, without its extension: `billing/PricingPlanCard`. */
export function uiPath(entry: Pick<UiEntry, 'folder' | 'name'>): string {
  return `${entry.folder}/${entry.name}`
}

/** One entry by name, or `undefined`. */
export function uiEntry(name: string): UiEntry | undefined {
  return UI_ENTRIES.find(entry => entry.name === name)
}

/** The internals other files render, never registered: their stylesheets load with their component's. */
export const UI_INTERNALS: readonly UiEntry[] = [
  internal('NoticeImpersonation', 'shell', 'auth'),
  internal('NoticeMaintenance', 'shell', 'auth'),
  internal('NoticeLowCredits', 'shell', 'billing'),
  internal('NoticeGift', 'shell', 'billing'),
  internal('NoticeAnnouncement', 'shell', 'auth'),
  internal('NoticePastDue', 'shell', 'billing'),
  internal('GiftList', 'billing', 'billing'),
  internal('GiftReceived', 'billing', 'billing', { unstyled: true }),
  internal('GiftSent', 'billing', 'billing', { unstyled: true }),
  internal('GateQuota', 'shell', 'billing'),
  internal('ListPager', 'shell', 'auth'),
  internal('ConfirmDialog', 'shell', 'auth'),
  internal('AccessDeniedPage', 'shell', 'auth'),
  internal('FrameConnectionStatus', 'shell', 'auth'),
  internal('CancelConfirmGroup', 'billing', 'billing'),
  internal('PricingPromotion', 'billing', 'billing'),
  internal('PagedList', 'shell', 'auth'),
  internal('FrameMain', 'shell', 'auth'),
  internal('AdminListFrame', 'admin', 'auth'),
  internal('AdminDrawerFrame', 'admin', 'auth'),
  internal('AdminListTail', 'admin', 'auth'),
  internal('AdminTabStatus', 'admin', 'auth'),
  internal('AdminTabDialogs', 'admin', 'auth'),
  internal('NoticeDeletion', 'shell', 'auth'),
  internal('WaitlistStatus', 'auth', 'auth'),
  internal('InviteRedeem', 'auth', 'auth'),
  internal('ReportNotice', 'shell', 'auth'),
  internal('ReportAppeal', 'shell', 'auth'),
  internal('LegalDocument', 'shell', 'auth'),
  internal('LegalDataMap', 'shell', 'auth', { unstyled: true }),
  internal('LegalProcessors', 'shell', 'auth', { unstyled: true }),
  internal('LegalStorage', 'shell', 'auth', { unstyled: true }),
  internal('ReferralLanding', 'billing', 'billing'),
  internal('ConsentPromptDialog', 'account', 'auth'),
  internal('ConsentPromptItem', 'account', 'auth'),
  internal('ConsentPromptAge', 'account', 'auth'),
  internal('ConsentPromptStorage', 'account', 'auth'),
  internal('OnboardingStepActions', 'account', 'auth', { unstyled: true }),
  internal('KeepAccount', 'account', 'auth'),
  internal('EmailUnsubscribe', 'account', 'auth'),
  internal('AdminAccessAdmissions', 'admin', 'auth'),
  internal('AdminAccessAdmit', 'admin', 'auth'),
  internal('AdminAccessCreate', 'admin', 'auth'),
  internal('AdminAccessInvites', 'admin', 'auth'),
  internal('AdminAccessPhase', 'admin', 'auth'),
  internal('AdminAccessRevoke', 'admin', 'auth'),
  internal('AdminAccessTable', 'admin', 'auth'),
  internal('AdminWaitlistActions', 'admin', 'auth'),
  internal('AdminWaitlistFilter', 'admin', 'auth'),
  internal('AdminWaitlistSummary', 'admin', 'auth'),
  internal('AdminWaitlistTable', 'admin', 'auth'),
  internal('AdminAnnouncementsCompose', 'admin', 'auth'),
  internal('AdminAnnouncementsItem', 'admin', 'auth'),
  internal('AdminInboxMessage', 'admin', 'auth'),
  internal('AdminReportsSubject', 'admin', 'auth'),
  internal('AdminReportsNotice', 'admin', 'auth'),
  internal('AdminReportsDecision', 'admin', 'auth'),
  internal('AdminReportsAppeal', 'admin', 'auth'),
  internal('AdminQueueControls', 'admin', 'auth'),
  internal('AdminQueueJob', 'admin', 'auth'),
  internal('AdminQueueJobs', 'admin', 'auth'),
  internal('AdminQueueModels', 'admin', 'auth'),
  internal('AdminQueueTier', 'admin', 'auth'),
  internal('AdminQueueTiers', 'admin', 'auth'),
  internal('AdminRevenue', 'admin', 'billing'),
  internal('AdminChart', 'admin', 'auth'),
  internal('AdminGrowth', 'admin', 'auth'),
  internal('AdminExperiments', 'admin', 'auth'),
]

/**
 * The stylesheets every packaged component reads, under
 * src/runtime/vue/components/, in load order: the tokens first (they declare
 * the layer order), then the shared rules, then the admin family's.
 */
export const UI_SHARED_STYLES: ReadonlyArray<{ file: string, capability: UiCapability }> = [
  { file: 'tokens.css', capability: 'auth' },
  { file: 'shared.css', capability: 'auth' },
  { file: 'admin/admin.css', capability: 'auth' },
]
