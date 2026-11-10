import { useIntervalFn, useNow } from '@vueuse/core'
import { computed, inject, ref, type ComputedRef, type Ref } from 'vue'
import { ConvexAuthStateKey, useAction } from 'nuxt-convex-module/client'
import { useActionState } from '../utils/action-state'
import type { BackendError } from '../utils/backend-error'
import { absentQuery, useLiveQuery } from '../utils/live-query'
import { useBackendNamespace } from '../utils/namespace'
import { notConfigured } from './billing-provider'
import type { BillingApi, WithdrawalPeriod } from './use-billing'

/** Options for {@link useWithdrawal}. */
export interface UseWithdrawalOptions {
  /** Override the injected `api.billing` namespace. */
  api?: BillingApi
}

/** What {@link useWithdrawal} returns. */
export interface UseWithdrawalReturn {
  /**
   * The purchase inside its withdrawal period, for a billing manager:
   * `null` without one (none open, signed out, a member who manages no
   * billing, or `setupBilling({ lifecycle: { withdrawal } })` off),
   * `undefined` while it loads. It closes by itself when the period ends.
   */
  period: ComputedRef<WithdrawalPeriod | null | undefined>
  /** `true` while a period is open: what shows a withdrawal section of your own. */
  isOpen: ComputedRef<boolean>
  /** When the period ends, `null` without one. */
  endsAt: ComputedRef<Date | null>
  /** `true` until the period is known (`false` when signed out, and once the read failed). */
  isLoading: ComputedRef<boolean>
  /** `true` while the withdrawal is on its way. */
  isPending: ComputedRef<boolean>
  /** Why the withdrawal failed, else why the period could not be read, else `null`. */
  error: ComputedRef<BackendError | null>
  /** When the withdrawal was received (epoch ms), once `withdraw` went through; `null` before. */
  withdrawnAt: Ref<number | null>
  /**
   * Withdraw from the purchase in the open period: the server ends the plan
   * at once and emails the receipt with the date and time; the refund is an
   * administrator's. Resolves with when it was received (epoch ms), rejects
   * on failure, which `error` also holds.
   */
  withdraw: () => Promise<number>
}

/**
 * The EU withdrawal window: whether the signed-in billing manager's
 * purchase is still inside the 14 days of the Consumer Rights Directive's
 * Art. 9, until when, and the withdrawal itself, the withdrawal function of
 * its Art. 11a — what `<WithdrawalButton>` is built on, for a section of
 * your own around it. Reads `getWithdrawal`, live, and runs `withdraw`;
 * the read never throws and the action rejects.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const withdrawal = useWithdrawal()
 * // The app's language, not the visitor's, so the server's HTML and the browser's agree.
 * const { locale } = useLabels('withdrawal')
 * const day = (date: Date) => new Intl.DateTimeFormat(locale.value ?? 'en', { dateStyle: 'long' }).format(date)
 * </script>
 * <template>
 *   <section v-if="withdrawal.isOpen.value">
 *     <h2>Changed your mind?</h2>
 *     <p>You can withdraw until {{ withdrawal.endsAt.value && day(withdrawal.endsAt.value) }}.</p>
 *     <WithdrawalButton />
 *   </section>
 * </template>
 * ```
 */
export function useWithdrawal(options: UseWithdrawalOptions = {}): UseWithdrawalReturn {
  const billing = useBackendNamespace<BillingApi>('billing', 'useWithdrawal', options.api)
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth != null && !auth.isAuthenticated.value)
  const read = billing.getWithdrawal
    ? useLiveQuery(billing.getWithdrawal, () => (signedOut.value ? 'skip' as const : {}))
    : absentQuery<{ period: WithdrawalPeriod | null } | null>()
  const runWithdraw = billing.withdraw ? useAction(billing.withdraw) : null
  const { isPending, failure, run } = useActionState(() => signedOut.value)
  const withdrawnAt = ref<number | null>(null)
  // The read can't watch the clock, so this does: a period is open until its end.
  const now = useNow({ scheduler: tick => useIntervalFn(tick, 60_000) })
  const period = computed<WithdrawalPeriod | null | undefined>(() => {
    if (signedOut.value || !billing.getWithdrawal || read.error.value) return null
    if (read.data.value === undefined) return undefined
    const found = read.data.value?.period ?? null
    return found && found.endsAt > now.value.getTime() ? found : null
  })

  return {
    period,
    isOpen: computed(() => period.value != null),
    endsAt: computed(() => (period.value ? new Date(period.value.endsAt) : null)),
    isLoading: computed(() => !signedOut.value && Boolean(billing.getWithdrawal) && read.isLoading.value),
    isPending,
    error: computed(() => failure.value ?? read.error.value),
    withdrawnAt,
    withdraw: () => run(async () => {
      if (!runWithdraw) notConfigured('withdraw')
      const { withdrawnAt: at } = await runWithdraw({ subscriptionId: period.value?.subscriptionId })
      withdrawnAt.value = at
      return at
    }),
  }
}
