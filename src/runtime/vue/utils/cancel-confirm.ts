import { nextTick, ref, type Ref } from 'vue'
import { returnFocus } from './focus-return'

// Cancelling a plan takes one step wherever a packaged component offers it:
// the button that cancels says whether it is expanded and opens one group,
// with what ends when and the one button that cancels. Nothing else stands
// on it: no offer, no question and no field, since the confirmation of a
// cancellation may carry nothing but its button. Escape, or the button that
// opened it, closes it and gives focus back, except while the cancellation
// is on its way. The group's markup is `CancelConfirmGroup.vue`.

/** The labels the group reads, the same keys in every component's group. */
type ConfirmKey = 'confirmTitle' | 'confirmEnds' | 'confirmEndsPeriod' | 'confirmCancel' | 'canceling'

/** A component's `t`, as far as the group reads it. */
export type ConfirmTranslate = (key: ConfirmKey, params?: Record<string, string | number>) => string

/** What the group needs from the component that offers it. */
export interface CancelConfirmOptions {
  /** The component's markup family: `settings` writes `data-settings` hooks. */
  family: string
  /** What names the group: a heading in a section, a paragraph in a card. */
  titleTag: 'h4' | 'p'
  /** The id of one part of the group, unique to the component. */
  partId: (part: 'confirm' | 'title') => string
  /** `true` while the cancellation is on its way. */
  isBusy: () => boolean
  /** Send the cancellation. */
  confirm: () => unknown
  /** The component's labels. */
  t: ConfirmTranslate
  /** The date the plan ends on, in the reader's words, or `null` when it is not known yet. */
  endsOn: () => string | null
}

/** The one-step cancellation of one component. */
export interface CancelConfirm {
  /** What it was built with. */
  options: CancelConfirmOptions
  /** Whether the group is open. */
  isOpen: Ref<boolean>
  /** What the button that opens and closes the group carries, over its own props. */
  toggleProps: () => Record<string, unknown>
  /** Close the group and give focus back to the button that opened it; not while the cancellation is on its way. */
  close: () => void
  /** Close the group once the cancellation went through; the component moves focus to what took its place. */
  settle: () => void
}

/** Build the one-step cancellation of a component. */
export function createCancelConfirm(options: CancelConfirmOptions): CancelConfirm {
  const isOpen = ref(false)
  const toggle = ref<HTMLElement | null>(null)

  const close = () => {
    if (options.isBusy()) return
    isOpen.value = false
    void nextTick(() => returnFocus(toggle.value))
  }

  const toggleProps = () => ({
    'ref': toggle,
    'aria-expanded': isOpen.value ? 'true' : 'false',
    'data-state': isOpen.value ? 'open' : 'closed',
    'aria-controls': options.partId('confirm'),
    'aria-disabled': options.isBusy() ? 'true' : undefined,
    'onClick': () => (isOpen.value ? close() : (isOpen.value = true)),
  })

  return { options, isOpen, toggleProps, close, settle: () => (isOpen.value = false) }
}
