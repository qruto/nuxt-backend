import { describe, expect, it, vi } from 'vitest'
import { setupAi, type AiComponents } from '../../src/convex/integrations/ai'
import type { Billing, SpendReservation } from '../../src/convex/integrations/billing'

const components = {
  backend: {
    ai: {
      createRequest: 'ref:ai.createRequest',
      getByStream: 'ref:ai.getByStream',
      markSettled: 'ref:ai.markSettled',
      markReleased: 'ref:ai.markReleased',
    },
  },
  persistentTextStreaming: {},
} as unknown as AiComponents

function makeBilling(overrides: Partial<Billing> = {}): Billing {
  const reservation: SpendReservation = { entityId: 'org_1', externalId: 'ext_1', reserved: true, meter: 'credits', meterId: 'm1', value: 1 }
  return {
    resolveEntity: vi.fn(async () => ({ userId: 'org_1', email: 'a@b.co' })),
    reserveCredits: vi.fn(async () => reservation),
    settleSpend: vi.fn(async () => {}),
    releaseSpend: vi.fn(async () => {}),
    ...overrides,
  } as unknown as Billing
}

const identityCtx = () => ({
  auth: { getUserIdentity: async () => ({ subject: 'user_1', email: 'a@b.co' }) },
  runMutation: vi.fn(async () => null),
  runQuery: vi.fn(async () => null),
})

/** The registered action carries `_handler` (invocable in tests, like convex-test does). */
function invoke(action: unknown, ctx: unknown, args: unknown): Promise<unknown> {
  const fn = action as { _handler?: (ctx: unknown, args: unknown) => Promise<unknown> }
  if (!fn._handler) throw new Error('registered action has no _handler')
  return fn._handler(ctx, args)
}

describe('setupAi().meteredAction', () => {
  it('rate limits, reserves, runs, then settles — in that order', async () => {
    const order: string[] = []
    const billing = makeBilling({
      reserveCredits: vi.fn(async () => {
        order.push('reserve')
        return { entityId: 'org_1', externalId: 'e', reserved: true, meterId: 'm1', value: 2 } as SpendReservation
      }) as never,
      settleSpend: vi.fn(async () => {
        order.push('settle')
      }) as never,
    })
    const limiter = { limit: vi.fn(async () => {
      order.push('limit')
      return { ok: true }
    }) }
    const ai = setupAi(components, { billing, rateLimiter: limiter as never, cors: { origin: 'https://app.test' } })

    const action = ai.meteredAction({
      meter: 'credits',
      cost: args => (args as { long?: boolean }).long ? 2 : 1,
      args: {},
      handler: async (ctx) => {
        order.push('handler')
        return { chargedTo: ctx.usage.entityId, cost: ctx.usage.cost }
      },
    })
    const result = await invoke(action, identityCtx(), { long: true })

    expect(order).toEqual(['limit', 'reserve', 'handler', 'settle'])
    expect(result).toEqual({ chargedTo: 'org_1', cost: 2 })
    expect(billing.reserveCredits).toHaveBeenCalledWith(expect.anything(), { meter: 'credits', value: 2 })
    expect(limiter.limit).toHaveBeenCalledWith(expect.anything(), 'ai', { key: 'org_1' })
  })

  it('releases the reservation when the handler throws — nothing charged', async () => {
    const billing = makeBilling()
    const ai = setupAi(components, { billing })
    const action = ai.meteredAction({
      meter: 'credits',
      args: {},
      handler: async () => {
        throw new Error('model exploded')
      },
    })

    await expect(invoke(action, identityCtx(), {})).rejects.toThrow('model exploded')
    expect(billing.releaseSpend).toHaveBeenCalled()
    expect(billing.settleSpend).not.toHaveBeenCalled()
  })

  it('charge: start settles before running and never releases', async () => {
    const billing = makeBilling()
    const ai = setupAi(components, { billing })
    const action = ai.meteredAction({
      meter: 'credits',
      charge: 'start',
      args: {},
      handler: async () => {
        throw new Error('upstream consumed anyway')
      },
    })

    await expect(invoke(action, identityCtx(), {})).rejects.toThrow('upstream consumed anyway')
    expect(billing.settleSpend).toHaveBeenCalled()
    expect(billing.releaseSpend).not.toHaveBeenCalled()
  })

  it('meter: false skips billing entirely but still rate-limits and requires auth', async () => {
    const billing = makeBilling()
    const limiter = { limit: vi.fn(async () => ({ ok: false, retryAfter: 4000 })) }
    const ai = setupAi(components, { billing, rateLimiter: limiter as never })
    const action = ai.meteredAction({
      meter: false,
      args: {},
      handler: async () => 'ran',
    })

    await expect(invoke(action, identityCtx(), {})).rejects.toThrow(/Rate limit reached. Try again in 4s/)
    expect(billing.reserveCredits).not.toHaveBeenCalled()

    const anonymous = { auth: { getUserIdentity: async () => null } }
    await expect(invoke(action, anonymous, {})).rejects.toThrow(/Sign in/)
  })
})

describe('setupAi().stream', () => {
  it('rejects duplicate stream names', () => {
    const ai = setupAi(components, { billing: makeBilling() })
    const definition = { name: 'echo', meter: false as const, args: {}, handler: async () => {} }
    ai.stream(definition)
    expect(() => ai.stream(definition)).toThrow(/Duplicate ai.stream name/)
  })
})
