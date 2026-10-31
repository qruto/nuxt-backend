import type { LabelTree } from '../label-format.js'

/**
 * The impersonation notice of `<BackendNotices>`, in the region of every ready-made page
 * while an administrator acts as an account.
 */
const IMPERSONATION_LABELS = {
  // The banner's accessible name.
  label: 'Administrator visit',
  message: 'You are acting as {name}.',
  ends: 'The visit ends at {time}.',
  stop: 'Stop impersonating',
  stopping: 'Returning to your account…',
} satisfies LabelTree

export default IMPERSONATION_LABELS
