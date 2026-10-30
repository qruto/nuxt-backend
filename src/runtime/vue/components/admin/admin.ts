import { inject, nextTick, provide, ref, watch, type ComputedRef, type InjectionKey, type Ref } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import type { AdminUser, AdminWorkspace, UseAdminReturn } from '../../composables/use-admin'
import type { UseLabelsReturn } from '../../composables/use-labels'
import { focusedIn, returnFocus } from '../../utils/focus-return'
import { type SettingsMessage, useSettingsMessage } from '../../utils/settings-message'
import type { PageTurns } from '../../utils/page-turns'

/** One account in `<AdminUsers>`' list, as `AdminUserDrawer` receives it. */
export type AdminUserRow = AdminUser
/** One workspace in `<AdminWorkspaces>`' list, as `AdminWorkspaceDrawer` receives it. */
export type AdminWorkspaceRow = AdminWorkspace

export interface AdminUsersSlotContext {
  admin: UseAdminReturn
  /** The page of accounts in view (empty while loading or when none match). */
  items: AdminUser[]
  isLoading: boolean
  error: string | null
  /** Open one account in the drawer. */
  view: (userId: string) => void
}

/** `<AdminUsers>`' slots, one per region; each receives {@link AdminUsersSlotContext}. */
export interface AdminUsersSlots {
  /** Above the search: replaces the heading. */
  header: (context: AdminUsersSlotContext) => unknown
  /** While the first page loads. */
  loading: (context: AdminUsersSlotContext) => unknown
  /** When no account matches. */
  empty: (context: AdminUsersSlotContext) => unknown
  /** One account's row, inside its `<tr>`: the cells. */
  user: (context: AdminUsersSlotContext & { user: AdminUser }) => unknown
  /** The newer and older buttons. */
  pager: (context: AdminUsersSlotContext) => unknown
  /** Why the accounts could not be read. */
  error: (context: AdminUsersSlotContext) => unknown
  /** Below everything. */
  footer: (context: AdminUsersSlotContext) => unknown
}

export interface AdminWorkspacesSlotContext {
  admin: UseAdminReturn
  /** The page of workspaces in view (empty while loading or when none match). */
  items: AdminWorkspace[]
  isLoading: boolean
  error: string | null
  /** Open one workspace in the drawer. */
  view: (workspaceId: string) => void
}

/** `<AdminWorkspaces>`' slots, one per region; each receives {@link AdminWorkspacesSlotContext}. */
export interface AdminWorkspacesSlots {
  /** Above the search: replaces the heading. */
  header: (context: AdminWorkspacesSlotContext) => unknown
  /** While the first page loads. */
  loading: (context: AdminWorkspacesSlotContext) => unknown
  /** When no workspace matches. */
  empty: (context: AdminWorkspacesSlotContext) => unknown
  /** One workspace's row, inside its `<tr>`: the cells. */
  workspace: (context: AdminWorkspacesSlotContext & { workspace: AdminWorkspace }) => unknown
  /** The newer and older buttons. */
  pager: (context: AdminWorkspacesSlotContext) => unknown
  /** Why the workspaces could not be read. */
  error: (context: AdminWorkspacesSlotContext) => unknown
  /** Below everything. */
  footer: (context: AdminWorkspacesSlotContext) => unknown
}

/** What an admin list hands its packaged parts: the search, the pager, the drawer's state. */
export interface AdminListView<Context, Slots> {
  labels: UseLabelsReturn<'admin'>
  context: ComputedRef<Context>
  /** The list's slots a packaged part renders through when the app fills them. */
  slots: Partial<Slots>
  /** A unique prefix for ids. */
  id: string
  /** What the search field holds, and what to do as it changes. */
  query: Ref<string>
  typed: (value: string) => void
  /** Search for what the field holds now. */
  submit: () => void
  pages: PageTurns
  /** The drawer: the native dialog, the action running in it, its message, and how to close it. */
  dialog: Ref<HTMLDialogElement | null>
  running: Ref<string | null>
  message: ComputedRef<SettingsMessage | null>
  close: () => Promise<void>
  /** A date in the reader's words. */
  date: (value: number) => string
}

/** What `<AdminUsers>` hands its packaged parts. */
export interface AdminUsersView extends AdminListView<AdminUsersSlotContext, AdminUsersSlots> {
  /** The roles the drawer offers, an account's own included. */
  roles: () => string[]
  /** The role chosen in the drawer, the ban's reason and length. */
  role: Ref<string>
  banReason: Ref<string>
  banFor: Ref<'day' | 'week' | 'month' | 'forever'>
  saveRole: (user: AdminUser) => Promise<boolean>
  ban: (user: AdminUser) => Promise<void>
  unban: (user: AdminUser) => Promise<boolean>
  /** Let a passkey-only account sign in with email codes again, once confirmed, behind a recent sign-in. */
  allowSignInCodes: (user: AdminUser) => Promise<void>
  revokeSessions: (user: AdminUser) => Promise<boolean>
  impersonate: (user: AdminUser) => Promise<void>
  /** An app-wide role, in words. */
  roleWord: (role: string) => string
  /** An account's status, in words: active, banned, banned until. */
  status: (user: AdminUser) => string
  /** Whether this account is the caller's own. */
  own: (user: Pick<AdminUser, 'id'>) => boolean
}

/** What `<AdminWorkspaces>` hands its packaged parts. */
export interface AdminWorkspacesView extends AdminListView<AdminWorkspacesSlotContext, AdminWorkspacesSlots> {
  impersonate: (userId: string, workspaceId: string) => Promise<void>
}

const ADMIN_USERS_VIEW: InjectionKey<AdminUsersView> = Symbol('nuxt-backend:admin-users')
const ADMIN_WORKSPACES_VIEW: InjectionKey<AdminWorkspacesView> = Symbol('nuxt-backend:admin-workspaces')

/** @internal */
export function provideAdminUsersView(view: AdminUsersView): AdminUsersView {
  provide(ADMIN_USERS_VIEW, view)
  return view
}

/** @internal */
export function useAdminUsersView(part: string): AdminUsersView {
  const view = inject(ADMIN_USERS_VIEW, null)
  if (!view) throw new Error(`[nuxt-backend] <${part}> renders inside <AdminUsers>. To build one of your own, use useAdmin().`)
  return view
}

/** @internal */
export function provideAdminWorkspacesView(view: AdminWorkspacesView): AdminWorkspacesView {
  provide(ADMIN_WORKSPACES_VIEW, view)
  return view
}

/** @internal */
export function useAdminWorkspacesView(part: string): AdminWorkspacesView {
  const view = inject(ADMIN_WORKSPACES_VIEW, null)
  if (!view) throw new Error(`[nuxt-backend] <${part}> renders inside <AdminWorkspaces>. To build one of your own, use useAdmin({ list: 'workspaces' }).`)
  return view
}

/** The label key of a sign-in method: `email-otp` is `emailOtp`. */
export const methodKey = (method: string): string => method.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase())

/**
 * How long a ban lasts, by the drawer's choice, in seconds; `forever` sends
 * no length, so the ban lasts until lifted, or as long as the app's
 * `admin.defaultBanExpiresIn` says when it sets one.
 */
export const BAN_DURATIONS = { day: 86_400, week: 604_800, month: 2_592_000, forever: 0 } as const

/** What {@link useAdminList} needs from its component. */
export interface AdminListOptions {
  labels: UseLabelsReturn<'admin'>
  /** Tell the component's \`error\` listener why an action failed. */
  onError: (message: string) => void
}

/**
 * The state both admin lists share: the search, debounced as the person
 * types, the row open in the drawer, and the drawer's actions, one at a
 * time, each saying how it went in the drawer's message and keeping focus
 * in the drawer.
 *
 * @internal
 */
export function useAdminList(options: AdminListOptions) {
  const query = ref('')
  const search = ref('')
  const apply = useDebounceFn((value: string) => {
    search.value = value
  }, 300)
  const selected = ref<string | null>(null)
  const dialog = ref<HTMLDialogElement | null>(null)
  let opener: HTMLElement | null = null
  const { note, message } = useSettingsMessage()
  const running = ref<string | null>(null)

  /** Open one row in the drawer, remembering the control that opened it. */
  function open(id: string): void {
    const active = typeof document === 'undefined' ? null : document.activeElement
    opener = active instanceof HTMLElement && active !== document.body ? active : null
    note.value = null
    selected.value = id
  }
  /** Close the drawer and give focus back to the control that opened it. */
  async function close(): Promise<void> {
    if (!selected.value) return
    dialog.value?.close?.()
    selected.value = null
    const back = opener
    opener = null
    await nextTick()
    if (back?.isConnected) returnFocus(back)
  }
  // Open the native dialog once its markup is there, on its close button:
  // a row opened from a link (`?user=`) shows once its account is read.
  watch([selected, dialog], async ([now]) => {
    if (!now) return
    await nextTick()
    const element = dialog.value
    if (!element || element.open) return
    if (typeof element.showModal === 'function') element.showModal()
    else element.setAttribute('open', '')
    element.querySelector<HTMLElement>('[data-admin="close"]')?.focus()
  })

  /** Run one drawer action: one at a time, its outcome in the drawer's message, focus kept in the drawer. */
  async function act(key: string, action: () => Promise<void>, ok?: () => string): Promise<boolean> {
    if (running.value) return false
    const pressed = focusedIn(dialog.value)
    note.value = null
    running.value = key
    try {
      await action()
      if (ok) note.value = { ok: true, text: ok }
      return true
    }
    catch (cause) {
      note.value = { ok: false, text: () => options.labels.errorMessage(cause) }
      options.onError(message.value!.text)
      return false
    }
    finally {
      running.value = null
      await nextTick()
      if (pressed && !pressed.isConnected) returnFocus(dialog.value?.querySelector<HTMLElement>('[data-admin="message"]') ?? dialog.value)
    }
  }

  return {
    query,
    search,
    selected,
    dialog,
    running,
    message,
    open,
    close,
    act,
    typed: (value: string) => void apply(value),
    submit: () => {
      search.value = query.value
    },
  }
}
