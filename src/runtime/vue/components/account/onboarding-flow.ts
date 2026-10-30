import type { UseOnboardingReturn } from '../../composables/use-onboarding'

/** What the slot of a step receives: the moves between steps, and where the person is. */
export interface OnboardingStepScope {
  /** The step the slot renders. */
  step: string
  /** Move on; on the last step, finish the first run. */
  next: () => Promise<boolean>
  /** Leave this step as it is and move on; on the last step, finish. */
  skip: () => Promise<boolean>
  /** Go back one step. */
  back: () => void
  /** The current step's place, from 0. */
  index: number
  /** How many steps there are. */
  total: number
  /** The first run's state, actions and bindings. */
  onboarding: UseOnboardingReturn
}

/**
 * `<OnboardingFlow>`'s slots: one per step, named like the step. A slot named
 * like a built-in step (`profile`, `workspace`, `teammates`, `plan`) replaces
 * it. A step of your own is a slot named like the step in `steps`
 * (`#genre` for `'genre'`), which receives the same scope.
 */
export interface OnboardingFlowSlots {
  profile?: (scope: OnboardingStepScope) => unknown
  workspace?: (scope: OnboardingStepScope) => unknown
  teammates?: (scope: OnboardingStepScope) => unknown
  plan?: (scope: OnboardingStepScope) => unknown
}
