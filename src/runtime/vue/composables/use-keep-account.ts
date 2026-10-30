import { computed, type ComputedRef, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { useMutation } from 'nuxt-convex-module/client'
import { useActionState } from '../utils/action-state'
import { useApiNamespace } from '../utils/namespace'
import type { AccountApi } from './use-account'
import { type LabelGroupOverrides, useLabels } from './use-labels'

/** Where the "keep my account" page stands. */
export type KeepAccountState = 'ready' | 'pending' | 'kept' | 'nothing' | 'error' | 'no-token'

/** What the page's markup binds to. */
export interface UseKeepAccountReturn {
  state: ComputedRef<KeepAccountState>
  /** Why keeping failed, in words, or `null`. */
  error: ComputedRef<string | null>
  /** The outcome in words, for a polite status; `''` before the person acted. */
  announcement: ComputedRef<string>
  /** Cancel the deletion the link's token names. */
  keep: () => Promise<void>
  labels: ReturnType<typeof useLabels<'deletion'>>
  bind: {
    keep: ComputedRef<Record<string, unknown>>
    status: ComputedRef<Record<string, unknown>>
    error: ComputedRef<Record<string, unknown>>
  }
}

/**
 * The "keep my account" page without its markup: the emailed link's token
 * cancels the account's scheduled deletion, with no sign-in. The person
 * presses the button; opening the link changes nothing, so a mail scanner
 * that follows it cannot cancel anyone's deletion. State, action and
 * bindings; `<KeepAccount>` is this with the package's markup.
 *
 * @internal
 */
export function useKeepAccount(token: MaybeRefOrGetter<string | undefined>, overrides?: MaybeRefOrGetter<LabelGroupOverrides<'deletion'> | undefined>): UseKeepAccountReturn {
  const api = useApiNamespace<AccountApi>('account')
  const labels = useLabels('deletion', () => toValue(overrides))
  const runKeep = api?.cancelAccountDeletion ? useMutation(api.cancelAccountDeletion) : null
  const { isPending, failure, run } = useActionState()
  const outcome = ref<'kept' | 'nothing' | null>(null)

  const state = computed<KeepAccountState>(() => {
    if (!toValue(token)) return 'no-token'
    if (isPending.value) return 'pending'
    if (outcome.value) return outcome.value
    return failure.value ? 'error' : 'ready'
  })
  const error = computed(() => (failure.value ? labels.errorMessage(failure.value) : null))
  const announcement = computed(() => {
    if (state.value === 'pending') return labels.t('keeping')
    if (state.value === 'kept') return labels.t('done')
    if (state.value === 'nothing') return labels.t('nothing')
    return ''
  })

  async function keep(): Promise<void> {
    const value = toValue(token)
    if (!value || !runKeep || isPending.value || outcome.value === 'kept') return
    outcome.value = null
    const canceled = await run(() => runKeep({ token: value }), { silent: true }).catch(() => null)
    if (canceled !== null) outcome.value = canceled ? 'kept' : 'nothing'
  }

  const bind: UseKeepAccountReturn['bind'] = {
    keep: computed(() => ({ 'type': 'button', 'data-deletion': 'keep', 'aria-disabled': state.value === 'pending' || state.value === 'kept' || undefined, 'onClick': keep })),
    status: computed(() => ({ 'role': 'status', 'aria-live': 'polite', 'data-deletion': 'status' })),
    error: computed(() => ({ 'role': 'alert', 'data-deletion': 'error' })),
  }

  return { state, error, announcement, keep, labels, bind }
}
