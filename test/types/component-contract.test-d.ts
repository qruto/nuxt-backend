import { describe, expectTypeOf, test } from 'vitest'
import type { COMPONENT_CONTRACT, ContractedComponent } from '../nuxt/component-contract'
import type { AccountDataSlots } from '../../src/runtime/vue/components/account/account-data'
import type { ConsentPromptSlots } from '../../src/runtime/vue/components/account/consent-prompt'
import type { ProfileSettingsSlots } from '../../src/runtime/vue/components/account/profile-settings'
import type { SecuritySettingsSlots } from '../../src/runtime/vue/components/account/security-settings'
import type { AdminUsersSlots, AdminWorkspacesSlots } from '../../src/runtime/vue/components/admin/admin'
import type { AuthFormSlots } from '../../src/runtime/vue/components/auth/auth-form'
import type { ReauthenticateDialogSlots } from '../../src/runtime/vue/components/auth/reauthenticate'
import type { WaitlistFormSlots } from '../../src/runtime/vue/components/auth/waitlist-form'
import type { BillingHistorySlots } from '../../src/runtime/vue/components/billing/billing-history'
import type { BillingLinkSlots } from '../../src/runtime/vue/components/billing/billing-links'
import type { CancelFlowSlots } from '../../src/runtime/vue/components/billing/cancel-flow'
import type { PricingTableSlots } from '../../src/runtime/vue/components/billing/pricing-table'
import type { UpgradePromptSlots } from '../../src/runtime/vue/components/billing/upgrade-prompt'
import type { UsageHistorySlots } from '../../src/runtime/vue/components/billing/usage-history'
import type { AccessDeniedSlots } from '../../src/runtime/vue/components/shell/access-denied'
import type { ConnectionStatusSlots } from '../../src/runtime/vue/components/shell/connection-status'
import type { ContactFormSlots } from '../../src/runtime/vue/components/shell/contact-form'
import type { AppShellSlots } from '../../src/runtime/vue/components/shell/app-shell'
import type { ActivationChecklistSlots } from '../../src/runtime/vue/components/account/activation-checklist'
import type { OnboardingFlowSlots } from '../../src/runtime/vue/components/account/onboarding-flow'
import type { HowDidYouHearSlots } from '../../src/runtime/vue/components/account/how-did-you-hear'
import type { GateSlots } from '../../src/runtime/vue/components/shell/gate'
import type { BackendNoticesSlots } from '../../src/runtime/vue/components/shell/notices'
import type { NotificationInboxSlots } from '../../src/runtime/vue/components/shell/notification-inbox'
import type { UploadFieldSlots } from '../../src/runtime/vue/components/shell/upload-field'
import type { AiLabelSlots } from '../../src/runtime/vue/components/shell/ai-label'
import type { AcceptInvitationSlots } from '../../src/runtime/vue/components/workspaces/accept-invitation'
import type { AuditLogSlots } from '../../src/runtime/vue/components/workspaces/audit-log'
import type { WorkspaceSettingsSlots } from '../../src/runtime/vue/components/workspaces/workspace-settings'

// The component contract's slot column, held to the types: each packaged
// component types its slots with `defineSlots<…Slots>()`, an interface
// beside it, and the names that interface types are exactly the ones its
// row lists. (tsc reads no `.vue` file, so the interfaces stand in for the
// components; each `.vue` file names its own in `defineSlots`.)

interface Slots {
  AuthForm: AuthFormSlots
  ConsentPrompt: ConsentPromptSlots
  WaitlistForm: WaitlistFormSlots
  ProfileSettings: ProfileSettingsSlots
  SecuritySettings: SecuritySettingsSlots
  AcceptInvitation: AcceptInvitationSlots
  PricingTable: PricingTableSlots
  BillingCheckoutLink: BillingLinkSlots
  BillingPortalLink: BillingLinkSlots
  BillingHistory: BillingHistorySlots
  UsageHistory: UsageHistorySlots
  AccountData: AccountDataSlots
  AuditLog: AuditLogSlots
  AdminUsers: AdminUsersSlots
  AdminWorkspaces: AdminWorkspacesSlots
  UpgradePrompt: UpgradePromptSlots
  WorkspaceSettings: WorkspaceSettingsSlots
  Gate: GateSlots
  BackendNotices: BackendNoticesSlots
  AccessDenied: AccessDeniedSlots
  ConnectionStatus: ConnectionStatusSlots
  ReauthenticateDialog: ReauthenticateDialogSlots
  UploadField: UploadFieldSlots
  NotificationInbox: NotificationInboxSlots
  ContactForm: ContactFormSlots
  AppShell: AppShellSlots
  OnboardingFlow: OnboardingFlowSlots
  ActivationChecklist: ActivationChecklistSlots
  HowDidYouHear: HowDidYouHearSlots
  AiLabel: AiLabelSlots
  CancelFlow: CancelFlowSlots
  // No slots: the button and the card render their parts by registered name.
  WithdrawalButton: Record<never, never>
  ReferralCard: Record<never, never>
}

/** The slot names its contract row lists. */
type Listed<N extends ContractedComponent> = (typeof COMPONENT_CONTRACT)[N]['slots'][number]
/** The components whose typed slots differ from their row: `never` when none does. */
type Mismatched = {
  [N in ContractedComponent]: [keyof Slots[N]] extends [Listed<N>]
    ? [Listed<N>] extends [keyof Slots[N]] ? never : N
    : N
}[ContractedComponent]

describe('the component contract, typed', () => {
  test('every contracted component is checked here', () => {
    expectTypeOf<keyof Slots>().toEqualTypeOf<ContractedComponent>()
  })

  test('every component types exactly the slots its row lists', () => {
    expectTypeOf<Mismatched>().toEqualTypeOf<never>()
  })

  test('a slot receives what the component hands it', () => {
    expectTypeOf<PricingTableSlots['plan-action']>().parameter(0).toHaveProperty('plan')
    expectTypeOf<BillingLinkSlots['default']>().parameter(0).toEqualTypeOf<{ pending: boolean }>()
    expectTypeOf<GateSlots['default']>().parameter(0).toHaveProperty('workspace')
  })
})
