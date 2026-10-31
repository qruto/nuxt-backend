/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { convexTest, type TestConvex } from 'convex-test'
import { componentsGeneric, defineSchema, defineTable, makeFunctionReference, mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import workflowComponent from '@convex-dev/workflow/test'
import component from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { defineEmailSequence, setupWorkflows } from '../../src/convex/integrations/workflows'

// `defineEmailSequence` with a `userId`, run end to end on a sequence shaped
// like the scaffold's onboarding drip: it reads the account through the real
// auth adapter before each email, so a deleted account gets nothing and a
// changed address gets the email at the new one. The scaffold's own drip is
// held to that shape in test/unit/scaffold-parity.test.ts. The transport is an app mutation that records what it was
// handed, so the test sees exactly what the sequence sent.

const DAY = 86_400_000
const schema = defineSchema({ sent: defineTable({ to: v.string(), subject: v.string() }) })
const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const workflow = setupWorkflows(componentsGeneric() as never)
const onSignup = defineEmailSequence(workflow, {
  backend: {
    email: { send: makeFunctionReference<'mutation'>('workflows:record') },
    adapter: { findOne: components.backend.adapter.findOne },
  },
}, {
  args: { userId: v.string(), email: v.string(), name: v.string() },
  steps: [{
    after: 3 * DAY,
    email: ({ email, name }) => ({ to: email, subject: `How is it going, ${name}?`, text: 'Reply if anything is in your way.' }),
  }],
})
const record = mutationGeneric({
  args: { to: v.string(), subject: v.string(), text: v.optional(v.string()) },
  handler: async (ctx, { to, subject }) => {
    await ctx.db.insert('sent', { to, subject })
    return null
  },
})
const begin = mutationGeneric({
  args: { userId: v.string(), email: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    await workflow.start(ctx, makeFunctionReference<'mutation'>('workflows:onSignup') as never, args as never)
  },
})
const listSent = queryGeneric({ args: {}, handler: async ctx => await ctx.db.query('sent').collect() })

let t: TestConvex<typeof schema>

beforeEach(() => {
  vi.useFakeTimers()
  t = convexTest(schema, {
    './_generated/api.js': () => Promise.resolve({}),
    './workflows.js': () => Promise.resolve({ onSignup, record, begin, listSent }),
  })
  component.register(t)
  workflowComponent.register(t)
})

afterEach(() => {
  vi.useRealTimers()
})

async function signUp(email: string, name: string): Promise<string> {
  const user = await t.mutation(components.backend.adapter.create, {
    input: { model: 'user', data: { name, email, emailVerified: true, createdAt: Date.now(), updatedAt: Date.now() } },
  } as never) as { _id: string }
  await t.mutation(makeFunctionReference<'mutation'>('workflows:begin'), { userId: user._id, email, name })
  return user._id
}

const sent = () => t.query(makeFunctionReference<'query'>('workflows:listSent'), {}) as Promise<Array<{ to: string, subject: string }>>

// Each test drives the real workflow engine through every scheduled step, so
// its time depends on load: under the full parallel run (and on Windows CI)
// it passed the 5 s default. The work is bounded; the timeout says so.
describe('defineEmailSequence with a userId', { timeout: 20_000 }, () => {
  test('sends to the account as it is when the step is due', async () => {
    const userId = await signUp('ada@example.com', 'Ada')
    await t.mutation(components.backend.adapter.updateOne, {
      input: { model: 'user', where: [{ field: '_id', value: userId }], update: { email: 'ada@new.example', name: 'Ada L.' } },
    } as never)

    await t.finishAllScheduledFunctions(vi.runAllTimers)

    expect(await sent()).toEqual([expect.objectContaining({ to: 'ada@new.example', subject: 'How is it going, Ada L.?' })])
  })

  test('ends without an email when the account was deleted in the meantime', async () => {
    const userId = await signUp('bob@example.com', 'Bob')
    await t.mutation(components.backend.adapter.deleteOne, {
      input: { model: 'user', where: [{ field: '_id', value: userId }] },
    } as never)

    await t.finishAllScheduledFunctions(vi.runAllTimers)

    expect(await sent()).toEqual([])
  })

  test('sends as started when the account is unchanged', async () => {
    await signUp('cy@example.com', 'Cy')
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await sent()).toEqual([expect.objectContaining({ to: 'cy@example.com', subject: 'How is it going, Cy?' })])
  })
})
