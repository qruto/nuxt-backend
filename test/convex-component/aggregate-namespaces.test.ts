import { convexTest } from 'convex-test'
import { componentsGeneric, defineSchema, defineTable, makeFunctionReference, mutationGeneric, type GenericDataModel } from 'convex/server'
import { v } from 'convex/values'
import { describe, expect, test } from 'vitest'
import aggregateTest from '@convex-dev/aggregate/test'
import { TableAggregate, Triggers, withTriggers } from '../../src/convex/integrations/aggregate'

// Two aggregates over one table on ONE component mount — the shape the docs
// site's playground uses for a live count and a live character sum. Their
// entries are (key, document id) in one B-tree per namespace, so without a
// namespace apart both triggers insert the same pair.
const schema = defineSchema({ messages: defineTable({ text: v.string() }) })
const components = componentsGeneric() as unknown as { aggregate: ConstructorParameters<typeof TableAggregate>[0] }

function setup(separateNamespace: boolean) {
  const count = new TableAggregate<{ Key: null, DataModel: GenericDataModel, TableName: 'messages' }>(
    components.aggregate,
    { sortKey: () => null },
  )
  const size = separateNamespace
    ? new TableAggregate<{ Namespace: 'size', Key: null, DataModel: GenericDataModel, TableName: 'messages' }>(
        components.aggregate,
        { namespace: () => 'size', sortKey: () => null, sumValue: doc => (doc.text as string).length },
      )
    : new TableAggregate<{ Key: null, DataModel: GenericDataModel, TableName: 'messages' }>(
        components.aggregate,
        { sortKey: () => null, sumValue: doc => (doc.text as string).length },
      )
  const triggers = new Triggers<GenericDataModel>()
  triggers.register('messages', count.trigger())
  triggers.register('messages', size.trigger())
  const insert = withTriggers(mutationGeneric, triggers)({
    args: { text: v.string() },
    handler: (ctx, { text }) => ctx.db.insert('messages', { text }),
  })
  // convex-test finds the functions root from a `_generated/` entry; a stub will do.
  const t = convexTest(schema, { './_generated/api.js': async () => ({}), './messages.ts': async () => ({ insert }) })
  aggregateTest.register(t)
  return { t, count, size, insert: makeFunctionReference<'mutation'>('messages:insert') }
}

describe('two aggregates over one table on one mount', () => {
  test('sharing a namespace, the second trigger insert collides and the write fails', async () => {
    const { t, insert } = setup(false)
    await expect(t.mutation(insert, { text: 'hello' })).rejects.toThrow(/already exists/)
  })

  test('in separate namespaces, both stay in step', async () => {
    const { t, insert, count, size } = setup(true)
    await t.mutation(insert, { text: 'hello' })
    await t.mutation(insert, { text: 'hi' })
    await t.run(async (ctx) => {
      expect(await count.count(ctx)).toBe(2)
      expect(await (size as TableAggregate<{ Namespace: 'size', Key: null, DataModel: GenericDataModel, TableName: 'messages' }>).sum(ctx, { namespace: 'size' })).toBe(7)
    })
  })
})
