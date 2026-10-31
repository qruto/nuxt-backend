import type { LabelTree } from '../label-format.js'

/**
 * The error-reporting service's user feedback widget
 * (`appConfig.backend.monitoring.feedback`): its button, and the form that
 * sends a report. It asks for no name, address or screenshot.
 */
const FEEDBACK_LABELS = {
  trigger: 'Report a problem',
  title: 'Report a problem',
  message: 'What happened?',
  placeholder: 'What were you doing, and what did you expect?',
  required: '(required)',
  submit: 'Send report',
  cancel: 'Cancel',
  sent: 'Thank you. Your report reached the team.',
} satisfies LabelTree

export default FEEDBACK_LABELS
