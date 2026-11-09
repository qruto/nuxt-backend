/**
 * Writing and checking the generated labels file (src/labels-file.ts
 * renders it). The module rewrites it on every start when app.config says
 * something else, `init` scaffolds it empty, and `doctor` names a file that
 * is missing or out of date (`labels-file`).
 */
import type { LabelTree } from './convex/label-format'
import type { PreflightFinding } from './findings'
import { generatedFileFinding, generatedFileLocation, syncGeneratedFile } from './generated-file'
import { LABELS_FILE, renderLabelsFile } from './labels-file'

/** The file's location, relative to the project and absolute. */
export function labelsFileLocation(rootDir: string): { name: string, path: string } {
  return generatedFileLocation(rootDir, LABELS_FILE)
}

/** Write the file when it says something other than these labels. An app without a functions directory yet gets none. */
export function syncLabelsFile(rootDir: string, labels: LabelTree): 'written' | 'unchanged' | 'no-functions-dir' {
  return syncGeneratedFile(rootDir, LABELS_FILE, renderLabelsFile(labels))
}

/**
 * `doctor`'s check of the file against app config: missing, or holding
 * other labels, the emails and notifications say otherwise than the pages.
 * Nothing when the app has no functions directory yet.
 */
export function labelsFileFinding(rootDir: string, labels: LabelTree | null): PreflightFinding[] {
  if (!labels) return []
  return generatedFileFinding(rootDir, { id: 'labels-file', file: LABELS_FILE, text: renderLabelsFile(labels), holds: 'the labels app.config sets', source: `app.config's \`backend.labels\``, consequence: 'emails and notifications say otherwise than the pages' })
}
