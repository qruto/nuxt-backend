import type { LabelTree } from '../label-format.js'

/**
 * `<UploadField>`: a file picker that uploads, then hands the file to the
 * app's claim. Progress and refusals are announced in its live region.
 */
const UPLOAD_LABELS = {
  label: 'File',
  choose: 'Choose a file',
  replace: 'Choose another file',
  // The second path, beside the button: never the only one.
  drop: 'or drop it here',
  uploading: 'Uploading {name}…',
  progress: '{percent}% uploaded',
  claiming: 'Checking {name}…',
  done: '{name} added.',
  cancel: 'Cancel upload',
  canceled: 'Upload canceled.',
} satisfies LabelTree

export default UPLOAD_LABELS
