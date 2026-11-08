/**
 * `nuxt-backend upgrade`'s workpool half: `@convex-dev/workpool`'s one-off
 * backfill (`migrations:backfillPendingStartIds`), which records on each
 * piece of queued work the start entry it waits on. Work enqueued before
 * the pool recorded it lacks it, and the workpool's 0.5 line expects it,
 * so every pool runs the backfill before an app moves there: the app's own
 * (`workpool`), and the ones other components mount inside themselves
 * (the email component's, the workflow component's, the backend
 * component's waitlist mirror). The deployment lists its component paths
 * when `convex run --component` names one it does not mount; each path is
 * asked for the backfill, and one without it (not a pool, or a pool from
 * before it) is left out. The backfill schedules its own pages and
 * returns, so a large queue finishes after the command does.
 */
import { ConvexCliError, runConvex } from '../../convex-cli'
import { deploymentFlags } from '../../env-push'

/** The workpool's backfill, by its module name inside each pool. */
export const POOL_BACKFILL = 'migrations:backfillPendingStartIds'

/** A component path no deployment mounts: the listing's probe. */
const PROBE = '__nuxt_backend_component_listing__'

/** The workpool mounts a batch worker of this name under itself: never a pool, so never asked. */
const BATCH_WORKER = 'batchWorker'

/** How many pools are asked at once. */
const CONCURRENCY = 4

/** Where the workpool half ended. */
export interface PoolsReport {
  /**
   * `started`: the backfill runs on every pool in `pools`; `none`: the
   * deployment mounts no pool that has it (one from before it, or none
   * at all); `pending`: a dry run; `skipped`: the deployment did not
   * answer, or was not reached; `failed`: a pool refused it.
   */
  state: 'started' | 'none' | 'pending' | 'skipped' | 'failed'
  /** The component paths the backfill started on. */
  pools: string[]
  /** The pools that refused it, and why. */
  failed: Array<{ component: string, reason: string }>
  /** Why it was skipped or pending. */
  reason?: string
}

/** The component paths the deployment mounts, or why they could not be read. */
async function listComponents(rootDir: string, prod: boolean, run: typeof runConvex): Promise<string[] | { reason: string }> {
  try {
    await run(rootDir, ['run', ...deploymentFlags({ prod }), '--component', PROBE, '--inline-query', 'return null'], { timeout: 60_000 })
  }
  catch (error) {
    if (error instanceof ConvexCliError && error.components) return error.components
    return { reason: `the deployment did not list its components: ${error instanceof Error ? error.message : String(error)}` }
  }
  return { reason: 'the deployment did not list its components' }
}

/** What one component answered: the backfill started, no such function, or a refusal. */
async function backfill(rootDir: string, component: string, prod: boolean, run: typeof runConvex): Promise<'started' | 'absent' | { reason: string }> {
  try {
    await run(rootDir, ['run', ...deploymentFlags({ prod }), '--component', component, POOL_BACKFILL, '{}'], { timeout: 60_000 })
    return 'started'
  }
  catch (error) {
    if (error instanceof ConvexCliError && error.missingFunction) return 'absent'
    return { reason: error instanceof Error ? error.message : String(error) }
  }
}

/** `items` through `task`, `limit` at a time, the results in order. */
async function inBatches<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  for (let start = 0; start < items.length; start += limit) {
    results.push(...await Promise.all(items.slice(start, start + limit).map(task)))
  }
  return results
}

/**
 * Start the workpool backfill on every pool the deployment mounts. A dry
 * run starts nothing and lists nothing: it says the backfill is pending.
 */
export async function backfillPools(rootDir: string, { prod, dryRun }: { prod: boolean, dryRun: boolean }, run: typeof runConvex = runConvex): Promise<PoolsReport> {
  if (dryRun) return { state: 'pending', pools: [], failed: [], reason: `a dry run starts nothing: upgrade runs ${POOL_BACKFILL} on every workpool the deployment mounts` }
  const components = await listComponents(rootDir, prod, run)
  if (!Array.isArray(components)) return { state: 'skipped', pools: [], failed: [], reason: components.reason }
  const candidates = components.filter(path => path.split('/').at(-1) !== BATCH_WORKER)
  const answers = await inBatches(candidates, CONCURRENCY, component => backfill(rootDir, component, prod, run))
  const pools = candidates.filter((_, index) => answers[index] === 'started')
  const failed = candidates.flatMap((component, index) => {
    const answer = answers[index]
    return typeof answer === 'object' ? [{ component, reason: answer.reason }] : []
  })
  return { state: failed.length > 0 ? 'failed' : pools.length > 0 ? 'started' : 'none', pools, failed }
}
