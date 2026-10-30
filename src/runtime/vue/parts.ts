// `#backend/parts`: the props each part of the packaged UI receives. An app
// component named like a part (`app/components/PricingPlanCard.vue`)
// replaces it everywhere and receives the same props: the parent's headless
// composable and the item it renders. Parts emit nothing; they call the
// composable's actions.

import type { UseAccountReturn } from './composables/use-account'
import type { UseAppShellReturn } from './composables/use-app-shell'
import type { UseAdminReturn } from './composables/use-admin'
import type { AuditEntry } from './composables/use-audit-log'
import type { UseBillingReturn, BillingOrder, UsageEvent } from './composables/use-billing'
import type { UseCreditsReturn } from './composables/use-credits'
import type { UseCancelFlowReturn } from './components/billing/cancel-flow'
import type { SignInAlertsState } from './components/account/security-alerts'
import type { UseEmailChangeReturn } from './composables/use-email-change'
import type { UseEmailPreferencesReturn } from './composables/use-email-preferences'
import type { NotificationItem } from './composables/use-notifications'
import type { UseNotificationInboxReturn } from './composables/use-notification-inbox'
import type { UseLoginFlowReturn } from './composables/use-login-flow'
import type { UseOnboardingReturn } from './composables/use-onboarding'
import type { UsePasskeysReturn } from './composables/use-passkeys'
import type { UsePricingReturn } from './composables/use-pricing'
import type { UseReauthenticationReturn } from './composables/use-reauthentication'
import type { UseSessionsReturn } from './composables/use-sessions'
import type { UseWaitlistReturn } from './composables/use-waitlist'
import type { UseWorkspaceReturn } from './composables/use-workspace'
import type { ResolvedPack, ResolvedPlan } from './components/billing/pricing-table'
import type { AdminUserRow, AdminWorkspaceRow } from './components/admin/admin'
import type { InvitationView } from './components/workspaces/accept-invitation'

export type { ResolvedPack, ResolvedPlan } from './components/billing/pricing-table'

/** The parts of `<CancelFlow>`: `CancelFlowQuestion`, `CancelFlowOffer` and `CancelFlowEnd`. */
export interface CancelFlowPartProps {
  /** The cancel flow `<CancelFlow>` runs: `useCancelFlow()`. */
  flow: UseCancelFlowReturn
}
export type CancelFlowQuestionProps = CancelFlowPartProps
export type CancelFlowOfferProps = CancelFlowPartProps
export type CancelFlowEndProps = CancelFlowPartProps

/** The sign-in parts of `<AuthForm>`: `AuthFormHeader`, `AuthFormChoose`, `AuthFormPasskey`, `AuthFormEmail`, `AuthFormCode`, `AuthFormRecover`, `AuthFormWaitlisted`, `AuthFormInviteCode`, `AuthFormAge`, `AuthFormUndeliverable`, `AuthFormPasskeyOffer`, `AuthFormAgreement`, `AuthFormError`. */
export interface AuthFormPartProps {
  /** The login flow `<AuthForm>` runs: `useLoginFlow()`, with its `bind`. */
  flow: UseLoginFlowReturn
}
export type AuthFormHeaderProps = AuthFormPartProps
export type AuthFormChooseProps = AuthFormPartProps
export type AuthFormPasskeyProps = AuthFormPartProps
export type AuthFormEmailProps = AuthFormPartProps
export type AuthFormCodeProps = AuthFormPartProps
export type AuthFormRecoverProps = AuthFormPartProps
export type AuthFormWaitlistedProps = AuthFormPartProps
export type AuthFormInviteCodeProps = AuthFormPartProps
export type AuthFormAgeProps = AuthFormPartProps
export type AuthFormUndeliverableProps = AuthFormPartProps
export type AuthFormPasskeyOfferProps = AuthFormPartProps
export type AuthFormAgreementProps = AuthFormPartProps
export type AuthFormErrorProps = AuthFormPartProps

/** The parts of `<WaitlistForm>`: `WaitlistJoin`, `WaitlistCode`, `WaitlistPlace` and `WaitlistShare`, which `WaitlistPlace` renders. The `/waitlist` page renders `WaitlistPlace` too. */
export interface WaitlistPartProps {
  /** The steps the form runs: `useWaitlist()`. Its `join` and `verify` are the form's, which also emit its events. */
  waitlist: UseWaitlistReturn
}
export type WaitlistJoinProps = WaitlistPartProps
export type WaitlistCodeProps = WaitlistPartProps
export type WaitlistPlaceProps = WaitlistPartProps
export type WaitlistShareProps = WaitlistPartProps

/** The parts of `<AppShell>`: `AccountMenu` and `WorkspaceSwitcher`. */
export interface AppShellPartProps {
  /** The shell the header reads: `useAppShell()`. `WorkspaceSwitcher` renders only while its `switcher` is set. */
  shell: UseAppShellReturn
}
export type AccountMenuProps = AppShellPartProps
export type WorkspaceSwitcherProps = AppShellPartProps

/** The steps of `<OnboardingFlow>`: `OnboardingProfile`, `OnboardingWorkspace`, `OnboardingTeammates` and `OnboardingPlan`. */
export interface OnboardingStepProps {
  /** The first run the flow runs: `useOnboarding()`. A step saves what it asks for, then calls its `next()` or `skip()`. */
  onboarding: UseOnboardingReturn
}
export type OnboardingProfileProps = OnboardingStepProps
export type OnboardingWorkspaceProps = OnboardingStepProps
export type OnboardingTeammatesProps = OnboardingStepProps
export type OnboardingPlanProps = OnboardingStepProps

/** The parts of `<ReauthenticateDialog>`: `ReauthenticatePasskey`, `ReauthenticateCode`. */
export interface ReauthenticatePartProps {
  /** The re-authentication the dialog runs: `useReauthentication()`. */
  flow: UseReauthenticationReturn
}
export type ReauthenticatePasskeyProps = ReauthenticatePartProps
export type ReauthenticateCodeProps = ReauthenticatePartProps

/** The pricing parts that render the whole table's state. */
export interface PricingPartProps {
  /** The pricing the table runs: `usePricing()`, with its `bind`. */
  pricing: UsePricingReturn
}
export type PricingPeriodSwitchProps = PricingPartProps
export type PricingCurrencySelectProps = PricingPartProps
export type PricingCancelConfirmProps = PricingPartProps
/** `PricingPlanCard`: one plan. */
export interface PricingPlanCardProps extends PricingPartProps {
  /** The plan: its live pricing at the interval shown, joined with the app's copy. */
  plan: ResolvedPlan
}
/** `PricingPackCard`: one credit pack. */
export interface PricingPackCardProps extends PricingPartProps {
  /** The pack: its live pricing, joined with the app's copy. */
  pack: ResolvedPack
}

/** The profile parts that read the account: `ProfileIdentity`, `ProfileNameSection`, `ProfileLanguageSection`. */
export interface ProfilePartProps {
  /** `useAccount()`. */
  account: UseAccountReturn
}
export type ProfileIdentityProps = ProfilePartProps
export type ProfileNameSectionProps = ProfilePartProps
export type ProfileLanguageSectionProps = ProfilePartProps
/** `ProfileEmailSection`. */
export interface ProfileEmailSectionProps {
  /** `useEmailChange()`. */
  emailChange: UseEmailChangeReturn
}
/** `ProfilePreferencesSection`. */
export interface ProfilePreferencesSectionProps {
  /** `useEmailPreferences()`. */
  preferences: UseEmailPreferencesReturn
}
/** `SecurityPasskeys`. */
export interface SecurityPasskeysProps {
  /** `usePasskeys()`. */
  passkeys: UsePasskeysReturn
}
/** `SecurityAlerts`. */
export interface SecurityAlertsProps {
  /** The account's latest sign-ins from a new device, live (`listSignInAlerts`). */
  alerts: SignInAlertsState
}
/** `SecuritySessions`. */
export interface SecuritySessionsProps {
  /** `useSessions()`. */
  sessions: UseSessionsReturn
}
/** `AccountExport` and `AccountDeletion`. */
export interface AccountPartProps {
  /** `useAccount()`. */
  account: UseAccountReturn
}
export type AccountExportProps = AccountPartProps
export type AccountDeletionProps = AccountPartProps

/** `WorkspaceList`. */
export interface WorkspaceListProps {
  /** `useWorkspace()`. */
  workspace: UseWorkspaceReturn
}
/** `WorkspaceBilling`. */
export interface WorkspaceBillingProps {
  /** `useBilling()`. */
  billing: UseBillingReturn
}
/** `WorkspaceCredits`. */
export interface WorkspaceCreditsProps {
  /** `useCredits()`. */
  credits: UseCreditsReturn
}
/** `AcceptInvitationActions`. */
export interface AcceptInvitationActionsProps {
  /** The invitation the page answers, and the actions that answer it. */
  invitation: InvitationView
}

/** `BillingHistoryOrder`. */
export interface BillingHistoryOrderProps {
  /** One past charge. */
  order: BillingOrder
}
/** `UsageHistoryEvent`. */
export interface UsageHistoryEventProps {
  /** One usage event. */
  event: UsageEvent
}
/** `AuditLogEvent`. */
export interface AuditLogEventProps {
  /** One entry of the activity trail. */
  event: AuditEntry
}

/** `AdminUsersTable` and `AdminWorkspacesTable`. */
export interface AdminTablePartProps {
  /** `useAdmin()`. */
  admin: UseAdminReturn
}
export type AdminUsersTableProps = AdminTablePartProps
export type AdminWorkspacesTableProps = AdminTablePartProps
/** `AdminUserDrawer`. */
export interface AdminUserDrawerProps extends AdminTablePartProps {
  /** The account the drawer shows. */
  user: AdminUserRow
}
/** `AdminWorkspaceDrawer`. */
export interface AdminWorkspaceDrawerProps extends AdminTablePartProps {
  /** The workspace the drawer shows. */
  workspace: AdminWorkspaceRow
}

/** The parts of `<NotificationInbox>`: `NotificationInboxBell`, the button, and `NotificationInboxItem`, one row. */
export interface NotificationInboxPartProps {
  /** The inbox `<NotificationInbox>` runs: `useNotificationInbox()`, with its `bind`. */
  inbox: UseNotificationInboxReturn
}
export type NotificationInboxBellProps = NotificationInboxPartProps
/** `NotificationInboxItem`. */
export interface NotificationInboxItemProps extends NotificationInboxPartProps {
  /** One notification, worded for the person reading it. */
  notification: NotificationItem
}
