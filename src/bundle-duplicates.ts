import { installChangedSince, readLastRun } from './analyze/report'
import { formatSize } from './analyze/sizes'
import { finding, type PreflightFinding } from './findings'

// doctor's `bundle-duplicates`: a package the Convex bundle holds more than
// once, read from the last `nuxt-backend analyze` run. Doctor never runs the
// analyzer (a run bundles the backend, which takes seconds), so there is no
// finding until a run has been made, and none once an install has changed
// since: the duplicates it found may be gone.

/** `bundle-duplicates`: no finding when no run is on record or an install has changed since it. */
export function bundleDuplicatesFindings(rootDir: string): PreflightFinding[] {
  const run = readLastRun(rootDir)
  const convex = run?.bundles.find(bundle => bundle.id === 'convex')
  if (!run || !convex || installChangedSince(rootDir, run.ranAt)) return []
  const date = run.ranAt.slice(0, 10)
  const duplicates = convex.insights.filter(insight => insight.kind === 'duplicate-package')
  if (duplicates.length === 0) return [finding('bundle-duplicates', 'pass', `The last analyze run (${date}) found no package bundled more than once in the Convex bundle.`)]
  const saved = duplicates.reduce((sum, insight) => sum + insight.savedBytes, 0)
  const names = duplicates.map(insight => insight.subject ?? insight.title)
  return [finding(
    'bundle-duplicates',
    'warn',
    `The Convex bundle holds ${names.length === 1 ? 'a package' : `${names.length} packages`} more than once (${names.join(', ')}), about ${formatSize(saved)} of code, as the last analyze run (${date}) measured it.`,
    'Dedupe the install (pnpm dedupe, npm dedupe), or align the version your code asks for with the one a dependency uses; npx nuxt-backend analyze --only convex names each copy and what imports it, and checks again.',
  )]
}
