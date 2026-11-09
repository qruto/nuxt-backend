import { ConvexCliError, runConvex } from '../../convex-cli'
import { RESYNC_ENTITLEMENTS_FUNCTION } from '../../convex/constants'
import { deploymentFlags } from '../../env-push'

// `billing resync`: every billing entity's entitlements read again from the
// provider into the deployment's cache, through the scaffold's
// `billing:resyncEntitlements`. It starts the sweep and returns: the
// deployment pages its entities and reads them in turn, paced under the
// provider's rate limit, so a large app finishes after the command does;
// each entity it gives up on is logged (`billing.resync_failed`), and the
// last run logs the tally (`billing.resync_done`). With `--entity` it
// reads the entities it names instead, one at a time, and waits for each:
// the way for an app whose own `resolveEntity` bills entities of its own,
// which the deployment cannot page, and for the ones a sweep gave up on.

/** One entity `--entity` named: read again, left alone while an erasure deletes it, or given up on after the provider kept refusing it. */
export interface ResyncedEntity { id: string, outcome: 'synced' | 'gone' | 'failed' }

/** What `billing resync --json` prints. */
export interface BillingResyncReport {
  deployment: 'dev' | 'production'
  /**
   * `queued`: the first page of entities is queued, and with `more` the
   * pages after it follow on the deployment's scheduler; `synced`: each
   * entity `--entity` named was read again (`entities`);
   * `custom_entities`: the app bills entities of its own, which only
   * `--entity` reaches; `refused`: the command ran nothing (`note` says
   * why); `missing`: the deployment's `billing.ts` does not export
   * `resyncEntitlements` (an app scaffolded before it); `failed`: the
   * deployment refused or did not answer, or gave up on an entity
   * `--entity` named (`entities` says which).
   */
  status: 'queued' | 'synced' | 'custom_entities' | 'refused' | 'missing' | 'failed'
  /** Billing entities queued from the first page. */
  queued: number
  /** More pages follow the first, on the deployment's scheduler. */
  more: boolean
  /** The entities `--entity` named that were read, in order; empty for a sweep. */
  entities: ResyncedEntity[]
  /** Why it was refused, is missing or failed, and what to do. */
  note?: string
}

/** How long the sweep's start takes: one page read and handed on. */
const RESYNC_TIMEOUT_MS = 120_000

/**
 * How long one entity's read may take: its tries wait as long as the
 * provider's rate limit asks, within the deployment's five minutes for one
 * entity, which gives up rather than wait past them.
 */
const ENTITY_TIMEOUT_MS = 360_000

/** The most entities `--entity` names in one run: each is a `convex run` of its own. */
export const RESYNC_ENTITY_MAX = 100

/** The line that adds the export to an app scaffolded before it. */
const MISSING_NOTE = 'the deployment has no billing:resyncEntitlements: its backend/billing.ts was scaffolded before it. Add `resyncEntitlements` to the names billing.ts re-exports from `billing.api`, push the backend (npx convex dev, or deploy), then run billing resync again.'

/** What a sweep of an app with entities of its own says to do instead. */
const CUSTOM_NOTE = 'this app bills entities of its own (billTo: \'user\' with its own resolveEntity), which the deployment cannot list, so nothing was queued. Name them: npx nuxt-backend billing resync --entity <id>[,<id>…], at most 100 at a time.'

/** `convex run` named a function the deployment does not have. */
function missingFunction(error: unknown): boolean {
  return error instanceof ConvexCliError ? error.missingFunction : /could not find function/i.test(String(error))
}

/** The report of a run that did not start: a refusal, before anything ran. */
export function resyncRefused(prod: boolean, note: string): BillingResyncReport {
  return { deployment: prod ? 'production' : 'dev', status: 'refused', queued: 0, more: false, entities: [], note }
}

/** Why the ids `--entity` names may not run, or null. */
export function resyncEntityRefusal(ids: readonly string[]): string | null {
  if (ids.length === 0) return 'name at least one billing entity id: --entity <id>[,<id>…].'
  if (ids.length > RESYNC_ENTITY_MAX) return `at most ${RESYNC_ENTITY_MAX} entities at a time.`
  return null
}

/** What a sweep's answer makes of the report: the first page queued, or entities only the app can name. */
type SweepFields = Pick<BillingResyncReport, 'status' | 'queued' | 'more'> & { note?: string }

/** The sweep's answer (`{ queued, more }`, or `'custom_entities'`) as the report's fields. */
function sweepFields(answer: unknown): SweepFields {
  if (answer === 'custom_entities') return { status: 'custom_entities', queued: 0, more: false, note: CUSTOM_NOTE }
  const page = (typeof answer === 'object' && answer !== null ? answer : {}) as { queued?: unknown, more?: unknown }
  return { status: 'queued', queued: typeof page.queued === 'number' ? page.queued : 0, more: page.more === true }
}

/** Why a run stopped, as the report's fields: the export missing, or the deployment refusing. */
function failureFields(error: unknown, prod: boolean): Pick<BillingResyncReport, 'status' | 'note'> {
  if (missingFunction(error)) return { status: 'missing', note: MISSING_NOTE }
  const why = error instanceof Error ? error.message : String(error)
  return { status: 'failed', note: `the ${prod ? 'production' : 'dev'} deployment refused the resync (${why}). A deployment without BILLING_ACCESS_TOKEN has no provider to read: run npx nuxt-backend env push${prod ? ' --prod' : ''} first.` }
}

/**
 * Queue every billing entity's entitlement resync on the deployment
 * (`billing:resyncEntitlements '{}'`), and say what the first page queued;
 * with `entities`, read each of those again instead, one at a time. The
 * entities read before a refusal stay in the report.
 */
export async function runBillingResync(rootDir: string, { prod, entities = [] }: { prod: boolean, entities?: readonly string[] }, run: typeof runConvex = runConvex): Promise<BillingResyncReport> {
  const base = { deployment: prod ? 'production' : 'dev', queued: 0, more: false } as const
  const call = async (args: Record<string, string>): Promise<unknown> =>
    JSON.parse((await run(rootDir, ['run', ...deploymentFlags({ prod }), RESYNC_ENTITLEMENTS_FUNCTION, JSON.stringify(args)], { timeout: args.entityId ? ENTITY_TIMEOUT_MS : RESYNC_TIMEOUT_MS })).stdout)
  const read: ResyncedEntity[] = []
  try {
    if (entities.length === 0) return { ...base, entities: read, ...sweepFields(await call({})) }
    for (const id of entities) {
      const answer = await call({ entityId: id })
      read.push({ id, outcome: answer === 'gone' || answer === 'failed' ? answer : 'synced' })
    }
    const failed = read.filter(entity => entity.outcome === 'failed').map(entity => entity.id)
    if (failed.length > 0) return { ...base, status: 'failed', entities: read, note: `the provider kept refusing ${failed.join(', ')}, so ${failed.length === 1 ? 'its' : 'their'} entitlements were not read again (billing.resync_failed in the deployment's logs). Run billing resync --entity ${failed.join(',')} again in a minute.` }
    return { ...base, status: 'synced', entities: read }
  }
  catch (error) {
    return { ...base, entities: read, ...failureFields(error, prod) }
  }
}

/** `count` billing entities, as a person reads it. */
function entitiesOf(count: number): string {
  return `${count} billing ${count === 1 ? 'entity' : 'entities'}`
}

/** The report as the lines a person reads. */
export function resyncLines(report: BillingResyncReport): string[] {
  if (report.status === 'queued') {
    const rest = report.more ? ', and more pages after it' : ''
    const logs = `npx convex logs${report.deployment === 'production' ? ' --prod' : ''} --history 100`
    return [
      `[nuxt-backend] billing resync: started on the ${report.deployment} deployment, ${entitiesOf(report.queued)} on its first page${rest}. It reads them in turn, at most one a second, waiting as long as the provider's rate limit asks.`,
      `[nuxt-backend] billing resync: the deployment logs each entity it gives up on (billing.resync_failed) and, at the end, how many were read (billing.resync_done): ${logs}. Wait for that last line before running it again: a second sweep runs beside the first, and doubles the requests.`,
    ]
  }
  if (report.status !== 'synced') return [...readLines(report), `[nuxt-backend] billing resync${report.status === 'refused' ? ' refused' : ''}: ${report.note}`]
  return readLines(report)
}

/** What `--entity` read: the entities read again, and the ones an erasure is deleting; nothing for a sweep. */
function readLines(report: BillingResyncReport): string[] {
  if (report.entities.length === 0) return []
  const synced = report.entities.filter(entity => entity.outcome === 'synced').length
  const gone = report.entities.filter(entity => entity.outcome === 'gone').map(entity => entity.id)
  return [
    `[nuxt-backend] billing resync: read the entitlements of ${entitiesOf(synced)} again on the ${report.deployment} deployment.`,
    ...gone.length ? [`[nuxt-backend] billing resync: left ${gone.join(', ')} alone: an erasure is deleting ${gone.length === 1 ? 'it' : 'them'}.`] : [],
  ]
}
