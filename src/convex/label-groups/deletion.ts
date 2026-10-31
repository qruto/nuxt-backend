import type { LabelTree } from '../label-format.js'

/**
 * The deletion notice of `<BackendNotices>` and the page behind the
 * email's "keep my account" link.
 */
const DELETION_LABELS = {
  // The notice's accessible name.
  label: 'Account deletion',
  message: 'Your account will be deleted on {date}. Until then you can keep it.',
  keep: 'Keep my account',
  keeping: 'Keeping your account…',
  kept: 'Your account is kept.',
  title: 'Keep your account',
  intro: 'Your account is scheduled for deletion. Keep it, and the deletion is cancelled.',
  done: 'Your account is kept, and the deletion is cancelled. We sent you a confirmation.',
  nothing: 'There is nothing to cancel: the deletion was cancelled already, it already ran, or the link is not the latest one we sent.',
  noToken: 'This link has no code. Open the link in the email again.',
} satisfies LabelTree

export default DELETION_LABELS
