import { inject, provide, type ComputedRef, type InjectionKey, type Ref } from 'vue'
import type { UseLabelsReturn } from '../../composables/use-labels'
import type { Passkey, UsePasskeysReturn } from '../../composables/use-passkeys'
import type { SessionInfo, UseSessionsReturn } from '../../composables/use-sessions'
import type { SettingsMessage } from '../../utils/settings-message'
import type { SignInAlertsState } from './security-alerts'

export type SecuritySection = 'passkeys' | 'sessions' | 'alerts' | 'danger'

export interface SecuritySlotContext {
  user: Record<string, unknown> | null | undefined
  passkeys: UsePasskeysReturn
  sessions: UseSessionsReturn
  /** The account's latest sign-ins from a new device. */
  alerts: SignInAlertsState
  message: SettingsMessage | null
  /** Whether an action runs. */
  isPending: boolean
  /** Which action runs (`passkey:add`, `session:<id>`, `sign-out`, …), the latest when several do, or `null`. */
  pendingAction: string | null
  signOut: () => Promise<void>
}

/** `<SecuritySettings>`'s slots, one per region; each receives {@link SecuritySlotContext}. */
export interface SecuritySettingsSlots {
  /** The whole passkeys section. */
  passkeys: (context: SecuritySlotContext) => unknown
  /** One passkey row, with the passkey. */
  passkey: (context: SecuritySlotContext & { entry: Passkey }) => unknown
  /** The whole sessions section. */
  sessions: (context: SecuritySlotContext) => unknown
  /** One session row, with the session. */
  session: (context: SecuritySlotContext & { entry: SessionInfo }) => unknown
  /** The Alerts section: the latest sign-ins from a new device, and with the recovery code. */
  alerts: (context: SecuritySlotContext) => unknown
  /** Signing this browser out. The account's export and deletion are `<AccountData>`'s. */
  danger: (context: SecuritySlotContext) => unknown
  /** Below everything. */
  footer: (context: SecuritySlotContext) => unknown
}

/** What `<SecuritySettings>` hands its packaged parts beside their props. */
export interface SecurityView {
  labels: UseLabelsReturn<'security'>
  context: ComputedRef<SecuritySlotContext>
  /** The component's row slots, which a packaged part renders a row through when the app fills one. */
  slots: Pick<Partial<SecuritySettingsSlots>, 'passkey' | 'session'>
  /** Whether the action with this key runs. */
  busy: (key: string) => boolean
  /** A date in the reader's words. */
  date: (value: string | number | Date) => string
  /** The passkey whose name is being edited, and the name typed. */
  editing: Ref<string | null>
  editName: Ref<string>
  addPasskey: () => Promise<void>
  removePasskey: (row: Passkey) => Promise<void>
  saveRename: (row: Passkey) => Promise<void>
  /** Turn passkey-only on or off, behind a recent sign-in; the recovery code it answers lands in `recoveryCode`. */
  setPasskeyOnly: (on: boolean) => Promise<void>
  /** The recovery code the last passkey-only switch answered, shown until the page goes. */
  recoveryCode: Ref<string | null>
  startRename: (row: Passkey) => void
  revokeSession: (row: SessionInfo) => Promise<void>
  revokeOthers: () => Promise<void>
  /** A passkey's name as the rows show it. */
  passkeyName: (row: Passkey) => string
  /** A session's device in the reader's words. */
  deviceName: (userAgent?: string | null) => string
}

const SECURITY_VIEW: InjectionKey<SecurityView> = Symbol('nuxt-backend:security')

/** @internal */
export function provideSecurityView(view: SecurityView): void {
  provide(SECURITY_VIEW, view)
}

/** @internal */
export function useSecurityView(part: string): SecurityView {
  const view = inject(SECURITY_VIEW, null)
  if (!view) throw new Error(`[nuxt-backend] <${part}> renders inside <SecuritySettings>. To build one of your own, use usePasskeys() and useSessions().`)
  return view
}
