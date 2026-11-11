import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { addMonths } from '../../../convex/catalog.js'
import { useActionState } from '../utils/action-state'
import type { BackendError } from '../utils/backend-error'
import { toBillingDate } from './billing-format'
import { useBilling, type CheckoutOptions } from './use-billing'
import type { LabelGroupOverrides } from './use-labels'
import { usePlanChange, type UsePlanChangeReturn } from './use-plan-change'

/**
 * The states a running plan can be in, in the order they are tried: the
 * first that holds is the one shown. A plan pass gifted until its end date,
 * a failed payment, a pause, a cancellation set for the period's end, a
 * plan change scheduled for it, a trial, else active. The Subscriptions
 * page lists them in this order (test/docs pins it).
 */
export const PLAN_STATES = ['gifted', 'past_due', 'paused', 'canceling', 'changing', 'trialing', 'active'] as const

/** The state a running plan is in: the first of {@link PLAN_STATES} that holds. */
export type PlanState = typeof PLAN_STATES[number]

/**
 * The state the billing section shows: `'loading'` until the plan is known,
 * `'error'` when it could not be read (never a plan it might not be),
 * `'free'` on the free plan or none, else the running plan's {@link PlanState}.
 */
export type BillingSectionState = 'loading' | 'error' | 'free' | PlanState

/** The lengths of a pause the section offers, in months from the period's end. */
export const PAUSE_MONTHS = [1, 2, 3] as const

/**
 * One thing a billing manager can do with the plan, as the billing section
 * offers it: keep a gifted plan by checking it out, open the portal (to
 * update the payment method first when one failed), resume a pause, keep a
 * plan set to end, cancel a scheduled change, switch the plan or its
 * billing period, pause it, cancel it.
 */
export type BillingSectionAction = 'keep-gifted' | 'portal' | 'resume' | 'uncancel' | 'cancel-change' | 'change-plan' | 'pause' | 'cancel'

/** Options for {@link useBillingSection}. */
export interface UseBillingSectionOptions {
  /** Copy for the switch's confirmation (`change`), over `appConfig.backend.labels.pricing` and the translations. */
  labels?: MaybeRefOrGetter<LabelGroupOverrides<'pricing'> | undefined>
  /** While this is `false` no pricing is read for a switch, and none is offered (default `true`). */
  enabled?: MaybeRefOrGetter<boolean>
}

/** What {@link useBillingSection} returns. */
export interface UseBillingSectionReturn {
  /** The state the section shows (see {@link BillingSectionState}). */
  state: ComputedRef<BillingSectionState>
  /** `true` until the plan is known, unless its read failed, and while a return from checkout is being finished (`useBilling().isFinishingCheckout`): mark the section busy. */
  isLoading: ComputedRef<boolean>
  /** `true` while a pause or a gifted plan's checkout is on its way. */
  isPending: ComputedRef<boolean>
  /** Why the last action failed, else why the plan could not be read, else `null`. */
  error: ComputedRef<BackendError | null>
  /**
   * What the state calls for, in the order the section offers it: on a
   * failed payment the portal first, then the plan's ways back (resume,
   * keep, cancel the scheduled change), the portal, then a switch, a pause
   * and a cancellation where each is open. A gifted plan's one offer is to
   * keep it. Empty for anyone who does not manage the billing
   * (`useBilling().canManage`), on the free plan, while loading and after a
   * failed read.
   */
  actions: ComputedRef<BillingSectionAction[]>
  /** Whether a switch is offered: a running plan, not gifted, set to end, paused or already changing, with a price to switch to (`change.targets`). */
  switchable: ComputedRef<boolean>
  /**
   * Whether a pause is offered: a running plan, not gifted, set to end,
   * paused, past due or in its trial (the provider pauses only an active
   * subscription), and with no pause scheduled (`resumesAt` is `null`).
   */
  pausable: ComputedRef<boolean>
  /** Whether a cancellation is offered: a running plan, not gifted, set to end already or paused, which the provider would refuse a second one for. */
  cancellable: ComputedRef<boolean>
  /** The lengths a pause is offered for, in months: {@link PAUSE_MONTHS}. */
  pauseLengths: readonly number[]
  /**
   * When a pause of `months` from the period's end resumes: the period's
   * end moved on by whole months in UTC the way the provider counts them,
   * the same day of the month, or its last when the month is shorter (a
   * period ending January 31 paused for a month resumes February 28).
   * `null` while the period's end is not known.
   */
  resumesAfter: (months: number) => Date | null
  /** Pause the plan from the period's end for `months`, resuming by itself on `resumesAfter(months)`. Rejects as `useBilling().pause` does. */
  pause: (months: number) => Promise<void>
  /** Keep a gifted plan: an ordinary checkout of its plan (`options` go with it, `{ redirect: true }` by default), which moves the pass to the paid plan in place. */
  keepGifted: (options?: CheckoutOptions) => Promise<void>
  /** The switch to another plan or billing period, and its confirmation (`usePlanChange`). */
  change: UsePlanChangeReturn
}

/**
 * The billing section of `/settings` without its markup: the state the
 * plan is in, in the order the section tries them (a gifted plan, a failed
 * payment, a pause, a cancellation or a plan change set for the period's
 * end, a trial, else active), a read that failed as a failure rather than
 * a plan, a return from checkout still finishing as busy, and what each
 * state calls for, with the rules each offer follows: a switch only while
 * nothing is scheduled, a pause only while none is, and its resume date
 * counted the way the provider counts months. `<WorkspaceSettings>`'s
 * billing section is this with the package's markup.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const section = useBillingSection()
 * // The app's language, not the visitor's, so the server's HTML and the browser's agree.
 * const { locale } = useLabels('settings')
 * const day = (date: Date | null) => (date ? new Intl.DateTimeFormat(locale.value ?? 'en', { dateStyle: 'medium' }).format(date) : '')
 * </script>
 * <template>
 *   <section :aria-busy="section.isLoading.value || undefined">
 *     <p v-if="section.state.value === 'error'" role="alert">The plan could not be read.</p>
 *     <button v-for="months in section.pausable.value ? section.pauseLengths : []" :key="months" @click="section.pause(months)">
 *       Pause until {{ day(section.resumesAfter(months)) }}
 *     </button>
 *   </section>
 * </template>
 * ```
 */
export function useBillingSection(options: UseBillingSectionOptions = {}): UseBillingSectionReturn {
  const billing = useBilling()
  const change = usePlanChange({ labels: () => toValue(options.labels), enabled: () => toValue(options.enabled) !== false })
  const gifted = computed(() => billing.pass.value !== null)
  const holds: Record<PlanState, () => boolean> = {
    gifted: () => gifted.value,
    past_due: () => billing.isPastDue.value,
    paused: () => billing.isPaused.value,
    canceling: () => billing.cancelAtPeriodEnd.value,
    changing: () => billing.pendingChange.value !== null,
    trialing: () => billing.isTrialing.value,
    active: () => true,
  }
  // Not known yet, or not readable: never a plan it might not be.
  const unknown = computed(() => billing.subscription.value === undefined)
  const state = computed<BillingSectionState>(() => {
    if (unknown.value) return billing.error.value ? 'error' : 'loading'
    if (!billing.isSubscribed.value) return 'free'
    return PLAN_STATES.find(key => holds[key]()) ?? 'active'
  })
  // A running plan the person changes themselves: not gifted, not set to end, not paused.
  const running = computed(() => billing.isSubscribed.value && !gifted.value && !billing.cancelAtPeriodEnd.value && !billing.isPaused.value)
  const switchable = computed(() => running.value && billing.pendingChange.value === null && (change.targets.value?.length ?? 0) > 0)
  // The provider pauses only an active subscription, never one in its trial.
  const pausable = computed(() => running.value && !billing.isPastDue.value && !billing.isTrialing.value && billing.resumesAt.value === null)
  const actions = computed<BillingSectionAction[]>(() => {
    const now = state.value
    if (!(PLAN_STATES as readonly string[]).includes(now) || !billing.canManage.value) return []
    const offered: Array<BillingSectionAction | false> = [
      gifted.value && 'keep-gifted',
      // A failed payment's first way back is the payment method.
      now === 'past_due' && 'portal',
      billing.isPaused.value && 'resume',
      billing.cancelAtPeriodEnd.value && 'uncancel',
      billing.pendingChange.value !== null && !billing.cancelAtPeriodEnd.value && 'cancel-change',
      // A gifted plan has no card to manage.
      now !== 'past_due' && !gifted.value && 'portal',
      switchable.value && 'change-plan',
      pausable.value && 'pause',
      running.value && 'cancel',
    ]
    return offered.filter((action): action is BillingSectionAction => action !== false)
  })
  const resumesAfter = (months: number): Date | null => {
    const end = toBillingDate(billing.subscription.value?.currentPeriodEnd)
    return end ? new Date(addMonths(end.getTime(), months)) : null
  }
  const { isPending, failure, run } = useActionState()

  return {
    state,
    isLoading: computed(() => (unknown.value && !billing.error.value) || billing.isFinishingCheckout.value),
    isPending,
    error: computed(() => failure.value ?? (unknown.value ? billing.error.value : null)),
    actions,
    switchable,
    pausable,
    cancellable: running,
    pauseLengths: PAUSE_MONTHS,
    resumesAfter,
    pause: (months) => {
      const resumesAt = resumesAfter(months)
      return run(() => billing.pause(resumesAt ? { resumesAt } : {}), { silent: true })
    },
    keepGifted: async (checkout = {}) => {
      const plan = billing.pass.value?.plan
      const product = plan ? billing.products.value?.[plan]?.id : undefined
      if (product) await run(() => billing.checkout(product, { redirect: true, ...checkout }), { silent: true })
    },
    change,
  }
}
