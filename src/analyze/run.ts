// One `analyze` run: the halves measured side by side, the budgets checked
// against what they found, and the result kept for `doctor`.

import { analyzeConvex } from './convex'
import { analyzeNuxt } from './nuxt'
import { BUDGET_FLAGS, checkBudgets, readLastRun, saveLastRun } from './report'
import type { AnalyzeFailure, AnalyzeHalf, AnalyzeReport, BundleId, BundleReport } from './types'

export interface AnalyzeOptions {
  /** One half only; both when absent. */
  only?: AnalyzeHalf
  /** A budget per bundle, in bytes. */
  limits?: Partial<Record<BundleId, number>>
}

/** What a run measures with; replaced in tests. */
export interface AnalyzeDeps {
  convex?: (rootDir: string) => Promise<BundleReport>
  nuxt?: (rootDir: string) => Promise<BundleReport[]>
  now?: () => Date
  /** Told as each half starts. */
  print?: (line: string) => void
}

/** The halves a run measures: `--only` narrows it. */
export function halvesOf(only: AnalyzeHalf | undefined): AnalyzeHalf[] {
  return only ? [only] : ['convex', 'nuxt']
}

const message = (error: unknown): string => error instanceof Error ? error.message : String(error)

/**
 * A budget the run could not check: its bundle was not measured, though its
 * half ran (a build that wrote no server stats). A failure, so a CI gate on
 * it never passes unchecked; a half that failed already says why.
 */
function unchecked(limits: Partial<Record<BundleId, number>>, bundles: readonly BundleReport[], failed: readonly AnalyzeFailure[]): AnalyzeFailure[] {
  return (Object.keys(limits) as BundleId[]).flatMap((id) => {
    const half: AnalyzeHalf = id === 'convex' ? 'convex' : 'nuxt'
    if (bundles.some(bundle => bundle.id === id) || failed.some(failure => failure.half === half)) return []
    return [{ half, message: `the run measured no ${id} bundle, so ${BUDGET_FLAGS[id]} was not checked` }]
  })
}

/**
 * Measure the app. A half that cannot run is a failure in the report, not a
 * throw: the other half is still measured and printed. The run is kept on
 * disk for `doctor`, whatever the budgets say.
 */
export async function runAnalyze(rootDir: string, options: AnalyzeOptions = {}, deps: AnalyzeDeps = {}): Promise<AnalyzeReport> {
  const print = deps.print ?? (() => {})
  const convex = deps.convex ?? analyzeConvex
  const nuxt = deps.nuxt ?? analyzeNuxt
  const halves = halvesOf(options.only)
  const previous = readLastRun(rootDir)

  const settled = await Promise.all(halves.map(async (half): Promise<{ half: AnalyzeHalf, bundles: BundleReport[] } | AnalyzeFailure> => {
    print(half === 'convex' ? '[nuxt-backend] analyze → bundling the backend\'s functions' : '[nuxt-backend] analyze → building the Nuxt app (this takes a while)')
    try {
      return { half, bundles: half === 'convex' ? [await convex(rootDir)] : await nuxt(rootDir) }
    }
    catch (error) {
      return { half, message: message(error) }
    }
  }))

  const bundles = settled.flatMap(result => 'bundles' in result ? result.bundles : [])
  const failed = settled.filter((result): result is AnalyzeFailure => 'message' in result)
  const failures = [...failed, ...unchecked(options.limits ?? {}, bundles, failed)]
  const report: AnalyzeReport = {
    version: 1,
    ranAt: (deps.now?.() ?? new Date()).toISOString(),
    bundles,
    budgets: checkBudgets(bundles, options.limits ?? {}, previous),
    failures,
  }
  if (bundles.length > 0) saveLastRun(rootDir, report)
  return report
}
