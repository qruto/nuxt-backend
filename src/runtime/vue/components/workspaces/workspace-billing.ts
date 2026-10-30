import { computed, nextTick, ref, type ComputedRef, type Ref } from 'vue'
import { formatBillingDate } from '../../composables/billing-format'
import type { CancellationReason, EntitlementBenefit, UseBillingReturn } from '../../composables/use-billing'
import type { UseFeaturesReturn } from '../../composables/use-features'
import type { UseLabelsReturn } from '../../composables/use-labels'
import { type CancelConfirm, createCancelConfirm } from '../../utils/cancel-confirm'
import { returnFocus } from '../../utils/focus-return'

// The plan section of <WorkspaceSettings> (`WorkspaceBilling`): the plan, in
// every state its subscription can be in, with the one action each state
// calls for, the benefits it includes, and a cancellation that takes one
// step. Built inside the component's setup, so it shares its pending
// action, its status and its message region.

/**
 * The states a plan can be in, in the order they are tried: the first that
 * holds is the one shown. A plan pass gifted until its end date, a failed payment, a pause, a cancellation set for
 * the period's end, a plan change scheduled for it, a trial, else active.
 * The Subscriptions page lists them in this order (test/docs pins it).
 */
export const PLAN_STATES = ['gifted', 'past_due', 'paused', 'canceling', 'changing', 'trialing', 'active'] as const

/** The state the plan is in: the first of {@link PLAN_STATES} that holds. */
export type PlanState = typeof PLAN_STATES[number]

/** Kinds of benefit the billing portal holds more of: the whole key, the files, the connected account. */
export const IN_PORTAL = new Set(['license_key', 'download', 'community', 'repository', 'shared_channel'])

/** What the section needs from `<WorkspaceSettings>`. */
export interface BillingSectionContext {
  billing: UseBillingReturn
  features: UseFeaturesReturn
  labels: UseLabelsReturn<'settings'>
  /** The key of the action in flight, or `null`. */
  pending: Ref<string | null>
  /** Run one action under a key, announcing what it waits for and, when it went through, `okText`. */
  run: (key: string, busy: () => string, action: () => Promise<unknown>, okText?: () => string) => Promise<void>
  /** The id of one part of the section, unique to this instance. */
  partId: (key: string, part: string) => string
  /** The plan's product name, by its id. */
  productName: (productId: string) => string | undefined
  /** The product to check out to keep a gifted plan: the plan's, by its catalog key. */
  giftedProduct: (plan: string) => string | undefined
  /** Tell the component's own listener: the matching event. */
  notify: (event: 'plan-canceled' | 'plan-uncanceled' | 'plan-resumed' | 'change-canceled') => void
}

/**
 * What a cancellation may carry: the customer's own reason and words, both
 * optional, which the provider keeps with it. The section's own group sends
 * neither, since a cancellation's confirmation asks nothing more; a flow of
 * your own may pass them, with the cancellation itself, as the provider
 * takes one cancellation per period.
 */
export interface CancelPlanOptions {
  reason?: CancellationReason
  comment?: string
}

/** The section's state and actions. */
export interface BillingSection {
  state: ComputedRef<PlanState | null>
  /** The plan's benefits: what it includes, each in neutral words. */
  benefits: ComputedRef<EntitlementBenefit[]>
  /** The one-step cancellation. */
  confirm: CancelConfirm
  /** The state line, where focus lands once a cancellation went through. */
  stateLine: Ref<HTMLElement | null>
  /** A date in the reader's words, or `null`. */
  date: (value: unknown) => string | null
  /** Cancel at the period's end, with the reason and words a flow of your own gathered. */
  cancelPlan: (options?: CancelPlanOptions) => Promise<void>
  /** Undo the cancellation set for the period's end. */
  keepPlan: () => Promise<void>
  /** Resume the paused plan now. */
  resumePlan: () => Promise<void>
  /** Undo the plan change scheduled for the period's end. */
  cancelChange: () => Promise<void>
  /** Open the billing portal: the payment method, invoices, keys and files. */
  openPortal: () => Promise<void>
  /** Keep the gifted plan: an ordinary checkout of it, which moves the pass to the paid plan in place. */
  keepGifted: () => Promise<void>
}

/** Build the plan section of one `<WorkspaceSettings>`. */
export function createBillingSection(context: BillingSectionContext): BillingSection {
  const { billing, features, labels, pending, run, partId, notify } = context
  const { t, locale } = labels
  const holds: Record<PlanState, () => boolean> = {
    gifted: () => billing.pass.value !== null,
    past_due: () => billing.isPastDue.value,
    paused: () => billing.isPaused.value,
    canceling: () => billing.cancelAtPeriodEnd.value,
    changing: () => billing.pendingChange.value !== null,
    trialing: () => billing.isTrialing.value,
    active: () => true,
  }
  const state = computed<PlanState | null>(() => billing.isSubscribed.value ? PLAN_STATES.find(key => holds[key]()) ?? 'active' : null)
  const benefits = computed(() => features.benefits.value ?? [])
  const stateLine = ref<HTMLElement | null>(null)
  const date = (value: unknown): string | null => formatBillingDate(value, { dateStyle: 'medium' }, locale.value) || null

  // The one-step cancellation: what ends when and the one button, nothing else.
  const confirm = createCancelConfirm({
    family: 'settings',
    titleTag: 'h4',
    partId: part => partId('cancel', part),
    isBusy: () => pending.value === 'cancel',
    confirm: () => cancelPlan(),
    t,
    endsOn: () => date(billing.subscription.value?.currentPeriodEnd),
  })

  /** Cancel at the period's end; from the group, with no reason: the group asks nothing. */
  function cancelPlan(options: CancelPlanOptions = {}): Promise<void> {
    return run('cancel', () => t('canceling'), async () => {
      await billing.cancel({ reason: options.reason, comment: options.comment?.trim() || undefined })
      confirm.settle()
      notify('plan-canceled')
      // The button pressed went with the step: focus moves to the plan's state.
      void nextTick(() => returnFocus(stateLine.value))
    }, () => t('canceled'))
  }

  return {
    state,
    benefits,
    confirm,
    stateLine,
    date,
    cancelPlan,
    keepPlan: () => run('uncancel', () => t('keeping'), async () => {
      await billing.uncancel()
      notify('plan-uncanceled')
    }, () => t('kept')),
    resumePlan: () => run('resume', () => t('resuming'), async () => {
      await billing.resume()
      notify('plan-resumed')
    }, () => t('resumed')),
    cancelChange: () => run('cancel-change', () => t('cancelingChange'), async () => {
      await billing.cancelPendingChange()
      notify('change-canceled')
    }, () => t('changeCanceled')),
    openPortal: () => run('portal', () => t('openingPortal'), () => billing.portal({ redirect: true })),
    keepGifted: () => run('keep-gifted', () => t('keepingGiftedPlan'), async () => {
      const product = billing.pass.value ? context.giftedProduct(billing.pass.value.plan) : undefined
      if (product) await billing.checkout(product, { redirect: true })
    }),
  }
}
