import { computed, nextTick, ref, type ComputedRef, type Ref } from 'vue'
import type { ClientProrationBehavior, PlanChangePreview } from '../composables/use-billing'
import { returnFocus } from './focus-return'

// Switching a subscriber's plan takes one confirmation wherever a packaged
// component offers it: the price it moves to, when the switch happens and
// how the period's difference is settled (`useBilling().changeOf`), then the
// one button that switches and one that leaves it. Escape, or "Not now",
// closes it and gives focus back, except while the switch is on its way.
// The group's markup is `PlanChangeConfirmGroup.vue`.

/**
 * How a confirmed switch settles: the period's difference charged or
 * credited at once, as the confirmation says it is. Sent with every switch
 * the packaged components make, so the organization's own default, which
 * may defer the charge to the next invoice or schedule the switch for the
 * period's end, never makes the words untrue.
 */
export const CONFIRMED_PRORATION = 'invoice' satisfies ClientProrationBehavior

/** The labels the group reads, the same keys in every component's group. */
type ChangeKey = 'changeTitle' | 'changeNow' | 'changeLater' | 'changeLaterPeriod' | 'changeTrial' | 'changeTrialEnds' | 'changeTrialLater' | 'confirmChange' | 'switchingPlan' | 'keepCurrent'

/** A component's `t`, as far as the group reads it. */
export type ChangeTranslate = (key: ChangeKey, params?: Record<string, string | number>) => string

/** The price a confirmation is about, in the reader's words. */
export interface PlanChangeTarget {
  /** The product to switch to. */
  productId: string
  /** The plan's name, as its card or option names it. */
  plan: string
  /** Its price with its period, formatted: `$29/mo`. */
  price: string
  /** Who asked: a plan card's key, an option's value. */
  key: string
}

/** What the group needs from the component that offers it. */
export interface PlanChangeConfirmOptions {
  /** The component's markup family: `settings` writes `data-settings` hooks. */
  family: string
  /** What names the group: a heading in a section, a paragraph in a card. */
  titleTag: 'h4' | 'p'
  /** The id of one part of the group, unique to the component. */
  partId: (part: 'confirm' | 'title') => string
  /** `true` while the switch is on its way. */
  isBusy: () => boolean
  /** What the switch would do: `useBilling().changeOf`. */
  preview: (productId: string) => PlanChangePreview | null
  /** Make the switch. */
  confirm: (target: PlanChangeTarget) => unknown
  /** The component's labels. */
  t: ChangeTranslate
  /** A date in the reader's words, or `null`. */
  date: (value: Date) => string | null
}

/** The plan change confirmation of one component. */
export interface PlanChangeConfirm {
  /** What it was built with. */
  options: PlanChangeConfirmOptions
  /** The price the group is open for, `null` while it is closed. */
  target: Ref<PlanChangeTarget | null>
  /** What switching to it would do; `null` while closed, or for a change there is none to make. */
  preview: ComputedRef<PlanChangePreview | null>
  /** When the switch happens and how it settles, in the reader's words. */
  when: ComputedRef<string>
  /** What the button that opens and closes the group for `target` carries, over its own props. */
  toggleProps: (target: PlanChangeTarget) => Record<string, unknown>
  /** Open the group for a price, focus going back to `from` when it closes. */
  open: (target: PlanChangeTarget, from?: HTMLElement | null) => void
  /** Close the group and give focus back; not while the switch is on its way. */
  close: () => void
  /** Close the group once the switch went through; the component moves focus to what took its place. */
  settle: () => void
}

/** Build the plan change confirmation of a component. */
export function createPlanChangeConfirm(options: PlanChangeConfirmOptions): PlanChangeConfirm {
  const target = ref<PlanChangeTarget | null>(null)
  const opener = ref<HTMLElement | null>(null)
  const preview = computed(() => (target.value ? options.preview(target.value.productId) : null))
  const when = computed(() => {
    const change = preview.value
    const price = target.value?.price ?? ''
    if (!change) return ''
    // In a trial nothing is prorated: the trial carries over, or ends with a first payment, or a switch that waits happens when it ends.
    if (change.trial) return options.t(change.applies === 'period_end' ? 'changeTrialLater' : change.proration === 'none' ? 'changeTrial' : 'changeTrialEnds', { price })
    if (change.applies === 'now') return options.t('changeNow', { price })
    const date = change.appliesAt ? options.date(change.appliesAt) : null
    return date ? options.t('changeLater', { price, date }) : options.t('changeLaterPeriod', { price })
  })

  const close = () => {
    if (options.isBusy()) return
    target.value = null
    void nextTick(() => returnFocus(opener.value))
  }
  const open = (next: PlanChangeTarget, from: HTMLElement | null = null) => {
    target.value = next
    opener.value = from
  }

  const toggleProps = (next: PlanChangeTarget) => {
    const isOpen = target.value?.key === next.key
    return {
      'aria-expanded': isOpen ? 'true' : 'false',
      'data-state': isOpen ? 'open' : 'closed',
      'aria-controls': options.partId('confirm'),
      'onClick': (event: Event) => (isOpen ? close() : open(next, event.currentTarget as HTMLElement | null)),
    }
  }

  return { options, target, preview, when, toggleProps, open, close, settle: () => (target.value = null) }
}
