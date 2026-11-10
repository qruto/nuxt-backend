import { computed, nextTick, ref, type ComputedRef, type Ref } from 'vue'
import { addMonths } from '../../../../convex/catalog.js'
import { formatBillingDate, toBillingDate } from '../../composables/billing-format'
import type { CancellationReason, EntitlementBenefit, UseBillingReturn } from '../../composables/use-billing'
import type { UseFeaturesReturn } from '../../composables/use-features'
import type { UseLabelsReturn } from '../../composables/use-labels'
import { type CancelConfirm, createCancelConfirm } from '../../utils/cancel-confirm'
import { returnFocus } from '../../utils/focus-return'
import { createPlanChangeConfirm, type PlanChangeConfirm, type PlanChangeTarget } from '../../utils/plan-change-confirm'

/** How many months a pause from the section lasts, at most: the lengths it offers are 1 to this. */
export const PAUSE_MONTHS = [1, 2, 3] as const

/** One price the plan can switch to: another plan, or the same plan at its other billing period. */
export type PlanSwitchOption = PlanChangeTarget

// The plan section of <WorkspaceSettings> (`WorkspaceBilling`): the plan, in
// every state its subscription can be in, with the one action each state
// calls for, the benefits it includes, a switch to another plan or billing
// period and a cancellation that each take one confirmation, and a pause of
// one to three months. Built inside the component's setup, so it shares its pending
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
  /** The prices the plan can switch to, in the reader's words: every plan on sale at each period, but the one it is on. */
  switchOptions: () => PlanSwitchOption[]
  /** Tell the component's own listener: the matching event, with its argument. */
  notify: (event: 'plan-canceled' | 'plan-uncanceled' | 'plan-resumed' | 'change-canceled' | 'plan-changed' | 'plan-paused', argument?: unknown) => void
  /** Say in the status region how a step taken outside `run` went: `<CancelFlow>`'s. */
  announce: (text: () => string) => void
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
  /** Cancel at the period's end, with the reason and words a flow of your own gathered: in one step, past any save offer. */
  cancelPlan: (options?: CancelPlanOptions) => Promise<void>
  /** `<CancelFlow>` (save offers on) cancelled the plan: what a one-step cancellation does once it went through. */
  flowCanceled: () => void
  /** `<CancelFlow>` kept the plan, its offer accepted: the flow closes, focus moves to the plan's state. */
  flowKept: () => void
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
  /** The prices the plan can switch to: what the switch's picker lists. */
  switchOptions: ComputedRef<PlanSwitchOption[]>
  /** Whether the plan offers a switch now: a running plan, not set to end, paused, gifted or already changing. */
  switchable: ComputedRef<boolean>
  /** Whether the switch's picker is open. */
  switchOpen: Ref<boolean>
  /** What the button that opens and closes the picker carries. */
  switchToggleProps: () => Record<string, unknown>
  /** Close the picker, focus back on its button. */
  closeSwitch: () => void
  /** The switch's one-step confirmation, for the price picked. */
  change: PlanChangeConfirm
  /** Pick a price in the picker: its confirmation shows what switching to it does. */
  pick: (productId: string) => void
  /** Switch to a price at once (`useBilling().changeOf` says when it applies). */
  switchPlan: (productId: string) => Promise<void>
  /** Whether the plan offers a pause now: running, not set to end, paused already or with a pause scheduled. */
  pausable: ComputedRef<boolean>
  /** Whether the pause's group is open. */
  pauseOpen: Ref<boolean>
  /** What the button that opens and closes the pause's group carries. */
  pauseToggleProps: () => Record<string, unknown>
  /** The pause's length in months, one of {@link PAUSE_MONTHS}. */
  pauseMonths: Ref<number>
  /** Close the pause's group, focus back on its button. */
  closePause: () => void
  /** Pause from the period's end for `months`, resuming by itself after them. */
  pausePlan: (months: number) => Promise<void>
  /** When a pause of `months` from the period's end resumes, `null` while the period's end is not known. */
  resumesAfter: (months: number) => Date | null
}

/** Build the plan section of one `<WorkspaceSettings>`. */
export function createBillingSection(context: BillingSectionContext): BillingSection {
  const { billing, features, labels, pending, run, partId, notify, announce } = context
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

  // Switching: a picker of the prices on sale, then one confirmation.
  const switchOptions = computed(() => context.switchOptions())
  const switchable = computed(() => billing.isSubscribed.value && billing.pass.value === null && !billing.cancelAtPeriodEnd.value
    && !billing.isPaused.value && billing.pendingChange.value === null && switchOptions.value.length > 0)
  const switchOpen = ref(false)
  const switchToggle = ref<HTMLElement | null>(null)
  const change = createPlanChangeConfirm({
    family: 'settings',
    titleTag: 'h4',
    partId: part => partId('change', part),
    isBusy: () => pending.value === 'switch',
    preview: productId => billing.changeOf(productId),
    confirm: target => switchPlan(target.productId),
    t,
    date: value => date(value),
  })
  const closeSwitch = () => {
    if (pending.value === 'switch') return
    switchOpen.value = false
    change.settle()
    void nextTick(() => returnFocus(switchToggle.value))
  }
  const pick = (productId: string) => {
    const option = switchOptions.value.find(entry => entry.productId === productId)
    if (option) change.open(option, switchToggle.value)
    else change.settle()
  }
  function switchPlan(productId: string): Promise<void> {
    const option = switchOptions.value.find(entry => entry.productId === productId)
    const preview = billing.changeOf(productId)
    const plan = option?.plan ?? context.productName(productId) ?? t('unknownPlan')
    return run('switch', () => t('switchingPlan'), async () => {
      await billing.changePlan(productId)
      switchOpen.value = false
      change.settle()
      void nextTick(() => returnFocus(stateLine.value))
      notify('plan-changed', productId)
    }, () => {
      if (preview?.applies !== 'period_end') return t('switched', { plan })
      const when = preview.appliesAt ? date(preview.appliesAt) : null
      return when ? t('switchScheduled', { plan, date: when }) : t('switchScheduledPeriod', { plan })
    })
  }

  // Pausing: from the period's end, for one to three months. The provider
  // pauses only an active subscription, never one in its trial.
  const pausable = computed(() => billing.isSubscribed.value && billing.pass.value === null && !billing.cancelAtPeriodEnd.value
    && !billing.isPaused.value && !billing.isPastDue.value && !billing.isTrialing.value && billing.resumesAt.value === null)
  const pauseOpen = ref(false)
  const pauseToggle = ref<HTMLElement | null>(null)
  const pauseMonths = ref<number>(PAUSE_MONTHS[0])
  const closePause = () => {
    if (pending.value === 'pause') return
    pauseOpen.value = false
    void nextTick(() => returnFocus(pauseToggle.value))
  }
  /** The period's end, moved on by whole months in UTC the way the provider counts them: the same day of the month, or its last. */
  const resumesAfter = (months: number): Date | null => {
    const end = toBillingDate(billing.subscription.value?.currentPeriodEnd)
    return end ? new Date(addMonths(end.getTime(), months)) : null
  }
  const pausePlan = (months: number) => {
    const resumesAt = resumesAfter(months)
    return run('pause', () => t('pausing'), async () => {
      await billing.pause(resumesAt ? { resumesAt } : {})
      pauseOpen.value = false
      void nextTick(() => returnFocus(stateLine.value))
      notify('plan-paused', resumesAt?.getTime() ?? null)
    }, () => {
      const when = resumesAt ? date(resumesAt) : null
      return when ? t('pauseScheduled', { date: when }) : t('pauseScheduledPeriod')
    })
  }
  const toggle = (element: Ref<HTMLElement | null>, isOpen: Ref<boolean>, close: () => void, controls: string, busy: string) => ({
    'ref': element,
    'aria-expanded': isOpen.value ? 'true' : 'false',
    'data-state': isOpen.value ? 'open' : 'closed',
    'aria-controls': controls,
    'aria-disabled': pending.value === busy ? 'true' : undefined,
    'onClick': () => (isOpen.value ? close() : (isOpen.value = true)),
  })

  /** The cancellation step is over: it closes, and the button pressed went with it, so focus moves to the plan's state. */
  function settle(): void {
    confirm.settle()
    void nextTick(() => returnFocus(stateLine.value))
  }

  /**
   * Cancel at the period's end; from the group, with no reason: the group
   * asks nothing. One step whatever the reason: `offer: false`, since a
   * save offer answered here would cancel nothing and read as done.
   */
  function cancelPlan(options: CancelPlanOptions = {}): Promise<void> {
    return run('cancel', () => t('canceling'), async () => {
      await billing.cancel({ reason: options.reason, comment: options.comment?.trim() || undefined, offer: false })
      settle()
      notify('plan-canceled')
    }, () => t('canceled'))
  }

  return {
    state,
    benefits,
    confirm,
    stateLine,
    date,
    cancelPlan,
    flowCanceled: () => {
      settle()
      notify('plan-canceled')
      announce(() => t('canceled'))
    },
    flowKept: settle,
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
    switchOptions,
    switchable,
    switchOpen,
    switchToggleProps: () => toggle(switchToggle, switchOpen, closeSwitch, partId('switch', 'picker'), 'switch'),
    closeSwitch,
    change,
    pick,
    switchPlan,
    pausable,
    pauseOpen,
    pauseToggleProps: () => toggle(pauseToggle, pauseOpen, closePause, partId('pause', 'confirm'), 'pause'),
    pauseMonths,
    closePause,
    pausePlan,
    resumesAfter,
  }
}
