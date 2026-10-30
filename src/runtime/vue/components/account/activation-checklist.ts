import type { ActivationTask } from '../../composables/use-activation'

/** `<ActivationChecklist>`'s slots. */
export interface ActivationChecklistSlots {
  /** One task's row, in place of its link or text; receives the task, with its label read in the person's language and whether it is done. */
  task: (scope: { task: ActivationTask }) => unknown
  /** The congratulation shown once, when every task is done. */
  congratulations: () => unknown
}
