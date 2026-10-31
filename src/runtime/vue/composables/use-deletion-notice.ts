import { computed, type ComputedRef, inject, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { ConvexAuthStateKey, useMutation } from 'nuxt-convex-module/client'
import type { AccountDeletion } from '../../../convex/integrations/account'
import { useActionState } from '../utils/action-state'
import { absentQuery, useLiveQuery } from '../utils/live-query'
import { useApiNamespace } from '../utils/namespace'
import type { AccountApi } from './use-account'
import { formatBillingDate } from './billing-format'
import { type LabelGroupOverrides, useLabels } from './use-labels'

/** What the `deletion` slot of `<BackendNotices>` receives. */
export interface DeletionNoticeSlotContext {
  /** The scheduled deletion: when it was asked for, and when the account is erased (epoch ms). */
  deletion: AccountDeletion
  /** The sentence the notice says, with the date. */
  message: string
  /** Keep the account: cancel the deletion. */
  keep: () => Promise<void>
  /** Whether keeping runs. */
  isPending: boolean
  /** Why keeping failed, in words, or `null`. */
  error: string | null
}

/** What the deletion notice's markup binds to. */
export interface UseDeletionNoticeReturn {
  /** The scheduled deletion, live: `null` for none, when signed out and without `backend/account.ts`'s `getAccountDeletion`. */
  deletion: ComputedRef<AccountDeletion | null>
  /** `true` from the moment the account was kept until the page changes: the notice then says so, as a polite status, instead of vanishing. */
  kept: ComputedRef<boolean>
  /** Whether the notice shows: a deletion waits, or the account was just kept. */
  visible: ComputedRef<boolean>
  /** The notice's sentence, with the date the account is deleted on. */
  message: ComputedRef<string>
  /** `true` while the account is being kept. */
  isPending: ComputedRef<boolean>
  /** Why keeping failed, in words, or `null`. */
  error: ComputedRef<string | null>
  /** The outcome of the last keep, for a polite status: `''` until it ran. */
  announcement: ComputedRef<string>
  /** Keep the account: cancel the deletion. */
  keep: () => Promise<void>
  /** The labels of the `deletion` group. */
  labels: ReturnType<typeof useLabels<'deletion'>>
  /** The attributes of each element, to spread with `v-bind`. */
  bind: {
    root: ComputedRef<Record<string, unknown>>
    message: ComputedRef<Record<string, unknown>>
    keep: ComputedRef<Record<string, unknown>>
    error: ComputedRef<Record<string, unknown>>
    status: ComputedRef<Record<string, unknown>>
  }
}

/**
 * The deletion notice without its markup: whether the account's deletion
 * waits out its grace period, the sentence with its date, and the action
 * that keeps the account. State, actions and bindings; the notice of
 * `<BackendNotices>` is this with the package's markup. Silent and `null`
 * without `getAccountDeletion` re-exported from `backend/account.ts`, so
 * every page's frame may ask.
 *
 * @internal
 */
export function useDeletionNotice(overrides?: MaybeRefOrGetter<LabelGroupOverrides<'deletion'> | undefined>): UseDeletionNoticeReturn {
  const api = useApiNamespace<AccountApi>('account')
  const labels = useLabels('deletion', () => toValue(overrides))
  const state = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => state == null || !state.isAuthenticated.value)
  const read = api?.getAccountDeletion
    ? useLiveQuery(api.getAccountDeletion, () => (signedOut.value ? 'skip' : {}))
    : absentQuery<AccountDeletion | null>()
  const runKeep = api?.cancelAccountDeletion ? useMutation(api.cancelAccountDeletion) : null
  const { isPending, failure, run } = useActionState(() => signedOut.value)
  const kept = ref(false)

  const deletion = computed(() => (signedOut.value ? null : read.data.value ?? null))
  // A deletion scheduled again later is a new notice.
  watch(deletion, (now) => {
    if (now) kept.value = false
  })
  const visible = computed(() => deletion.value !== null || kept.value)
  const message = computed(() => labels.t('message', { date: deletion.value ? formatBillingDate(deletion.value.deletesAt, { dateStyle: 'long' }, labels.locale.value) : '' }))
  const error = computed(() => (failure.value ? labels.errorMessage(failure.value) : null))
  const announcement = computed(() => (isPending.value ? labels.t('keeping') : kept.value ? labels.t('kept') : ''))

  async function keep(): Promise<void> {
    if (!runKeep || isPending.value) return
    // Silent: the notice shows its own failure.
    const canceled = await run(() => runKeep({}), { silent: true }).catch(() => false)
    if (canceled) kept.value = true
  }

  const bind: UseDeletionNoticeReturn['bind'] = {
    root: computed(() => ({ 'data-deletion': 'notice', 'data-state': kept.value ? 'kept' : isPending.value ? 'pending' : 'scheduled', 'aria-label': labels.t('label') })),
    message: computed(() => ({ 'data-deletion': 'message' })),
    keep: computed(() => ({ 'type': 'button', 'data-deletion': 'keep', 'aria-disabled': isPending.value || undefined, 'onClick': keep })),
    error: computed(() => ({ 'role': 'alert', 'data-deletion': 'error' })),
    status: computed(() => ({ 'role': 'status', 'aria-live': 'polite', 'data-deletion': 'status' })),
  }

  return { deletion, kept: computed(() => kept.value), visible, message, isPending, error, announcement, keep, labels, bind }
}
