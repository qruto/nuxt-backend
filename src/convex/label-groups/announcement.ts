import type { LabelTree } from '../label-format.js'

/**
 * The announcement notice of `<BackendNotices>`: what an administrator
 * published. Its words are the administrator's; these are its controls.
 */
const ANNOUNCEMENT_LABELS = {
  // The banner's accessible name.
  label: 'Announcement',
  // The link's words, when the administrator gave none.
  link: 'Read more',
  dismiss: 'Dismiss',
  dismissFailed: 'The announcement could not be dismissed. Try again.',
} satisfies LabelTree

export default ANNOUNCEMENT_LABELS
