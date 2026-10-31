import { inject, provide, type InjectionKey } from 'vue'
import type { LabelGroupOverrides } from '../../composables/use-labels'
import type { UseWaitlistReturn } from '../../composables/use-waitlist'

/** What each of `<WaitlistForm>`'s slots receives: the steps' state and actions, `useWaitlist()`'s. */
export interface WaitlistFormSlots {
  /** The first step: the address, your questions and the launch-news box. */
  join: (waitlist: UseWaitlistReturn) => unknown
  /** The second step: the sign-in code. */
  verify: (waitlist: UseWaitlistReturn) => unknown
  /** The last step: the place, the link to share and Leave. */
  status: (waitlist: UseWaitlistReturn) => unknown
}

/**
 * What `<WaitlistForm>` hands its packaged parts beside the `waitlist` prop:
 * the props that shape their words and links. A part outside the form (the
 * `/waitlist` page renders `WaitlistPlace` alone) reads the defaults.
 *
 * @internal
 */
export interface WaitlistFormView {
  /** The form's `labels` prop. */
  labels: () => LabelGroupOverrides<'waitlist'> | undefined
  /** The text of each of your questions, by key. */
  questionLabels: () => Record<string, string> | undefined
  /** The page a friend's link opens: the one with the form. */
  shareTo: () => string
}

const WAITLIST_FORM_VIEW: InjectionKey<WaitlistFormView> = Symbol('nuxt-backend:waitlist-form')

/** A part outside `<WaitlistForm>`: the app's words, and a friend's link that opens the home page. */
const STANDALONE: WaitlistFormView = { labels: () => undefined, questionLabels: () => undefined, shareTo: () => '/' }

/** @internal */
export function provideWaitlistFormView(view: WaitlistFormView): void {
  provide(WAITLIST_FORM_VIEW, view)
}

/**
 * The view of the `<WaitlistForm>` a packaged part renders in, or the
 * defaults outside one.
 *
 * @internal
 */
export function useWaitlistFormView(): WaitlistFormView {
  return inject(WAITLIST_FORM_VIEW, STANDALONE)
}
