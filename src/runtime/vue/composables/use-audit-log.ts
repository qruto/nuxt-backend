import type { FunctionReference } from 'convex/server'
import { computed, inject, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { ConvexAuthStateKey } from 'nuxt-convex-module/client'
import type { AuditEntry, AuditPage } from '../../../convex/integrations/audit'
import type { BackendError } from '../utils/backend-error'
import { useCursorPages } from '../utils/cursor-pages'
import { absentQuery, type LiveQuery, useLiveQuery } from '../utils/live-query'
import { useBackendNamespace } from '../utils/namespace'
import { useReaderKey } from '../utils/reader'

export type { AuditEntry, AuditParty } from '../../../convex/integrations/audit'

/**
 * Whose activity to read:
 * - `mine`: what happened to the signed-in account, and in it;
 * - `workspace`: everything in the active workspace, for its owners and admins;
 * - `all`: every event, for the app's administrators.
 */
export type AuditScope = 'mine' | 'workspace' | 'all'

/** A page request, as the reads take it: how many events, and the cursor the page before ended at. */
export type AuditPageArgs = {
  paginationOpts: { numItems: number, cursor: string | null }
}

/** The reads re-exported from your `backend/audit.ts`. */
export interface AuditLogApi {
  listActivity?: FunctionReference<'query', 'public', AuditPageArgs, AuditPage | null>
  listWorkspaceActivity?: FunctionReference<'query', 'public', AuditPageArgs, AuditPage | null>
  listAllActivity?: FunctionReference<'query', 'public', AuditPageArgs, AuditPage | null>
}

export interface UseAuditLogOptions {
  /**
   * Whose activity (reactive). Default `'mine'`. Changing it, or who
   * reads it (another account signed in, another workspace made active),
   * goes back to the first page.
   */
  scope?: MaybeRefOrGetter<AuditScope | undefined>
  /** Events per page (reactive), at most 100. Default 20. Changing it goes back to the first page. */
  limit?: MaybeRefOrGetter<number | undefined>
  /** Override the injected `api.audit` namespace. */
  api?: AuditLogApi
}

export interface UseAuditLogReturn {
  /**
   * The page in view, newest first, live: an event recorded while the first
   * page is in view appears at its top. `[]` when signed out, when the
   * caller may not read this scope, and when nothing was recorded;
   * `undefined` while the session or the page is still being read.
   */
  events: ComputedRef<AuditEntry[] | undefined>
  /** The page in view, from 1. */
  page: ComputedRef<number>
  /** Whether an older page exists. */
  hasMore: ComputedRef<boolean>
  /** Whether a newer page exists. */
  hasPrevious: ComputedRef<boolean>
  /** `true` while the page in view is being read. */
  isLoading: ComputedRef<boolean>
  /** `true` once the read answered that this caller may not read the scope: a member who manages nothing, or someone who is no administrator. */
  isRefused: ComputedRef<boolean>
  /** Why the page could not be read, else `null`. Reads never reject. */
  error: ComputedRef<BackendError | null>
  /** Show the next, older page once it is read (no-op on the last). */
  next: () => Promise<void>
  /** Show the previous, newer page once it is read (no-op on the first). */
  previous: () => Promise<void>
  /** Back to the first page, the newest events. */
  reset: () => void
}

/** The default page size, and the most the server returns. */
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

const QUERIES = { mine: 'listActivity', workspace: 'listWorkspaceActivity', all: 'listAllActivity' } as const satisfies Record<AuditScope, keyof AuditLogApi>

/**
 * The activity trail, a page at a time: the signed-in account's own (sign-ins,
 * passkeys, email and session changes, workspaces joined, an administrator's
 * actions on it), the active workspace's for its owners and admins, or every
 * event for administrators. Each page is a live query over
 * `backend/audit.ts`; older pages are read by a cursor, so they hold still
 * while new events arrive at the top of the first.
 *
 * Entries carry names, never addresses: who acted (`you`, another account,
 * an unnamed `administrator` in an account's own activity, the `app`, or an
 * `erased` account), the account it is about and the workspace.
 * Reads never throw: a failed read shows in `error`, and a scope the caller
 * may not read is empty, with `isRefused` set.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const activity = useAuditLog({ scope: 'workspace', limit: 10 })
 * </script>
 * <template>
 *   <p v-for="event in activity.events.value" :key="event.id">{{ event.type }}</p>
 *   <button :disabled="!activity.hasMore.value" @click="activity.next()">Older</button>
 * </template>
 * ```
 */
export function useAuditLog(options: UseAuditLogOptions = {}): UseAuditLogReturn {
  const api = useBackendNamespace<AuditLogApi>('audit', 'useAuditLog', options.api)
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth == null || !auth.isAuthenticated.value)
  const authLoading = computed(() => auth != null && auth.isLoading.value)
  const scope = computed<AuditScope>(() => toValue(options.scope) ?? 'mine')
  const limit = computed(() => Math.max(1, Math.min(Math.floor(toValue(options.limit) ?? DEFAULT_LIMIT), MAX_LIMIT)))

  // Who reads: the account and its active workspace. A cursor is a place in
  // one reader's view, so another reader starts again from the first page.
  const reader = useReaderKey()

  // A cursor is a place in one listing: the scope, the page size and the reader.
  const pages = useCursorPages(() => JSON.stringify([scope.value, limit.value, reader.value]), () => data.value, () => isLoading.value)

  const args = (which: AuditScope) => () => signedOut.value || scope.value !== which
    ? 'skip' as const
    : { paginationOpts: { numItems: limit.value, cursor: pages.cursor.value } }
  const reads = Object.fromEntries((Object.keys(QUERIES) as AuditScope[]).map((which) => {
    const query = api[QUERIES[which]]
    return [which, query ? useLiveQuery(query, args(which)) : absentQuery<AuditPage | null>()]
  })) as Record<AuditScope, LiveQuery<AuditPage | null>>
  const read = computed(() => reads[scope.value])

  const isLoading = computed(() => authLoading.value || (!signedOut.value && Boolean(api[QUERIES[scope.value]]) && read.value.isLoading.value))

  const data = computed(() => read.value.data.value)

  return {
    events: computed(() => {
      if (authLoading.value) return undefined
      if (signedOut.value || !api[QUERIES[scope.value]]) return []
      // `null`: a scope this caller may not read.
      if (data.value === null) return []
      return data.value?.page
    }),
    page: pages.page,
    hasMore: pages.hasMore,
    hasPrevious: pages.hasPrevious,
    isLoading,
    isRefused: computed(() => !signedOut.value && data.value === null),
    error: computed(() => (signedOut.value ? null : read.value.error.value)),
    next: pages.next,
    previous: pages.previous,
    reset: pages.reset,
  }
}
