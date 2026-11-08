import { ConvexCliError, runConvex } from '../../convex-cli'
import { RESYNC_ENTITLEMENTS_FUNCTION } from '../../convex/constants'
import { deploymentFlags } from '../../env-push'

// `billing resync`: every billing entity's entitlements read again from the
// provider into the deployment's cache, through the scaffold's
// `billing:resyncEntitlements`. It queues the work and returns: the
// deployment pages its entities and reads each one on the free plan's
// queue, so a large app finishes after the command does.

/** What `billing resync --json` prints. */
export interface BillingResyncReport {
  deployment: 'dev' | 'production'
  /**
   * `queued`: the first page of entities is queued, and with `more` the
   * pages after it follow on the deployment's scheduler; `missing`: the
   * deployment's `billing.ts` does not export `resyncEntitlements` (an app
   * scaffolded before it); `failed`: the deployment refused or did not answer.
   */
  status: 'queued' | 'missing' | 'failed'
  /** Billing entities queued from the first page. */
  queued: number
  /** More pages follow the first, on the deployment's scheduler. */
  more: boolean
  /** Why it is missing or failed, and what to do. */
  note?: string
}

/** How long the first page takes to queue: a hundred workpool writes. */
const RESYNC_TIMEOUT_MS = 120_000

/** The line that adds the export to an app scaffolded before it. */
const MISSING_NOTE = 'the deployment has no billing:resyncEntitlements: its backend/billing.ts was scaffolded before it. Add `resyncEntitlements` to the names billing.ts re-exports from `billing.api`, push the backend (npx convex dev, or deploy), then run billing resync again.'

/** `convex run` named a function the deployment does not have. */
function missingFunction(error: unknown): boolean {
  return error instanceof ConvexCliError ? error.missingFunction : /could not find function/i.test(String(error))
}

/**
 * Queue every billing entity's entitlement resync on the deployment
 * (`billing:resyncEntitlements '{}'`), and say what the first page queued.
 */
export async function runBillingResync(rootDir: string, { prod }: { prod: boolean }, run: typeof runConvex = runConvex): Promise<BillingResyncReport> {
  const deployment = prod ? 'production' : 'dev'
  try {
    const { stdout } = await run(rootDir, ['run', ...deploymentFlags({ prod }), RESYNC_ENTITLEMENTS_FUNCTION, '{}'], { timeout: RESYNC_TIMEOUT_MS })
    const answer = JSON.parse(stdout) as { queued?: unknown, more?: unknown }
    return { deployment, status: 'queued', queued: typeof answer.queued === 'number' ? answer.queued : 0, more: answer.more === true }
  }
  catch (error) {
    if (missingFunction(error)) return { deployment, status: 'missing', queued: 0, more: false, note: MISSING_NOTE }
    const why = error instanceof Error ? error.message : String(error)
    return { deployment, status: 'failed', queued: 0, more: false, note: `the ${deployment} deployment refused the resync (${why}). A deployment without BILLING_ACCESS_TOKEN has no provider to read: run npx nuxt-backend env push${prod ? ' --prod' : ''} first.` }
  }
}

/** The report as the lines a person reads. */
export function resyncLines(report: BillingResyncReport): string[] {
  if (report.status !== 'queued') return [`[nuxt-backend] billing resync: ${report.note}`]
  const rest = report.more ? ', and the pages after it follow on its scheduler' : ''
  return [`[nuxt-backend] billing resync: queued ${report.queued} billing ${report.queued === 1 ? 'entity' : 'entities'} on the ${report.deployment} deployment${rest}. Each one's entitlements are read again from the provider on the free plan's queue, which retries a request the provider's rate limit refused.`]
}
