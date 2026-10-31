import type { LabelTree } from '../label-format.js'

/**
 * `<ActivationChecklist>`: the few first tasks that lead to a first result,
 * with progress. Each task's own text is the `label` the app gives it.
 */
const ACTIVATION_LABELS = {
  title: 'Get started',
  // Said while the checklist is read.
  loading: 'Loading…',
  // The name of the progress bar.
  progressLabel: 'Progress',
  progress: '{done} of {total} done',
  taskDone: 'Done',
  taskOpen: 'To do',
  dismiss: 'Dismiss',
  dismissing: 'Dismissing…',
  dismissed: 'Checklist dismissed.',
  congratulations: 'All done. You finished every first step.',
  // What an administrator who visits an account reads in place of the Dismiss button.
  readOnly: 'You are viewing this account: its checklist cannot be changed.',
} satisfies LabelTree

export default ACTIVATION_LABELS
