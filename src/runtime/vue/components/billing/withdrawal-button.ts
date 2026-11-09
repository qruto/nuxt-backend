import { computed, type ComputedRef, ref, type Ref, useId } from 'vue'
import { busyAttributes } from '../../a11y'
import { useBilling, type WithdrawalPeriod } from '../../composables/use-billing'
import { refusalText, useLabels, type BackendLabels, type LabelOverrides, type UseLabelsReturn } from '../../composables/use-labels'
import { useWithdrawal } from '../../composables/use-withdrawal'

/** `useWithdrawalButton()`: the EU withdrawal button's state, its actions and what its controls carry. */
export interface UseWithdrawalButtonReturn {
  /** The purchase inside its withdrawal period, for a billing manager; `null` without one, `undefined` while it loads. */
  period: ComputedRef<WithdrawalPeriod | null | undefined>
  /** Whether the confirm step is open. */
  confirming: Ref<boolean>
  /** `true` while the withdrawal is on its way. */
  isPending: ComputedRef<boolean>
  /** When the withdrawal was received, epoch ms, once it was. */
  withdrawnAt: Ref<number | null>
  /** Why it failed, in the reader's words, or `null`. */
  error: Ref<string | null>
  /** The plan's name, the period's end and the receipt's time, in the reader's words. */
  text: ComputedRef<{ plan: string, until: string, at: string }>
  /** Open the confirm step: "Withdraw from contract here". */
  open: () => void
  /** Close it again. */
  back: () => void
  /** "Confirm withdrawal". */
  confirm: () => Promise<void>
  labels: UseLabelsReturn<'withdrawal'>
  /** Ids unique to this button, by part. */
  id: (part: string) => string
  /** What the confirm button carries: busy, keeping focus. */
  busy: () => Record<string, string | undefined>
}

/**
 * The headless EU withdrawal button `<WithdrawalButton>` renders, over
 * `useWithdrawal()`:
 * shown for a purchase inside its 14 days, to a billing manager, while
 * `setupBilling({ lifecycle: { withdrawal: true } })` is on. A confirm step,
 * then the server ends the plan and emails the receipt.
 */
export function useWithdrawalButton(options: { labels?: () => LabelOverrides<BackendLabels['withdrawal']> | undefined, onWithdrawn?: (at: number) => void, onError?: (message: string) => void } = {}): UseWithdrawalButtonReturn {
  const withdrawal = useWithdrawal()
  const { products } = useBilling()
  const labels = useLabels('withdrawal', () => options.labels?.())
  const { t, locale } = labels
  const base = useId()
  const confirming = ref(false)
  const error = ref<string | null>(null)
  const period = withdrawal.period

  const format = (value: number | undefined, time = false) => value === undefined ? '' : new Intl.DateTimeFormat(locale.value, time ? { dateStyle: 'long', timeStyle: 'short' } : { dateStyle: 'long' }).format(value)

  return {
    period,
    confirming,
    isPending: withdrawal.isPending,
    withdrawnAt: withdrawal.withdrawnAt,
    error,
    text: computed(() => ({
      plan: (period.value?.plan ? products.value?.[period.value.plan]?.name : undefined) ?? period.value?.plan ?? '',
      until: format(period.value?.endsAt),
      at: withdrawal.withdrawnAt.value === null ? '' : format(withdrawal.withdrawnAt.value, true),
    })),
    open: () => {
      error.value = null
      confirming.value = true
    },
    back: () => {
      if (!withdrawal.isPending.value) confirming.value = false
    },
    confirm: async () => {
      if (withdrawal.isPending.value) return
      error.value = null
      try {
        const at = await withdrawal.withdraw()
        confirming.value = false
        options.onWithdrawn?.(at)
      }
      catch (failure) {
        error.value = refusalText(labels, failure, t('failed'))
        options.onError?.(error.value)
      }
    },
    labels,
    id: part => `${base}-${part}`,
    busy: () => busyAttributes(withdrawal.isPending.value),
  }
}
