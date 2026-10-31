import { useIntervalFn, useNow } from '@vueuse/core'
import { computed, type ComputedRef, inject, ref, type Ref, useId } from 'vue'
import { ConvexAuthStateKey, useAction } from 'nuxt-convex-module/client'
import { busyAttributes } from '../../a11y'
import { type BillingApi, useBilling, type WithdrawalPeriod } from '../../composables/use-billing'
import { refusalText, useLabels, type BackendLabels, type LabelOverrides, type UseLabelsReturn } from '../../composables/use-labels'
import { notConfigured } from '../../composables/billing-provider'
import { useLiveQuery } from '../../utils/live-query'
import { useBackendNamespace } from '../../utils/namespace'

/** `useWithdrawalButton()`: the EU withdrawal button's state, its actions and what its controls carry. */
export interface UseWithdrawalButtonReturn {
  /** The purchase inside its withdrawal period, for a billing manager; `null` without one, `undefined` while it loads. */
  period: ComputedRef<WithdrawalPeriod | null | undefined>
  /** Whether the confirm step is open. */
  confirming: Ref<boolean>
  /** `true` while the withdrawal is on its way. */
  isPending: Ref<boolean>
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
 * The headless EU withdrawal button `<WithdrawalButton>` renders (LIFECYCLE):
 * shown for a purchase inside its 14 days, to a billing manager, while
 * `setupBilling({ lifecycle: { withdrawal: true } })` is on. A confirm step,
 * then the server ends the plan and emails the receipt.
 */
export function useWithdrawalButton(options: { labels?: () => LabelOverrides<BackendLabels['withdrawal']> | undefined, onWithdrawn?: (at: number) => void, onError?: (message: string) => void } = {}): UseWithdrawalButtonReturn {
  const billing = useBackendNamespace<BillingApi>('billing', 'WithdrawalButton')
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth != null && !auth.isAuthenticated.value)
  const read = billing.getWithdrawal ? useLiveQuery(billing.getWithdrawal, () => (signedOut.value ? 'skip' as const : {})) : null
  const runWithdraw = billing.withdraw ? useAction(billing.withdraw) : null
  const { products } = useBilling()
  const labels = useLabels('withdrawal', () => options.labels?.())
  const { t, locale } = labels
  const base = useId()
  const confirming = ref(false)
  const isPending = ref(false)
  const withdrawnAt = ref<number | null>(null)
  const error = ref<string | null>(null)
  // The read can't watch the clock, so the button does: a period is open until its end.
  const now = useNow({ scheduler: tick => useIntervalFn(tick, 60_000) })
  const period = computed(() => {
    if (signedOut.value || read?.error.value || !read) return null
    if (read.data.value === undefined) return undefined
    const found = read.data.value?.period ?? null
    return found && found.endsAt > now.value.getTime() ? found : null
  })

  const format = (value: number | undefined, time = false) => value === undefined ? '' : new Intl.DateTimeFormat(locale.value, time ? { dateStyle: 'long', timeStyle: 'short' } : { dateStyle: 'long' }).format(value)

  return {
    period,
    confirming,
    isPending,
    withdrawnAt,
    error,
    text: computed(() => ({
      plan: (period.value?.plan ? products.value?.[period.value.plan]?.name : undefined) ?? period.value?.plan ?? '',
      until: format(period.value?.endsAt),
      at: withdrawnAt.value === null ? '' : format(withdrawnAt.value, true),
    })),
    open: () => {
      error.value = null
      confirming.value = true
    },
    back: () => {
      if (!isPending.value) confirming.value = false
    },
    confirm: async () => {
      if (isPending.value) return
      isPending.value = true
      error.value = null
      try {
        if (!runWithdraw) notConfigured('withdraw')
        const { withdrawnAt: at } = await runWithdraw({ subscriptionId: period.value?.subscriptionId })
        withdrawnAt.value = at
        confirming.value = false
        options.onWithdrawn?.(at)
      }
      catch (failure) {
        error.value = refusalText(labels, failure, t('failed'))
        options.onError?.(error.value)
      }
      finally {
        isPending.value = false
      }
    },
    labels,
    id: part => `${base}-${part}`,
    busy: () => busyAttributes(isPending.value),
  }
}
