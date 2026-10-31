import errors from '../../../convex/label-groups/errors.js'
import type { LabelTree } from '../../../convex/label-format.js'
import type { BackendLabels, LabelGroup } from '../../../convex/labels.js'
import { EVERY_GROUP } from './label-fallback'

// The English label groups this page has loaded. A module that names a group
// (`useLabels('auth')`) registers it as it loads, through the module's
// transform (src/nuxt/labels.ts), so a page carries the groups its
// components read and no others. `errors` is always here: every group's
// `errorMessage` reads it.

const loaded = new Map<string, LabelTree>(Object.entries({ ...EVERY_GROUP, errors }) as Array<[string, LabelTree]>)

/** Groups already warned about, so a render loop says it once. */
const warned = new Set<string>()

/**
 * Register one group's English labels: what the module's transform adds to a
 * module that names the group. The first registration stands.
 *
 * @internal
 */
export function registerLabels<G extends LabelGroup>(group: G, labels: BackendLabels[G]): void {
  if (!loaded.has(group)) loaded.set(group, labels as LabelTree)
}

/**
 * A group's English labels, or `undefined` when no module that this page
 * loaded names it: the group is named through a variable, which the
 * transform cannot read. With `warn` (a group `useLabels` was given), says
 * so once per group in development.
 *
 * @internal
 */
export function englishLabels(group: string, warn = false): LabelTree | undefined {
  const labels = loaded.get(group)
  if (labels === undefined && warn && import.meta.dev && !warned.has(group)) {
    warned.add(group)
    console.warn(`[nuxt-backend] No module of this page names the \`${group}\` labels, so they show as their keys: write the group out where you read it, \`useLabels('${group}')\`.`)
  }
  return labels
}
