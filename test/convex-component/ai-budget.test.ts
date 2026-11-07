/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, type FunctionReference, makeFunctionReference } from 'convex/server'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { backendError, getBackendError } from '../../src/convex/errors'
import { setupAi } from '../../src/convex/integrations/ai'
import type { Billing } from '../../src/convex/integrations/billing'
import { setupRateLimiter } from '../../src/convex/integrations/rate-limit'

// `setupAi({ budget })` on the real rate limiter and the component's real
// credit cache: a call counts its estimate, and the window gets back what the
// call did not spend once it closes. Only the billing provider is a stand-in.

const DAY = 24 * 60 * 60_000
const METER_ID = 'm1'
const WORKSPACE = 'org_1'
const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'>, rateLimiter: never, persistentTextStreaming: never }
const backend = components.backend

const billing = {
  requireEntity: async () => ({ userId: WORKSPACE, email: 'a@b.co' }),
  reserveCredits: async (ctx: { runMutation: (ref: unknown, args: unknown) => Promise<{ ok: boolean, balance: number }> }, event: { userId: string, value: number }) => {
    const externalId = crypto.randomUUID()
    const result = await ctx.runMutation(backend.billing.debit, { userId: event.userId, meterId: METER_ID, amount: event.value, externalId })
    if (!result.ok) throw backendError('insufficient_credits', { meter: 'credits', balance: result.balance, need: event.value })
    return { entityId: event.userId, externalId, reserved: true, meter: 'credits', meterId: METER_ID, value: event.value }
  },
  settleSpend: async () => {},
  releaseSpend: async (ctx: { runMutation: (ref: unknown, args: unknown) => Promise<unknown> }, reservation: { entityId: string, externalId: string }) => {
    await ctx.runMutation(backend.billing.release, { userId: reservation.entityId, externalId: reservation.externalId })
  },
  recordEvent: async () => {},
} as unknown as Billing

const ai = setupAi(components as never, { billing, rateLimiter: setupRateLimiter(components as never), budget: { units: 100, period: DAY } })

const estimate = 80
const under = ai.meteredAction({ meter: 'credits', cost: { estimate, finalize: () => 10 }, args: {}, handler: async () => 'ok' })
const whole = ai.meteredAction({ meter: 'credits', cost: estimate, args: {}, handler: async () => 'ok' })
const failing = ai.meteredAction({
  meter: 'credits',
  cost: estimate,
  args: {},
  handler: async () => {
    throw new Error('The run failed.')
  },
})

const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './drafts.js': () => Promise.resolve({ under, whole, failing }),
})
type App = ReturnType<typeof testApp>

const draft = (name: 'under' | 'whole' | 'failing') => makeFunctionReference<'action', Record<string, never>, string>(`drafts:${name}`)

async function fund(t: App, balance: number) {
  await t.mutation(backend.billing.upsert as unknown as FunctionReference<'mutation'>, {
    userId: WORKSPACE,
    activeProductIds: [],
    benefits: [],
    meters: [{ meterId: METER_ID, consumedUnits: 0, creditedUnits: balance, balance }],
  })
}

async function refusal(call: Promise<unknown>) {
  try {
    await call
  }
  catch (error) {
    return getBackendError(error)
  }
  return undefined
}

let t: App

beforeEach(async () => {
  // Midday: a day window can't roll over between two calls of a test.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(Date.UTC(2026, 9, 27, 12))
  t = testApp()
  await fund(t, 1000)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('setupAi({ budget }) on the real limiter', () => {
  test('a run that settles under its estimate gives the rest back', async () => {
    const user = await asUser(t)
    await user.action(draft('under'), {})
    // Without the give-back, 80 of 100 is spent and this estimate can't fit.
    await expect(user.action(draft('under'), {})).resolves.toBe('ok')
  })

  test('a run that spends its whole estimate keeps it counted', async () => {
    const user = await asUser(t)
    await user.action(draft('whole'), {})
    expect(await refusal(user.action(draft('whole'), {}))).toMatchObject({ code: 'rate_limited', data: { limit: 'aiBudget' } })
  })

  test('a failed run gives its whole estimate back', async () => {
    const user = await asUser(t)
    await expect(user.action(draft('failing'), {})).rejects.toThrow('The run failed.')
    await expect(user.action(draft('whole'), {})).resolves.toBe('ok')
  })

  test('a call the balance refuses leaves the window as it was', async () => {
    await fund(t, 10)
    const user = await asUser(t)
    expect(await refusal(user.action(draft('whole'), {}))).toMatchObject({ code: 'insufficient_credits' })
    await fund(t, 1000)
    await expect(user.action(draft('whole'), {})).resolves.toBe('ok')
  })
})
