import { computed, type ComputedRef, nextTick, ref, type Ref, useId } from 'vue'
import { busyAttributes } from '../../a11y'
import { type CancellationReason, type SaveOffer, useBilling } from '../../composables/use-billing'
import { refusalText, useLabels, type BackendLabels, type LabelOverrides, type UseLabelsReturn } from '../../composables/use-labels'

/**
 * The provider's eight cancellation reasons, in the order `<CancelFlow>`
 * asks them: the ones a save offer most often answers first.
 */
export const CANCELLATION_REASONS: readonly CancellationReason[] = ['too_expensive', 'unused', 'missing_features', 'switched_service', 'too_complex', 'low_quality', 'customer_service', 'other']

/** Where `<CancelFlow>` stands: the optional question, the one offer, the end, or the plan kept. */
export type CancelFlowStep = 'question' | 'offer' | 'ended' | 'kept'

/** What `<CancelFlow>` is told by its owner. */
export interface CancelFlowOptions {
  /** Copy for this flow, over `appConfig.backend.labels.cancelFlow`. */
  labels?: () => LabelOverrides<BackendLabels['cancelFlow']> | undefined
  /** Which subscription, with `multipleSubscriptions`. */
  subscriptionId?: () => string | undefined
  /** The plan ended its way: canceled, with when it ends (epoch ms). */
  onCanceled?: (endsAt: number | null) => void
  /** The person kept the plan: an offer accepted, or the cancellation undone. */
  onKept?: () => void
  /** A step failed: the words the flow shows. */
  onError?: (message: string) => void
}

/** `<CancelFlow>`'s slots: each step, handed the flow. */
export interface CancelFlowSlots {
  /** The optional question: the reasons, the comment and "Continue". */
  question: (flow: UseCancelFlowReturn) => unknown
  /** The one offer and the button that accepts it. */
  offer: (flow: UseCancelFlowReturn) => unknown
  /** The end: when the plan ends and "Keep my plan", or that it stays. */
  end: (flow: UseCancelFlowReturn) => unknown
}

/** `useCancelFlow()`: the cancel flow's state, its actions and what its controls carry. Every part of `<CancelFlow>` receives it. */
export interface UseCancelFlowReturn {
  /** Where the flow stands. */
  step: Ref<CancelFlowStep>
  /** The reason picked, if any: the question is optional. */
  reason: Ref<CancellationReason | undefined>
  /** The person's own words, at most 500 characters. */
  comment: Ref<string>
  /** The offer the server made for the reason, once it made one. */
  offer: Ref<SaveOffer | null>
  /** When the plan ends, epoch ms, once it is canceled (`null` when the server did not say). */
  endsAt: Ref<number | null>
  /** Which action runs: `continue`, `cancel`, `accept` or `keep`. */
  running: Ref<'continue' | 'cancel' | 'accept' | 'keep' | null>
  /** Why the last step failed, in the reader's words, or `null`. */
  error: Ref<string | null>
  /** The eight reasons, each with its words. */
  reasons: ComputedRef<Array<{ value: CancellationReason, label: string }>>
  /** The offer's real terms, in the reader's words. */
  offerText: ComputedRef<string>
  /** What the button that accepts the offer says. */
  acceptText: ComputedRef<string>
  /** When the plan ends, in the reader's words. */
  endText: ComputedRef<string>
  /** Answer the question (or skip it): the server answers with an offer, or cancels. */
  submit: () => Promise<void>
  /** "Cancel my plan", on every screen: cancels at once, past any offer. */
  cancelNow: () => Promise<void>
  /** Accept the offer the server made. */
  accept: () => Promise<void>
  /** Undo the cancellation before the plan ends: "Keep my plan". */
  keep: () => Promise<void>
  /** The flow's labels. */
  labels: UseLabelsReturn<'cancelFlow'>
  /** Ids unique to this flow, by part. */
  id: (part: string) => string
  /** What a button of an action carries: busy while its own action runs, keeping focus (`aria-disabled`). */
  busy: (action: 'continue' | 'cancel' | 'accept' | 'keep') => Record<string, string | undefined>
}

/** A money amount in the reader's words. */
function money(amount: number, currency: string, locale: string | undefined): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: currency.toUpperCase() }).format(amount / 100)
}

/**
 * The headless cancel flow `<CancelFlow>` renders: one optional question,
 * then at most one offer, then the end, with "Cancel my plan" on every
 * screen. Every rule that keeps an offer lawful is the server's
 * (`useBilling().cancel`): this only shows what it answered.
 */
export function useCancelFlow(options: CancelFlowOptions = {}): UseCancelFlowReturn {
  const billing = useBilling()
  const labels = useLabels('cancelFlow', () => options.labels?.())
  const { t, locale } = labels
  const base = useId()
  const step = ref<CancelFlowStep>('question')
  const reason = ref<CancellationReason>()
  const comment = ref('')
  const offer = ref<SaveOffer | null>(null)
  const endsAt = ref<number | null>(null)
  const running = ref<UseCancelFlowReturn['running']['value']>(null)
  const error = ref<string | null>(null)

  const date = (value: number | null) => value === null ? '' : new Intl.DateTimeFormat(locale.value, { dateStyle: 'long' }).format(value)
  const planName = (key: string | null) => (key ? billing.products.value?.[key]?.name : undefined) ?? key ?? ''

  /** Run one action of the flow: one at a time, its failure in `error`. */
  const run = async (action: NonNullable<UseCancelFlowReturn['running']['value']>, work: () => Promise<void>) => {
    if (running.value) return
    running.value = action
    error.value = null
    try {
      await work()
    }
    catch (failure) {
      error.value = refusalText(labels, failure, t('failed'))
      options.onError?.(error.value)
    }
    finally {
      running.value = null
    }
  }

  /** Cancel, or hear the offer; `offer: false` past it. */
  const send = async (past: boolean) => {
    const outcome = await billing.cancel({
      subscriptionId: options.subscriptionId?.(),
      reason: reason.value,
      comment: comment.value.trim() || undefined,
      ...(past ? { offer: false as const } : {}),
    })
    if ('offer' in outcome) {
      offer.value = outcome.offer
      step.value = 'offer'
      return
    }
    endsAt.value = outcome.endsAt
    step.value = 'ended'
    await nextTick()
    options.onCanceled?.(outcome.endsAt)
  }

  const offerText = computed(() => {
    const current = offer.value
    if (!current) return ''
    if (current.kind === 'pause') return t('offerPause', { plan: planName(current.plan), count: current.months, date: date(current.resumesAt) })
    if (current.kind === 'downgrade') return t('offerDowngrade', { plan: planName(current.plan), date: date(current.appliesAt) })
    const currency = Object.keys(current.amountOff ?? {})[0]
    const off = current.percentOff !== undefined ? `${current.percentOff}%` : currency ? money(current.amountOff![currency]!, currency, locale.value) : ''
    if (current.duration === 'repeating') return t('offerDiscountRepeating', { off, count: current.months ?? 1 })
    return t(current.duration === 'once' ? 'offerDiscountOnce' : 'offerDiscountForever', { off })
  })

  const acceptText = computed(() => {
    const current = offer.value
    if (current?.kind === 'pause') return t('acceptPause')
    if (current?.kind === 'downgrade') return t('acceptDowngrade', { plan: planName(current.plan) })
    return t('acceptDiscount')
  })

  return {
    step,
    reason,
    comment,
    offer,
    endsAt,
    running,
    error,
    reasons: computed(() => CANCELLATION_REASONS.map(value => ({ value, label: t(`reasons.${value}`) }))),
    offerText,
    acceptText,
    endText: computed(() => endsAt.value === null ? t('endsPeriod') : t('endsOn', { date: date(endsAt.value) })),
    submit: () => run('continue', () => send(false)),
    cancelNow: () => run('cancel', () => send(true)),
    accept: () => run('accept', async () => {
      await billing.acceptOffer(offer.value!)
      step.value = 'kept'
      options.onKept?.()
    }),
    keep: () => run('keep', async () => {
      await billing.uncancel({ subscriptionId: options.subscriptionId?.() })
      step.value = 'kept'
      options.onKept?.()
    }),
    labels,
    id: part => `${base}-${part}`,
    busy: action => busyAttributes(running.value === action),
  }
}
