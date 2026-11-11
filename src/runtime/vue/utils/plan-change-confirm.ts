import { computed, nextTick, ref, type ComputedRef, type Ref } from 'vue'
import type { ClientProrationBehavior, PlanChangePreview } from '../composables/use-billing'
import type { PlanChangeApplies, PlanChangeTarget, UsePlanChangeReturn } from '../composables/use-plan-change'
import { returnFocus } from './focus-return'

// Switching a subscriber's plan takes one confirmation wherever a packaged
// component offers it: the price it moves to, when the switch happens and
// how the period's difference is settled (`useBilling().changeOf`), then the
// one button that switches and one that leaves it. Escape, or "Not now",
// closes it and gives focus back, except while the switch is on its way.
// What the group is about and what it would do are `usePlanChange`'s, and
// so are the words' rules; this adds the component's own words and the
// focus a packaged group moves. The group's markup is `PlanChangeConfirmGroup.vue`.

export type { PlanChangeTarget } from '../composables/use-plan-change'

/**
 * How a confirmed switch settles: the period's difference charged or
 * credited at once, as the confirmation says it is. Sent with every switch
 * `usePlanChange` and the packaged components make, so the organization's
 * own default, which may defer the charge to the next invoice or schedule
 * the switch for the period's end, never makes the words untrue.
 */
export const CONFIRMED_PRORATION = 'invoice' satisfies ClientProrationBehavior

/** The labels the words read, the same keys in every group that confirms a switch. */
type ChangeKey = 'changeTitle' | 'changeNow' | 'changeLater' | 'changeLaterPeriod' | 'changeTrial' | 'changeTrialEnds' | 'changeTrialLater' | 'confirmChange' | 'switchingPlan' | 'keepCurrent'

/** A component's `t`, as far as the group reads it. */
export type ChangeTranslate = (key: ChangeKey, params?: Record<string, string | number>) => string

/** What a switch's confirmation says about it. */
interface ChangeWords {
  /** How it goes: `usePlanChange().applies`. */
  applies: PlanChangeApplies | null
  /** What the switch would do: `useBilling().changeOf`. */
  preview: PlanChangePreview | null
  /** The price it moves to, with its period. */
  price: string
  /** What a gifted plan's checkout says, which the preview has nothing to say about. */
  gifted: string
  t: ChangeTranslate
  /** A date in the reader's words, or `null`. */
  date: (value: Date) => string | null
}

/**
 * When a switch happens and how it settles, in the reader's words: at once
 * with the period's difference settled now, or at the paid year's end; in
 * a trial, carrying the trial over, ending it with a first payment, or
 * waiting for its end. A gifted plan's holder reads that theirs is a
 * checkout that ends the gift. `''` for a switch there is nothing to say
 * about.
 */
export function planChangeWhen(words: ChangeWords): string {
  const { applies, preview, price, t } = words
  if (applies === 'checkout') return words.gifted
  if (!preview) return ''
  // In a trial nothing is prorated: the trial carries over, or ends with a first payment, or a switch that waits happens when it ends.
  if (preview.trial) return t(preview.applies === 'period_end' ? 'changeTrialLater' : preview.proration === 'none' ? 'changeTrial' : 'changeTrialEnds', { price })
  if (preview.applies === 'now') return t('changeNow', { price })
  const date = preview.appliesAt ? words.date(preview.appliesAt) : null
  return date ? t('changeLater', { price, date }) : t('changeLaterPeriod', { price })
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
  /** The plan change the group confirms: what it is about, and what it would do. */
  change: UsePlanChangeReturn
  /** Make the switch. */
  confirm: (target: Required<PlanChangeTarget>) => unknown
  /** The component's labels. */
  t: ChangeTranslate
  /** A date in the reader's words, or `null`. */
  date: (value: Date) => string | null
  /**
   * What the group says for a gifted plan's holder, whose switch is a
   * checkout of the new plan that ends the gift and which the preview has
   * nothing to say about (`changeOf` is `null` for a pass). A component
   * that never opens the group for one leaves it out.
   */
  gifted?: (target: PlanChangeTarget) => string
}

/** The plan change confirmation of one component. */
export interface PlanChangeConfirm {
  /** What it was built with. */
  options: PlanChangeConfirmOptions
  /** The price the group is open for, `null` while it is closed. */
  target: Ref<Required<PlanChangeTarget> | null>
  /** What switching to it would do; `null` while closed, or for a change there is none to make. */
  preview: ComputedRef<PlanChangePreview | null>
  /** `true` while the group is open for a switch it can describe: one the preview knows, or a gifted plan's checkout. */
  shows: ComputedRef<boolean>
  /** When the switch happens and how it settles, in the component's words. */
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

/** Build the plan change confirmation of a component, over the plan change it confirms. */
export function createPlanChangeConfirm(options: PlanChangeConfirmOptions): PlanChangeConfirm {
  const { change } = options
  const opener = ref<HTMLElement | null>(null)
  const when = computed(() => {
    const target = change.target.value
    if (!target) return ''
    return planChangeWhen({
      applies: change.applies.value,
      preview: change.preview.value,
      price: target.price,
      gifted: options.gifted?.(target) ?? '',
      t: options.t,
      date: options.date,
    })
  })

  const close = () => {
    if (options.isBusy()) return
    change.close()
    void nextTick(() => returnFocus(opener.value))
  }
  const open = (next: PlanChangeTarget, from: HTMLElement | null = null) => {
    change.open(next)
    opener.value = from
  }

  const toggleProps = (next: PlanChangeTarget) => {
    const isOpen = change.target.value?.key === (next.key ?? next.productId)
    return {
      'aria-expanded': isOpen ? 'true' : 'false',
      'data-state': isOpen ? 'open' : 'closed',
      'aria-controls': options.partId('confirm'),
      'onClick': (event: Event) => (isOpen ? close() : open(next, event.currentTarget as HTMLElement | null)),
    }
  }

  const shows = computed(() => change.target.value !== null && change.applies.value !== null)

  return { options, target: change.target, preview: change.preview, shows, when, toggleProps, open, close, settle: () => change.close() }
}
