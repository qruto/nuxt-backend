import { computed, useId, type ComputedRef } from 'vue'
import { useLabels } from './use-labels'
import type { LabelGroupOverrides } from './use-labels'
import type { UseWaitlistReturn } from './use-waitlist'

/**
 * What a step of the waitlist form shares: its words, the id its error is
 * described by, the error in the reader's language and the busy state of its
 * button.
 *
 * @internal
 */
export function useWaitlistStep(waitlist: UseWaitlistReturn, labels: () => LabelGroupOverrides<'waitlist'> | undefined): {
  t: ReturnType<typeof useLabels<'waitlist'>>['t']
  id: string
  errorText: ComputedRef<string | null>
  busy: ComputedRef<'true' | undefined>
} {
  const { t, errorMessage } = useLabels('waitlist', labels)
  return {
    t,
    id: useId(),
    errorText: computed(() => (waitlist.error.value ? errorMessage(waitlist.error.value) : null)),
    busy: computed(() => (waitlist.isPending.value ? 'true' as const : undefined)),
  }
}
