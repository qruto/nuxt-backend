import {
  type DocumentByName,
  type FieldTypeFromFieldPath,
  type GenericDataModel,
  type GenericMutationCtx,
  type IndexNames,
  makeFunctionReference,
  type MutationBuilder,
  type NamedIndex,
  type NamedTableInfo,
  type RegisteredMutation,
  type TableNamesInDataModel,
} from 'convex/server'
import { v } from 'convex/values'
import { logBackend } from '../log.js'

/** Rows one batch deletes when the rule says nothing. */
export const DEFAULT_RETENTION_BATCH = 100

/** The time field of the index every table has, in order of creation. */
const CREATION_TIME_INDEX = 'by_creation_time'

/** The fields of an index `table` is read through: its leading fields, in order, are the ones a rule can `match`. */
type IndexFields<DM extends GenericDataModel, T extends TableNamesInDataModel<DM>, I extends IndexNames<NamedTableInfo<DM, T>>> = NamedIndex<NamedTableInfo<DM, T>, I>[number]

/** What a pass reports: the rows it deleted, and whether rows past the age are left for the next batch. */
export interface RetentionResult {
  /** The rows this batch deleted. */
  deleted: number
  /** Whether the batch left rows past the age: the pass has scheduled its next batch. */
  more: boolean
}

/** What a rule's internal mutation takes. */
export type RetentionArgs = {
  /** The pass's clock, in epoch milliseconds: the current time by default. A test passes it to move time without fake timers. */
  now?: number
}

/** The options of {@link defineRetention}. */
export interface RetentionOptions<
  DM extends GenericDataModel,
  T extends TableNamesInDataModel<DM>,
  I extends IndexNames<NamedTableInfo<DM, T>>,
> {
  /** The rule's own function path, as `npx convex run` takes it, such as `'retention:pruneDrafts'`. A batch that leaves rows behind schedules it again. */
  fn: string
  /** The table to prune. Its rows are typed from your schema. */
  table: T
  /**
   * The index to read through, named by its fields as Convex's guidelines
   * ask (`by_status_and_updatedAt`): the rule reads the fields from the
   * name. The field after any `match` fields holds the time; `by_creation_time`
   * uses `_creationTime`.
   */
  index: I
  /** Equal values for the index's leading fields, in the index's order. */
  match?: { [F in IndexFields<DM, T, I>]?: FieldTypeFromFieldPath<DocumentByName<DM, T>, F & string> }
  /** How old a row may get, in milliseconds, on the index's time field. `0` deletes a row once that time has passed, for an `expiresAt` field. */
  ttl: number
  /** Rows per transaction. Lower it for large rows or a heavy `onDelete`. Defaults to 100. */
  batch?: number
  /** Runs before each row is deleted, in the same transaction. */
  onDelete?: (ctx: GenericMutationCtx<DM>, row: DocumentByName<DM, T>) => void | Promise<void>
}

/** The query builder and index range, with the index and its fields named at run time: the types above check them against the schema. */
interface ByIndex<Row> {
  withIndex: (index: string, range: (q: IndexRangeLoose) => IndexRangeLoose) => { take: (count: number) => Promise<Array<Row & { _id: never }>> }
}
interface IndexRangeLoose {
  eq: (field: string, value: unknown) => IndexRangeLoose
  lt: (field: string, value: number) => IndexRangeLoose
}

/** The fields a name like `by_status_and_updatedAt` stands for. */
function fieldsOfIndex(index: string): string[] {
  if (index === CREATION_TIME_INDEX) return ['_creationTime']
  const named = /^by_(.+)$/.exec(index)?.[1]
  return named ? named.split('_and_') : []
}

/** What a rule's options must satisfy, checked when the module loads so a deploy refuses a broken rule. */
function checkRule(options: { fn: string, table: string, index: string, match?: Record<string, unknown>, ttl: number, batch?: number }): { matched: Array<[string, unknown]>, timeField: string, batch: number } {
  const rule = `defineRetention (${options.fn})`
  if (!/^[\w./-]+:\w+$/.test(options.fn)) {
    throw new TypeError(`[nuxt-backend] ${rule}: "fn" is the rule's own function path as \`npx convex run\` takes it, such as 'retention:pruneDrafts'.`)
  }
  if (typeof options.ttl !== 'number' || !Number.isFinite(options.ttl) || options.ttl < 0) {
    throw new TypeError(`[nuxt-backend] ${rule}: "ttl" is a number of milliseconds from 0, such as 30 * DAY.`)
  }
  const batch = options.batch ?? DEFAULT_RETENTION_BATCH
  if (!Number.isInteger(batch) || batch < 1) {
    throw new TypeError(`[nuxt-backend] ${rule}: "batch" is a whole number of rows from 1.`)
  }
  const fields = fieldsOfIndex(options.index)
  const matched = Object.entries(options.match ?? {})
  const leading = fields.slice(0, matched.length)
  const timeField = fields[matched.length]
  if (!timeField || matched.some(([field], position) => field !== leading[position])) {
    const expected = matched.length ? `by_${[...matched.map(([field]) => field), 'updatedAt'].join('_and_')}` : 'by_updatedAt'
    throw new TypeError(`[nuxt-backend] ${rule}: the rule reads the fields of "${options.index}" from its name, and \`match\` (${matched.map(([field]) => field).join(', ') || 'none'}) must be its leading fields, in order, followed by the time field. Name the index by its fields, such as "${expected}".`)
  }
  return { matched, timeField, batch }
}

/**
 * Delete a table's rows once they pass an age, a batch per transaction,
 * until none is left. Returns the rule's internal mutation: export it from
 * a file in `backend/`, and start it from a cron (`crons.cron(...,
 * internal.retention.pruneDrafts, {})`).
 *
 * A pass fixes its cutoff when it starts (the current time minus `ttl`), so
 * it always ends: each batch reads up to `batch` rows older than the cutoff
 * through `index`, runs `onDelete` for each and deletes it, all in one
 * transaction, and a batch that leaves rows behind schedules the next one
 * through the rule's own `fn`, carrying the same clock. A batch that throws
 * rolls back, ends the pass and logs `retention.batch_failed` with the table
 * and the row; the next pass retries from the same oldest rows.
 *
 * Pass the builder your other writes use: when an aggregate counts the table,
 * that is the trigger-wrapped `internalMutation`, so a pruned row leaves the
 * count too.
 *
 * The mutation takes an optional `{ now }` (epoch milliseconds) and returns
 * `{ deleted, more }`.
 *
 * @guarantee A pass ends: its cutoff is fixed when it starts.
 * @guarantee `onDelete` and the delete of its row are one transaction: both happen or neither does.
 * @guarantee Rows are read through an index, never scanned, so a batch reads at most `batch + 1` rows.
 * @guarantee A row whose time field is missing sorts first and is deleted on the first pass.
 *
 * @throws TypeError when `fn`, `ttl`, `batch` or `index` is malformed, as the module loads.
 *
 * @example
 * ```ts
 * // backend/retention.ts
 * import { defineRetention } from 'nuxt-backend/functions'
 * import { DAY } from 'nuxt-backend/rate-limit'
 * import { internalMutation } from './_generated/server'
 *
 * export const pruneDrafts = defineRetention(internalMutation, {
 *   fn: 'retention:pruneDrafts',
 *   table: 'strips',
 *   index: 'by_status_and_updatedAt',
 *   match: { status: 'draft' },
 *   ttl: 30 * DAY,
 * })
 * ```
 */
export function defineRetention<
  DM extends GenericDataModel,
  T extends TableNamesInDataModel<DM>,
  I extends IndexNames<NamedTableInfo<DM, T>>,
>(
  internalMutation: MutationBuilder<DM, 'internal'>,
  options: RetentionOptions<DM, T, I>,
): RegisteredMutation<'internal', RetentionArgs, Promise<RetentionResult>> {
  const { fn, table, onDelete } = options
  const { matched, timeField, batch } = checkRule({ ...options, table: table as string, index: options.index as string, match: options.match as Record<string, unknown> | undefined })
  const next = makeFunctionReference<'mutation', { now: number }>(fn)

  const define = internalMutation as unknown as (definition: {
    args: { now: ReturnType<typeof v.optional<ReturnType<typeof v.number>>> }
    returns: ReturnType<typeof v.object<{ deleted: ReturnType<typeof v.number>, more: ReturnType<typeof v.boolean> }>>
    handler: (ctx: GenericMutationCtx<DM>, args: RetentionArgs) => Promise<RetentionResult>
  }) => RegisteredMutation<'internal', RetentionArgs, Promise<RetentionResult>>

  return define({
    args: { now: v.optional(v.number()) },
    returns: v.object({ deleted: v.number(), more: v.boolean() }),
    handler: async (ctx, { now = Date.now() }) => {
      const cutoff = now - options.ttl
      // One row past the batch says whether another batch is wanted, so a pass that ends on a full batch does not run an empty one.
      const found = await (ctx.db.query(table) as unknown as ByIndex<DocumentByName<DM, T>>).withIndex(options.index as string, (q) => {
        let range = q
        for (const [field, value] of matched) range = range.eq(field, value)
        return range.lt(timeField, cutoff)
      }).take(batch + 1)
      const rows = found.slice(0, batch)
      for (const row of rows) {
        try {
          await onDelete?.(ctx, row)
          await ctx.db.delete(table, row._id)
        }
        catch (error) {
          logBackend('error', 'retention.batch_failed', `The ${fn} pass could not delete the ${table} row ${String(row._id)}: its batch rolled back and the pass ends. The next pass retries.`, error)
          throw error
        }
      }
      const more = found.length > batch
      if (more) await ctx.scheduler.runAfter(0, next, { now })
      return { deleted: rows.length, more }
    },
  })
}
