import { inject, provide, type ComputedRef, type InjectionKey, type Ref } from 'vue'
import type { EntitlementBenefit, UseBillingReturn } from '../../composables/use-billing'
import type { UseCreditsReturn } from '../../composables/use-credits'
import type { UseLabelsReturn } from '../../composables/use-labels'
import type { UseWorkspaceReturn, Workspace } from '../../composables/use-workspace'
import type { SettingsMessage } from '../../utils/settings-message'
import type { CreditPack } from '../../../config'
import type { BillingSection, CancelPlanOptions, PlanState } from './workspace-billing'

export type { CancelPlanOptions, PlanState } from './workspace-billing'
export type { SettingsMessage } from '../../utils/settings-message'

export type WorkspaceSettingsSection = 'workspaces' | 'billing' | 'credits'

export interface WorkspaceSettingsSlotContext {
  workspace: UseWorkspaceReturn
  billing: UseBillingReturn
  credits: UseCreditsReturn
  /** The packs to top up with: `appConfig.backend.billing.packs`, else every pack on sale. */
  packs: CreditPack[]
  planName: string
  periodEnd: string | null
  cancelAtPeriodEnd: boolean
  /** The state the plan is in (see {@link PlanState}), `null` on the free plan or while it loads. */
  planState: PlanState | null
  /** What the plan and the packs bought include, each benefit in neutral words. */
  benefits: EntitlementBenefit[]
  pricingPath: string
  message: SettingsMessage | null
  pending: string | null
  createWorkspace: (name: string) => Promise<void>
  switchWorkspace: (id: string) => Promise<void>
  /** Cancel at the period's end at once, with the reason and words a flow of your own gathered (both optional). */
  cancelPlan: (options?: CancelPlanOptions) => Promise<void>
  /** Undo the cancellation set for the period's end. */
  keepPlan: () => Promise<void>
  /** Resume a paused plan now. */
  resumePlan: () => Promise<void>
  /** Undo the plan change scheduled for the period's end. */
  cancelChange: () => Promise<void>
  /** Open the billing portal: the payment method, invoices, whole keys and files. */
  openPortal: () => Promise<void>
  /** Keep a gifted plan: an ordinary checkout of it, which moves the pass to the paid plan in place. */
  keepGifted: () => Promise<void>
  buyPack: (key: string) => Promise<void>
  refreshCredits: () => Promise<void>
}

/** `<WorkspaceSettings>`'s slots, one per region; each receives {@link WorkspaceSettingsSlotContext}. */
export interface WorkspaceSettingsSlots {
  /** The whole workspaces section. */
  workspaces: (context: WorkspaceSettingsSlotContext) => unknown
  /** One workspace row, with the workspace and whether it is the active one. */
  workspace: (context: WorkspaceSettingsSlotContext & { entry: Workspace, active: boolean }) => unknown
  /** The create-workspace form. */
  create: (context: WorkspaceSettingsSlotContext) => unknown
  /** The whole plan section: the plan's state and its action, what it includes, and cancelling it. */
  billing: (context: WorkspaceSettingsSlotContext) => unknown
  /** The whole credits section. */
  credits: (context: WorkspaceSettingsSlotContext) => unknown
  /** Below everything. */
  footer: (context: WorkspaceSettingsSlotContext) => unknown
}

/** What `<WorkspaceSettings>` hands its packaged parts beside their props. */
export interface WorkspaceSettingsView {
  labels: UseLabelsReturn<'settings'>
  context: ComputedRef<WorkspaceSettingsSlotContext>
  /** The component's slots a packaged part renders through when the app fills them. */
  slots: Pick<Partial<WorkspaceSettingsSlots>, 'workspace' | 'create'>
  /** The name the create form holds. */
  newName: Ref<string>
  /** The id of one part of a row, unique to this instance. */
  partId: (key: string, part: string) => string
  /** The plan section's state and actions. */
  section: BillingSection
  /** The catalog's products by key, for the top-up buttons. */
  products: ComputedRef<Record<string, { name?: string } | undefined>>
  /** A plan's product name, by its id. */
  productName: (productId: string) => string | undefined
}

const SETTINGS_VIEW: InjectionKey<WorkspaceSettingsView> = Symbol('nuxt-backend:workspace-settings')

/** @internal */
export function provideWorkspaceSettingsView(view: WorkspaceSettingsView): void {
  provide(SETTINGS_VIEW, view)
}

/** @internal */
export function useWorkspaceSettingsView(part: string): WorkspaceSettingsView {
  const view = inject(SETTINGS_VIEW, null)
  if (!view) throw new Error(`[nuxt-backend] <${part}> renders inside <WorkspaceSettings>. To build one of your own, use useWorkspace(), useBilling() and useCredits().`)
  return view
}
