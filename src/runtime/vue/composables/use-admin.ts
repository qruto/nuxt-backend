import type { FunctionReference } from 'convex/server'
import { computed, inject, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { ConvexAuthStateKey } from 'nuxt-convex-module/client'
import type { AdminUser, AdminUserDetail, AdminUserPage, AdminWorkspace, AdminWorkspaceDetail, AdminWorkspacePage } from '../../../convex/integrations/admin'
import { useActionState } from '../utils/action-state'
import { unwrapAuth } from '../utils/auth-result'
import { type BackendError, failureOf } from '../utils/backend-error'
import { useCursorPages } from '../utils/cursor-pages'
import { absentQuery, type LiveQuery, useLiveQuery } from '../utils/live-query'
import { useBackendNamespace } from '../utils/namespace'
import { useAuthSession } from '../utils/auth-session'

export type { AdminSession, AdminUser, AdminUserDetail, AdminWorkspace, AdminWorkspaceDetail, AdminWorkspaceMember } from '../../../convex/integrations/admin'

/** Which list `useAdmin` pages through: every account, or every workspace. */
export type AdminList = 'users' | 'workspaces'

/** A page request, as the list reads take it: the search, how many rows, and the cursor the page before ended at. */
export type AdminPageArgs = { search?: string, paginationOpts: { numItems: number, cursor: string | null } }

/** The reads re-exported from your `backend/admin.ts`. */
export interface AdminApiRefs {
  listUsers?: FunctionReference<'query', 'public', AdminPageArgs, AdminUserPage | null>
  getUser?: FunctionReference<'query', 'public', { userId: string }, AdminUserDetail | null>
  listWorkspaces?: FunctionReference<'query', 'public', AdminPageArgs, AdminWorkspacePage | null>
  getWorkspace?: FunctionReference<'query', 'public', { workspaceId: string }, AdminWorkspaceDetail | null>
}

/** How long a ban lasts, and why. */
export interface AdminBanOptions {
  /** Why, as the administrator words it. Kept on the account, never on the activity trail. */
  reason?: string
  /** Seconds until the ban lifts by itself. Left out, it lasts until lifted. */
  expiresIn?: number
}

export interface UseAdminOptions {
  /** Which list (reactive): `users`, the default, or `workspaces`. Changing it goes back to the first page. */
  list?: MaybeRefOrGetter<AdminList | undefined>
  /**
   * Keep the rows that match (reactive): accounts whose address contains it,
   * in lower case; workspaces whose name contains it, as typed. Changing it
   * goes back to the first page.
   */
  search?: MaybeRefOrGetter<string | undefined>
  /** Rows per page (reactive), at most 100. Default 20. Changing it goes back to the first page. */
  limit?: MaybeRefOrGetter<number | undefined>
  /** The account `user` reads in full (reactive); nothing while `null`. */
  userId?: MaybeRefOrGetter<string | null | undefined>
  /** The workspace `workspace` reads in full (reactive); nothing while `null`. */
  workspaceId?: MaybeRefOrGetter<string | null | undefined>
  /** Override the injected `api.admin` namespace. */
  api?: AdminApiRefs
}

export interface UseAdminReturn {
  /** The page of accounts in view, newest first, live; `[]` for a caller who is no administrator, `undefined` while it is read or while the list is `workspaces`. */
  users: ComputedRef<AdminUser[] | undefined>
  /** The page of workspaces in view, newest first, live; `[]` for a caller who is no administrator, `undefined` while it is read or while the list is `users`. */
  workspaces: ComputedRef<AdminWorkspace[] | undefined>
  /** The page in view, from 1. */
  page: ComputedRef<number>
  /** Whether a later page exists. */
  hasMore: ComputedRef<boolean>
  /** Whether an earlier page exists. */
  hasPrevious: ComputedRef<boolean>
  /** The account `userId` names, with its workspaces and sessions, live; `null` when there is none (or the caller may not read it), `undefined` while it is read. */
  user: ComputedRef<AdminUserDetail | null | undefined>
  /** The workspace `workspaceId` names, with its members and open invitations, live; `null` when there is none, `undefined` while it is read. */
  workspace: ComputedRef<AdminWorkspaceDetail | null | undefined>
  /** `true` while the page in view, or a detail asked for, is being read. */
  isLoading: ComputedRef<boolean>
  /** `true` once the list answered that this caller is no administrator. */
  isRefused: ComputedRef<boolean>
  /** `true` while an action runs. */
  isPending: ComputedRef<boolean>
  /** Why the last action failed, else why a read failed, else `null`. Reads never reject. */
  error: ComputedRef<BackendError | null>
  /** Show the next page once it is read (no-op on the last). */
  next: () => Promise<void>
  /** Show the previous page once it is read (no-op on the first). */
  previous: () => Promise<void>
  /** Back to the first page. */
  reset: () => void
  /** Set an account's app-wide role. Takes a recent sign-in. Rejects on failure. */
  setRole: (userId: string, role: string) => Promise<void>
  /** Ban an account: it cannot sign in, and every session it has is signed out. Takes a recent sign-in. Rejects on failure. */
  ban: (userId: string, options?: AdminBanOptions) => Promise<void>
  /** Lift an account's ban. Takes a recent sign-in. Rejects on failure. */
  unban: (userId: string) => Promise<void>
  /**
   * Turn a passkey-only account's sign-in codes back on, for a person who
   * lost every passkey and the recovery code: check who asks first, out of
   * band. Takes a recent sign-in. Rejects on failure.
   */
  allowSignInCodes: (userId: string) => Promise<void>
  /** Sign every session of an account out. Rejects on failure. */
  revokeSessions: (userId: string) => Promise<void>
  /**
   * Act as an account: the browser's session becomes a visit of theirs,
   * thirty minutes at most, refused anything sensitive, until
   * {@link UseAdminReturn.stopImpersonating}. With `workspaceId`, the visit opens in
   * that workspace, where they are a member. An administrator's account is
   * never visited (`forbidden`, reason `admin_target`). Takes a recent
   * sign-in. Resolves once the session is theirs, even when the workspace
   * could not be made active (why stays in `error`): reload or navigate
   * after it, so every live query reads as them. Rejects only when no visit
   * began.
   */
  impersonate: (userId: string, options?: { workspaceId?: string }) => Promise<void>
  /**
   * End a visit and go back to the administrator's own session: what the
   * `impersonation` notice of `<BackendNotices>` calls, on the visited
   * account's pages. Resolves once the session is the administrator's
   * again; rejects on failure, which `error` keeps. Reload or navigate
   * after it: every live query re-reads as the administrator.
   */
  stopImpersonating: () => Promise<void>
}

/** The default page size, and the most the server returns. */
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

/**
 * The admin console's data and actions: a paged, searchable list of every
 * account or every workspace, one account or workspace in full, and the
 * administrator's actions on an account. The reads are live queries over
 * `backend/admin.ts` (`setupAdmin`), each answering only an administrator
 * whose role is read fresh; the actions are Better Auth's admin routes,
 * which the server holds to the sensitive-action table: setting a role,
 * banning, lifting a ban and impersonating take a recent sign-in
 * (`useReauthentication().withReauthentication` asks for one), and each
 * spends the per-caller `admin` limit.
 *
 * Workspaces are read-only: an administrator acts inside one by
 * impersonating a member. Reads never reject; a caller who is no
 * administrator gets empty lists and `isRefused`.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const search = ref('')
 * const admin = useAdmin({ search })
 * const { withReauthentication } = useReauthentication()
 * const ban = (id: string) => withReauthentication(() => admin.ban(id, { reason: 'Spam' }))
 * </script>
 * <template>
 *   <input v-model="search" type="search">
 *   <p v-for="user in admin.users.value" :key="user.id">
 *     {{ user.email }} <button @click="ban(user.id)">Ban</button>
 *   </p>
 * </template>
 * ```
 */
export function useAdmin(options: UseAdminOptions = {}): UseAdminReturn {
  const api = useBackendNamespace<AdminApiRefs>('admin', 'useAdmin', options.api)
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth == null || !auth.isAuthenticated.value)
  const authLoading = computed(() => auth != null && auth.isLoading.value)
  const { client, session } = useAuthSession()
  const { isPending, failure, run } = useActionState(() => signedOut.value)

  const list = computed<AdminList>(() => toValue(options.list) ?? 'users')
  const search = computed(() => toValue(options.search)?.trim() ?? '')
  const limit = computed(() => Math.max(1, Math.min(Math.floor(toValue(options.limit) ?? DEFAULT_LIMIT), MAX_LIMIT)))
  const reader = computed(() => (session?.value?.data as { user?: { id?: string } } | null | undefined)?.user?.id ?? '')

  // A cursor is a place in one listing: the list, the search, the page size and the reader.
  const pages = useCursorPages(
    () => JSON.stringify([list.value, search.value, limit.value, reader.value]),
    () => data.value,
    () => listLoading.value,
  )

  const pageArgs = (which: AdminList) => () => signedOut.value || list.value !== which
    ? 'skip' as const
    : { ...(search.value ? { search: search.value } : {}), paginationOpts: { numItems: limit.value, cursor: pages.cursor.value } }
  const users = api.listUsers ? useLiveQuery(api.listUsers, pageArgs('users')) : absentQuery<AdminUserPage | null>()
  const workspaces = api.listWorkspaces ? useLiveQuery(api.listWorkspaces, pageArgs('workspaces')) : absentQuery<AdminWorkspacePage | null>()
  const read: ComputedRef<LiveQuery<AdminUserPage | AdminWorkspacePage | null>> = computed(() => (list.value === 'users' ? users : workspaces))
  const data = computed(() => read.value.data.value)

  const userId = computed(() => toValue(options.userId) ?? null)
  const workspaceId = computed(() => toValue(options.workspaceId) ?? null)
  const user = api.getUser
    ? useLiveQuery(api.getUser, () => (signedOut.value || !userId.value ? 'skip' as const : { userId: userId.value }))
    : absentQuery<AdminUserDetail | null>()
  const workspace = api.getWorkspace
    ? useLiveQuery(api.getWorkspace, () => (signedOut.value || !workspaceId.value ? 'skip' as const : { workspaceId: workspaceId.value }))
    : absentQuery<AdminWorkspaceDetail | null>()

  const listLoading = computed(() => authLoading.value || (!signedOut.value && read.value.isLoading.value))
  const isLoading = computed(() => listLoading.value || user.isLoading.value || workspace.isLoading.value)

  /** A list's rows: `undefined` while read, `[]` signed out or refused. */
  const rowsOf = <T>(which: AdminList, query: LiveQuery<{ page: T[] } | null>) => computed<T[] | undefined>(() => {
    if (list.value !== which || authLoading.value) return undefined
    if (signedOut.value) return []
    const value = query.data.value
    if (value === null) return []
    return value?.page
  })

  /** A detail: `null` signed out or when nothing is asked for, `undefined` while read. */
  const detailOf = <T>(asked: ComputedRef<string | null>, query: LiveQuery<T | null>) => computed<T | null | undefined>(() => {
    if (signedOut.value || !asked.value) return null
    return query.data.value
  })

  // The client types a role with the admin plugin's defaults; an app names its own.
  type AppRole = Parameters<typeof client.admin.setRole>[0]['role']

  return {
    users: rowsOf<AdminUser>('users', users),
    workspaces: rowsOf<AdminWorkspace>('workspaces', workspaces),
    page: pages.page,
    hasMore: pages.hasMore,
    hasPrevious: pages.hasPrevious,
    user: detailOf(userId, user),
    workspace: detailOf(workspaceId, workspace),
    isLoading,
    isRefused: computed(() => !signedOut.value && data.value === null),
    isPending,
    error: computed(() => failure.value ?? (signedOut.value ? null : read.value.error.value ?? user.error.value ?? workspace.error.value)),
    next: pages.next,
    previous: pages.previous,
    reset: pages.reset,
    setRole: (id, role) => run(async () => {
      unwrapAuth(await client.admin.setRole({ userId: id, role: role as AppRole }))
    }),
    ban: (id, ban = {}) => run(async () => {
      unwrapAuth(await client.admin.banUser({
        userId: id,
        ...(ban.reason?.trim() ? { banReason: ban.reason.trim() } : {}),
        ...(ban.expiresIn && ban.expiresIn > 0 ? { banExpiresIn: ban.expiresIn } : {}),
      }))
    }),
    unban: id => run(async () => {
      unwrapAuth(await client.admin.unbanUser({ userId: id }))
    }),
    allowSignInCodes: id => run(async () => {
      unwrapAuth(await client.$fetch('/admin/disable-passkey-only', { method: 'POST', body: { userId: id } }))
    }),
    revokeSessions: id => run(async () => {
      unwrapAuth(await client.admin.revokeUserSessions({ userId: id }))
    }),
    impersonate: (id, visit = {}) => run(async () => {
      unwrapAuth(await client.admin.impersonateUser({ userId: id }))
      if (!visit.workspaceId) return
      // The visit has begun: the browser's session is the account's now.
      // Opening it where the administrator looked is a step on top, which a
      // visit may take; when it fails, the visit still stands and the call
      // still resolves, so the caller reloads as the account. Why it failed
      // stays in `error`.
      try {
        unwrapAuth(await client.organization.setActive({ organizationId: visit.workspaceId }))
      }
      catch (cause) {
        failure.value = failureOf(cause)
      }
    }),
    stopImpersonating: () => run(async () => {
      unwrapAuth(await client.admin.stopImpersonating())
    }),
  }
}
