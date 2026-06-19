import { customCtx, customMutation } from 'convex-helpers/server/customFunctions'
import type { Triggers } from 'convex-helpers/server/triggers'
import type { FunctionVisibility, GenericDataModel, MutationBuilder } from 'convex/server'

/**
 * Re-exports for the {@link https://www.convex.dev/components/aggregate |
 * Aggregate} component, so consumers configure denormalized counts/sums from a
 * single import. Construct one `TableAggregate` per app-mounted aggregate
 * instance and keep it in sync with {@link Triggers}.
 */
export { TableAggregate } from '@convex-dev/aggregate'
export type { Change, TableAggregateType, Trigger } from '@convex-dev/aggregate'
export { customCtx, customMutation } from 'convex-helpers/server/customFunctions'
export { Triggers } from 'convex-helpers/server/triggers'

/**
 * Wrap a raw `mutation`/`internalMutation` builder so every write
 * automatically fires the registered {@link Triggers} (e.g. to keep a
 * `TableAggregate` in sync) — no manual `insert`/`delete`/`replace` calls.
 *
 * @example
 * ```ts
 * import { TableAggregate, Triggers, withTriggers } from 'nuxt-backend/convex/aggregate'
 * import { components } from './_generated/api'
 * import { mutation as rawMutation } from './_generated/server'
 * import type { DataModel } from './_generated/dataModel'
 *
 * export const messagesCount = new TableAggregate<{ Key: null, DataModel: DataModel, TableName: 'messages' }>(
 *   components.messagesCount,
 *   { sortKey: () => null },
 * )
 *
 * const triggers = new Triggers<DataModel>()
 * triggers.register('messages', messagesCount.trigger())
 *
 * export const mutation = withTriggers(rawMutation, triggers)
 * ```
 */
export function withTriggers<
  DataModel extends GenericDataModel,
  Visibility extends FunctionVisibility,
>(
  rawMutation: MutationBuilder<DataModel, Visibility>,
  triggers: Triggers<DataModel>,
) {
  return customMutation(rawMutation, customCtx(triggers.wrapDB))
}
