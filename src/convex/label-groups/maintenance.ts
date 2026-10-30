import type { LabelTree } from '../label-format.js'

/**
 * The maintenance notice of `<BackendNotices>`, in the region of every ready-made page
 * while the `maintenance` switch is on. The message an administrator wrote
 * shows instead of `message` when there is one.
 */
const MAINTENANCE_LABELS = {
  // The banner's accessible name.
  label: 'Maintenance',
  message: 'We\'re doing maintenance. Some things may not work for a little while.',
} satisfies LabelTree

export default MAINTENANCE_LABELS
