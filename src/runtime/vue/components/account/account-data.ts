import { inject, provide, type ComputedRef, type InjectionKey, type Ref } from 'vue'
import type { AccountDeletion, AccountExport, UseAccountReturn } from '../../composables/use-account'
import type { UseLabelsReturn } from '../../composables/use-labels'

/** A section of `<AccountData>`: the export, and the deletion. */
export type AccountDataSection = 'export' | 'delete'

export interface AccountDataSlotContext {
  account: UseAccountReturn
  /** The newest export whose link still works, or `null`. */
  latestExport: AccountExport | null
  /** The deletion waiting out its grace period, or `null`. */
  deletion: AccountDeletion | null
  /** What the person typed to confirm a deletion. */
  typed: string
  /** Whether it is the account's address, so the deletion may go. */
  confirmed: boolean
  /** Whether an action runs. */
  isPending: boolean
  /** Which action runs (`export`, `delete`), or `null`. */
  pendingAction: AccountDataSection | null
  /** Why the last action failed, in words, or `null`. */
  error: string | null
  exportData: () => Promise<void>
  deleteAccount: () => Promise<void>
  /** Keep the account: cancel the scheduled deletion. */
  keepAccount: () => Promise<void>
}

/** `<AccountData>`'s slots, one per region; each receives {@link AccountDataSlotContext}. */
export interface AccountDataSlots {
  /** The export: its note, the newest link and the button. */
  export: (context: AccountDataSlotContext) => unknown
  /** The deletion: its warning, the typed confirmation and the button. */
  delete: (context: AccountDataSlotContext) => unknown
  /** Why an action failed. */
  error: (context: AccountDataSlotContext) => unknown
  /** Below everything. */
  footer: (context: AccountDataSlotContext) => unknown
}

/** What `<AccountData>` hands its packaged parts beside their props. */
export interface AccountDataView {
  labels: UseLabelsReturn<'account'>
  context: ComputedRef<AccountDataSlotContext>
  id: string
  /** What the person typed to confirm a deletion. */
  typed: Ref<string>
  /** The deletion was asked for with the wrong address: the field says so. */
  mismatched: Ref<boolean>
  /** The download link, which takes focus once an export is ready. */
  link: Ref<HTMLAnchorElement | null>
}

const ACCOUNT_DATA_VIEW: InjectionKey<AccountDataView> = Symbol('nuxt-backend:account-data')

/** @internal */
export function provideAccountDataView(view: AccountDataView): void {
  provide(ACCOUNT_DATA_VIEW, view)
}

/** @internal */
export function useAccountDataView(part: string): AccountDataView {
  const view = inject(ACCOUNT_DATA_VIEW, null)
  if (!view) throw new Error(`[nuxt-backend] <${part}> renders inside <AccountData>. To build one of your own, use useAccount().`)
  return view
}
