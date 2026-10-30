// Putting a run together: the budgets a bundle is held to, the last run kept
// on disk for `doctor`, and the report as text.

import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { formatShare, formatSize } from './sizes'
import type { AnalyzeReport, BudgetCheck, BundleId, BundlePackage, BundleReport } from './types'

/** The flag that sets each bundle's budget. */
export const BUDGET_FLAGS: Readonly<Record<BundleId, string>> = {
  convex: '--max-convex',
  client: '--max-client',
  server: '--max-server',
}

/** What a bundle's packages grew by since the run before: the three that grew most, with the growth. */
function growth(bundle: BundleReport, before: BundleReport | undefined): BundlePackage[] {
  if (!before) return []
  // A package outside the run before's largest was no bigger than its smallest.
  const floor = before.packages.length > 0 ? Math.min(...before.packages.map(item => item.bytes)) : 0
  return bundle.packages
    .map(item => ({ name: item.name, bytes: item.bytes - (before.packages.find(old => old.name === item.name)?.bytes ?? floor) }))
    .filter(item => item.bytes > 0)
    .toSorted((a, b) => b.bytes - a.bytes)
    .slice(0, 3)
}

/** Each bundle given a budget against its size, with what grew when it is over. A bundle the run did not measure has no check. */
export function checkBudgets(bundles: readonly BundleReport[], limits: Partial<Record<BundleId, number>>, previous: AnalyzeReport | null = null): BudgetCheck[] {
  return bundles.flatMap((bundle): BudgetCheck[] => {
    const limit = limits[bundle.id]
    if (limit === undefined) return []
    const over = bundle.bytes > limit
    return [{ bundle: bundle.id, flag: BUDGET_FLAGS[bundle.id], limit, bytes: bundle.bytes, over, grew: over ? growth(bundle, previous?.bundles.find(old => old.id === bundle.id)) : [] }]
  })
}

/** Where the last run is kept: the project's tool cache, which no version control tracks. */
export function lastRunPath(rootDir: string): string {
  return join(rootDir, 'node_modules', '.cache', 'nuxt-backend', 'analyze.json')
}

/** The last run on disk, or null when there is none or it does not read. */
export function readLastRun(rootDir: string): AnalyzeReport | null {
  try {
    const report = JSON.parse(readFileSync(lastRunPath(rootDir), 'utf-8')) as Partial<AnalyzeReport>
    return report.version === 1 && Array.isArray(report.bundles) && typeof report.ranAt === 'string' ? report as AnalyzeReport : null
  }
  catch {
    return null
  }
}

/**
 * Keep a run on disk. A run of one half keeps the other half's bundles from
 * the run before, so `analyze --only nuxt` leaves what `doctor` knows of the
 * Convex bundle alone. Best effort: a project with no `node_modules` has no
 * cache to write to.
 */
export function saveLastRun(rootDir: string, report: AnalyzeReport): void {
  try {
    const before = readLastRun(rootDir)
    const measured = new Set(report.bundles.map(bundle => bundle.id))
    const kept = before?.bundles.filter(bundle => !measured.has(bundle.id)) ?? []
    const merged: AnalyzeReport = { ...report, bundles: [...report.bundles, ...kept].toSorted((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id)) }
    const path = lastRunPath(rootDir)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify(merged, null, 2)}\n`)
  }
  catch {
    // Nothing to remember it in; the report was printed all the same.
  }
}

const ORDER: readonly BundleId[] = ['convex', 'client', 'server']

const LOCKFILES = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lock', 'bun.lockb']

/** Whether an install changed since the run: a lockfile newer than it, so the duplicates it found may be gone. */
export function installChangedSince(rootDir: string, ranAt: string): boolean {
  const ran = Date.parse(ranAt)
  if (Number.isNaN(ran)) return true
  return LOCKFILES.some((file) => {
    try {
      return statSync(join(rootDir, file)).mtimeMs > ran
    }
    catch {
      return false
    }
  })
}

function bundleLines(bundle: BundleReport): string[] {
  const size = [
    `${formatSize(bundle.bytes)} of code`,
    ...bundle.gzipBytes !== undefined ? [`${formatSize(bundle.gzipBytes)} gzipped`] : [],
    ...bundle.sourceMapBytes !== undefined ? [`${formatSize(bundle.sourceMapBytes)} of source maps`] : [],
  ].join(' · ')
  const lines = [bundle.title, `  ${size}`, '']
  lines.push('  Who brings it')
  for (const share of bundle.shares) lines.push(`    ${share.label.padEnd(16)} ${formatSize(share.bytes).padStart(9)}  ${formatShare(share.bytes, bundle.bytes).padStart(4)}`)
  if (bundle.parts.length > 0) {
    lines.push('', '  Largest components')
    for (const part of bundle.parts) lines.push(`    ${part.name.padEnd(28)} ${formatSize(part.bytes).padStart(9)}`)
  }
  lines.push('', '  Largest packages')
  for (const item of bundle.packages) lines.push(`    ${(item.version ? `${item.name}@${item.version}` : item.name).padEnd(28)} ${formatSize(item.bytes).padStart(9)}`)
  for (const note of bundle.notes) lines.push('', `  Note: ${note}`)
  return lines
}

function insightLines(report: AnalyzeReport): string[] {
  const insights = report.bundles.flatMap(bundle => bundle.insights.map(insight => ({ bundle, insight })))
    .toSorted((a, b) => (a.insight.level === b.insight.level ? 0 : a.insight.level === 'warn' ? -1 : 1) || b.insight.savedBytes - a.insight.savedBytes)
  if (insights.length === 0) return ['Insights', '  None: nothing to shrink that the analysis can see.']
  return ['Insights', ...insights.flatMap(({ bundle, insight }) => [
    `  ${insight.level === 'warn' ? '⚠' : '·'} [${bundle.id}] ${insight.title}${insight.savedBytes > 0 ? ` (saves about ${formatSize(insight.savedBytes)})` : ''}`,
    ...insight.detail ? [`      ${insight.detail}`] : [],
  ])]
}

function budgetLines(report: AnalyzeReport): string[] {
  if (report.budgets.length === 0) return []
  return ['', 'Budgets', ...report.budgets.map(budget =>
    `  ${budget.over ? '✗' : '✓'} ${budget.bundle}: ${formatSize(budget.bytes)} of code, ${budget.over ? `${formatSize(budget.bytes - budget.limit)} over` : 'within'} ${budget.flag} ${formatSize(budget.limit)}`)]
}

/** The report as lines of text: a section per bundle, then the insights, the budgets and what was not measured. */
export function formatReport(report: AnalyzeReport): string[] {
  return [
    ...report.bundles.flatMap(bundle => [...bundleLines(bundle), '']),
    ...insightLines(report),
    ...budgetLines(report),
    ...report.failures.length > 0 ? ['', 'Not measured', ...report.failures.map(failure => `  ✗ ${failure.half}: ${failure.message}`)] : [],
  ]
}

/** What went over a budget, one line each, for the error output: what grew since the last run, else the largest package. */
export function budgetFailures(report: AnalyzeReport): string[] {
  return report.budgets.filter(budget => budget.over).map((budget) => {
    const bundle = report.bundles.find(candidate => candidate.id === budget.bundle)
    const biggest = bundle?.packages.find(item => item.name !== 'your code') ?? bundle?.packages[0]
    const grew = budget.grew.map(item => `${item.name} (+${formatSize(item.bytes)})`).join(', ')
    const cause = grew ? `; since the last run it grew in ${grew}` : biggest ? `; its largest package is ${biggest.name} at ${formatSize(biggest.bytes)}` : ''
    return `${budget.bundle} bundle is ${formatSize(budget.bytes)}, ${formatSize(budget.bytes - budget.limit)} over ${budget.flag} ${formatSize(budget.limit)}${cause}`
  })
}
