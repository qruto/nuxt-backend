import { describe, expect, it, vi } from 'vitest'
import { priceTokens, setupAi, type AiComponents, type CreditsBalanceEvent } from '../../src/convex/integrations/ai'
import type { Billing, SpendReservation } from '../../src/convex/integrations/billing'

const components = {
  backend: {
    ai: {
      createRequest: 'ref:ai.createRequest',
      getByStream: 'ref:ai.getByStream',
      markSettled: 'ref:ai.markSettled',
      markReleased: 'ref:ai.markReleased',
    },
    billing: {
      finalize: 'ref:billing.finalize',
      release: 'ref:billing.release',
      attachReleaseJob: 'ref:billing.attachReleaseJob',
    },
  },
  persistentTextStreaming: { lib: { createStream: 'ref:pts.createStream' } },
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

/** What the component's `finalize` mutation hands back — the balance after a settle. */
type FinalizeOutcome = {
  settled: boolean
  released: number
  balance: number
  balanceBefore: number
  releaseJobId?: string
}

const identityCtx = (finalizeOutcome: Partial<FinalizeOutcome> = {}) => ({
  auth: { getUserIdentity: async () => ({ subject: 'user_1', email: 'a@b.co' }) },
  runMutation: vi.fn(async (ref: unknown, _args?: unknown) => {
    if (ref === 'ref:billing.finalize') {
      return { settled: true, released: 0, balance: 10, balanceBefore: 11, ...finalizeOutcome } satisfies FinalizeOutcome
    }
    return ref === 'ref:pts.createStream' ? 'stream_1' : null
  }),
  runQuery: vi.fn(async () => null),
  scheduler: { runAfter: vi.fn(async () => 'job_1'), cancel: vi.fn(async () => {}) },
})

/** The registered action carries `_handler` (invocable in tests, like convex-test does). */
function invoke(action: unknown, ctx: unknown, args: unknown): Promise<unknown> {
  const fn = action as { _handler?: (ctx: unknown, args: unknown) => Promise<unknown> }
  if (!fn._handler) throw new Error('registered action has no _handler')
  return fn._handler(ctx, args)
}

/** The args of the single `finalize` call made on this ctx. */
function finalizeCall(ctx: ReturnType<typeof identityCtx>) {
  const call = ctx.runMutation.mock.calls.find(([ref]) => ref === 'ref:billing.finalize')
  return call?.[1] as { userId: string, externalId: string, finalAmount?: number } | undefined
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

  it('carries the acting user on every ingested event (member attribution)', async () => {
    const billing = makeBilling()
    const ai = setupAi(components, { billing })
    const action = ai.meteredAction({ meter: 'credits', args: {}, handler: async () => 'ok' })

    await invoke(action, identityCtx(), {})

    expect(billing.settleSpend).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { metadata: { userId: 'user_1' } },
    )
  })

  it('forwards allowOverage to the spend so a pay-as-you-go meter can go negative', async () => {
    const billing = makeBilling()
    const ai = setupAi(components, { billing })
    const action = ai.meteredAction({ meter: 'usage', allowOverage: true, args: {}, handler: async () => 'ok' })

    await invoke(action, identityCtx(), {})

    expect(billing.reserveCredits).toHaveBeenCalledWith(
      expect.anything(),
      { meter: 'usage', value: 1, allowOverage: true },
    )
  })
})

describe('setupAi() finalized cost — reserve an estimate, settle the actual', () => {
  const reservation: SpendReservation = { entityId: 'org_1', externalId: 'ext_1', reserved: true, meter: 'credits', meterId: 'm1', value: 500 }

  function finalizedAi(overrides: Partial<Billing> = {}) {
    const billing = makeBilling({ reserveCredits: vi.fn(async () => reservation) as never, ...overrides })
    return { billing, ai: setupAi(components, { billing }) }
  }

  it('reserves the estimate, ingests the actual, and releases the remainder', async () => {
    const { billing, ai } = finalizedAi()
    const action = ai.meteredAction({
      meter: 'credits',
      cost: { estimate: 500, finalize: result => result.tokens },
      args: {},
      handler: async () => ({ tokens: 120 }),
    })
    const ctx = identityCtx({ released: 380, balance: 880, balanceBefore: 1000 })

    await invoke(action, ctx, {})

    // Reserved the ceiling…
    expect(billing.reserveCredits).toHaveBeenCalledWith(expect.anything(), { meter: 'credits', value: 500 })
    // …ingested what was actually spent…
    expect(billing.settleSpend).toHaveBeenCalledWith(
      expect.objectContaining({}),
      expect.objectContaining({ value: 120, reserved: false }),
      expect.anything(),
    )
    // …and the component settles at 120, handing the other 380 back.
    expect(finalizeCall(ctx)).toEqual({ userId: 'org_1', externalId: 'ext_1', finalAmount: 120 })
  })

  it('clamps a final amount above the reservation — the estimate is the ceiling', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { ai } = finalizedAi()
    const action = ai.meteredAction({
      meter: 'credits',
      cost: { estimate: 500, finalize: () => 900 },
      args: {},
      handler: async () => ({}),
    })
    const ctx = identityCtx()

    await invoke(action, ctx, {})

    expect(finalizeCall(ctx)?.finalAmount).toBe(500)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('exceeds the 500 credits reserved'))
    warn.mockRestore()
  })

  it('settles the whole reservation when the cost is a plain number', async () => {
    const { ai } = finalizedAi()
    const action = ai.meteredAction({ meter: 'credits', cost: 500, args: {}, handler: async () => 'ok' })
    const ctx = identityCtx()

    await invoke(action, ctx, {})

    expect(finalizeCall(ctx)).toEqual({ userId: 'org_1', externalId: 'ext_1', finalAmount: 500 })
  })

  it('releases the full reservation when the provider event fails to ingest', async () => {
    const { billing, ai } = finalizedAi({
      settleSpend: vi.fn(async () => {
        throw new Error('provider down')
      }) as never,
    })
    const action = ai.meteredAction({
      meter: 'credits',
      cost: { estimate: 500, finalize: () => 10 },
      args: {},
      handler: async () => ({}),
    })
    const ctx = identityCtx()

    await expect(invoke(action, ctx, {})).rejects.toThrow('provider down')
    expect(billing.releaseSpend).toHaveBeenCalledWith(expect.anything(), reservation)
    expect(finalizeCall(ctx)).toBeUndefined()
  })
})

describe('setupAi() budget — a fixed window over credits, per billing entity', () => {
  const budget = { units: 100, period: 60_000 }

  it('consumes the spend value from the entity window before reserving', async () => {
    const billing = makeBilling({
      reserveCredits: vi.fn(async () => (
        { entityId: 'org_1', externalId: 'e', reserved: true, meterId: 'm1', value: 30 } as SpendReservation
      )) as never,
    })
    const limiter = { limit: vi.fn(async () => ({ ok: true })) }
    const ai = setupAi(components, { billing, rateLimiter: limiter as never, budget })
    const action = ai.meteredAction({ meter: 'credits', cost: 30, args: {}, handler: async () => 'ok' })

    await invoke(action, identityCtx(), {})

    expect(limiter.limit).toHaveBeenNthCalledWith(2, expect.anything(), 'aiBudget', {
      key: 'org_1',
      count: 30,
      config: { kind: 'fixed window', rate: 100, period: 60_000 },
    })
  })

  it('rejects the call — without reserving — once the window is spent', async () => {
    const billing = makeBilling()
    const limiter = {
      limit: vi.fn(async (_ctx: unknown, name: string) =>
        name === 'aiBudget' ? { ok: false, retryAfter: 30_000 } : { ok: true }),
    }
    const ai = setupAi(components, { billing, rateLimiter: limiter as never, budget })
    const action = ai.meteredAction({ meter: 'credits', args: {}, handler: async () => 'ok' })

    await expect(invoke(action, identityCtx(), {})).rejects.toThrow(/Credit budget reached — 100 credits per window. Resets in 30s/)
    expect(billing.reserveCredits).not.toHaveBeenCalled()
  })

  it('refuses a single spend that could never fit the window', async () => {
    const limiter = { limit: vi.fn(async () => ({ ok: true })) }
    const ai = setupAi(components, { billing: makeBilling(), rateLimiter: limiter as never, budget })
    const action = ai.meteredAction({ meter: 'credits', cost: 500, args: {}, handler: async () => 'ok' })

    await expect(invoke(action, identityCtx(), {})).rejects.toThrow(/costs 500 credits but the budget is 100 per window/)
  })

  it('leaves unmetered actions out of the budget', async () => {
    const limiter = { limit: vi.fn(async () => ({ ok: true })) }
    const ai = setupAi(components, { billing: makeBilling(), rateLimiter: limiter as never, budget })
    const action = ai.meteredAction({ meter: false, args: {}, handler: async () => 'ok' })

    await invoke(action, identityCtx(), {})

    expect(limiter.limit).toHaveBeenCalledTimes(1)
    expect(limiter.limit).toHaveBeenCalledWith(expect.anything(), 'ai', { key: 'org_1' })
  })

  it('needs a rate limiter to enforce against', () => {
    expect(() => setupAi(components, { billing: makeBilling(), budget }))
      .toThrow(/needs a `rateLimiter`/)
  })
})

describe('setupAi() low-balance hooks', () => {
  const events: CreditsBalanceEvent[] = []
  const credits = {
    lowBalanceThreshold: 100,
    onCreditsLow: (_ctx: unknown, event: CreditsBalanceEvent) => {
      events.push(event)
    },
  }

  async function spend(outcome: Partial<FinalizeOutcome>) {
    events.length = 0
    const ai = setupAi(components, { billing: makeBilling(), credits: credits as never })
    const action = ai.meteredAction({ meter: 'credits', args: {}, handler: async () => 'ok' })
    await invoke(action, identityCtx(outcome), {})
    return events
  }

  it('fires once on the crossing, then stays quiet below the threshold', async () => {
    expect(await spend({ balanceBefore: 101, balance: 99 })).toEqual([
      expect.objectContaining({ entityId: 'org_1', userId: 'user_1', balance: 99, previousBalance: 101, spent: 2, threshold: 100 }),
    ])
    // The next spend starts below the line — the crossing already happened.
    expect(await spend({ balanceBefore: 99, balance: 97 })).toEqual([])
    // Landing exactly on the threshold counts as crossing it.
    expect(await spend({ balanceBefore: 105, balance: 100 })).toHaveLength(1)
    // Still above it: nothing.
    expect(await spend({ balanceBefore: 200, balance: 150 })).toEqual([])
  })

  it('fires onCreditsExhausted when the balance crosses zero', async () => {
    const seen: string[] = []
    const ai = setupAi(components, {
      billing: makeBilling(),
      credits: {
        lowBalanceThreshold: 100,
        onCreditsLow: () => {
          seen.push('low')
        },
        onCreditsExhausted: () => {
          seen.push('exhausted')
        },
      },
    })
    const action = ai.meteredAction({ meter: 'credits', args: {}, handler: async () => 'ok' })

    // One spend can cross both lines at once; each fires once.
    await invoke(action, identityCtx({ balanceBefore: 105, balance: -2 }), {})
    expect(seen).toEqual(['low', 'exhausted'])

    // An entity already under the threshold only crosses zero.
    seen.length = 0
    await invoke(action, identityCtx({ balanceBefore: 3, balance: -2 }), {})
    expect(seen).toEqual(['exhausted'])

    // And once it is negative, nothing fires again.
    seen.length = 0
    await invoke(action, identityCtx({ balanceBefore: -2, balance: -5 }), {})
    expect(seen).toEqual([])
  })

  it('never fails a settled spend because a hook threw', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ai = setupAi(components, {
      billing: makeBilling(),
      credits: {
        lowBalanceThreshold: 100,
        onCreditsLow: () => {
          throw new Error('notification service down')
        },
      },
    })
    const action = ai.meteredAction({ meter: 'credits', args: {}, handler: async () => 'ok' })

    await expect(invoke(action, identityCtx({ balanceBefore: 101, balance: 99 }), {})).resolves.toBe('ok')
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Credit balance hook failed'), expect.any(Error))
    error.mockRestore()
  })
})

describe('setupAi().stream', () => {
  it('rejects duplicate stream names', () => {
    const ai = setupAi(components, { billing: makeBilling() })
    const definition = { name: 'echo', meter: false as const, args: {}, handler: async () => {} }
    ai.stream(definition)
    expect(() => ai.stream(definition)).toThrow(/Duplicate ai.stream name/)
  })

  it('schedules an auto-release for the reservation and records the job', async () => {
    const ai = setupAi(components, { billing: makeBilling() })
    const { start } = ai.stream({ name: 'timed', meter: 'credits', args: {}, handler: async () => {} })
    const ctx = identityCtx()

    await invoke(start, ctx, {})

    expect(ctx.scheduler.runAfter).toHaveBeenCalledWith(5 * 60 * 1000, 'ref:billing.release', {
      userId: 'org_1',
      externalId: 'ext_1',
    })
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:billing.attachReleaseJob', {
      userId: 'org_1',
      externalId: 'ext_1',
      jobId: 'job_1',
    })
  })

  it('honours a custom timeout and skips the timer when disabled', async () => {
    const timed = setupAi(components, { billing: makeBilling(), streamTimeout: 30_000 })
    const timedCtx = identityCtx()
    await invoke(timed.stream({ name: 'a', meter: 'credits', args: {}, handler: async () => {} }).start, timedCtx, {})
    expect(timedCtx.scheduler.runAfter).toHaveBeenCalledWith(30_000, 'ref:billing.release', expect.anything())

    const untimed = setupAi(components, { billing: makeBilling(), streamTimeout: false })
    const untimedCtx = identityCtx()
    await invoke(untimed.stream({ name: 'b', meter: 'credits', args: {}, handler: async () => {} }).start, untimedCtx, {})
    expect(untimedCtx.scheduler.runAfter).not.toHaveBeenCalled()
  })

  it('still starts the stream when the timer cannot be armed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ai = setupAi(components, { billing: makeBilling() })
    const ctx = identityCtx()
    ctx.scheduler.runAfter = vi.fn(async () => {
      throw new Error('scheduling refused')
    }) as never

    const started = await invoke(ai.stream({ name: 'fragile', meter: 'credits', args: {}, handler: async () => {} }).start, ctx, {})

    expect(started).toEqual({ streamId: 'stream_1' })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('falling back to the pending-spend TTL'), expect.any(Error))
    warn.mockRestore()
  })

  it('leaves an unmetered stream without a timer — there is nothing held', async () => {
    const ai = setupAi(components, {
      billing: makeBilling({
        reserveCredits: vi.fn(async () => (
          { entityId: 'org_1', externalId: 'e', reserved: false, value: 1 } as SpendReservation
        )) as never,
      }),
    })
    const ctx = identityCtx()

    await invoke(ai.stream({ name: 'free', meter: false, args: {}, handler: async () => {} }).start, ctx, {})

    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled()
  })
})

describe('priceTokens', () => {
  const prices = {
    'fast-1': { input: 3, output: 15, per: 1_000_000 },
    'deep-1': { input: 15, output: 75, cachedInput: 1.5, per: 1_000_000 },
    'per-token': { input: 1, output: 2 },
  }

  it('prices input and output at the model\'s rates', () => {
    expect(priceTokens({ model: 'per-token', input: 10, output: 5 }, prices)).toBe(20)
    expect(priceTokens({ model: 'fast-1', input: 1_000_000, output: 0 }, prices)).toBe(3)
    expect(priceTokens({ model: 'fast-1', input: 12_000, output: 800 }, prices)).toBeCloseTo(0.048, 6)
  })

  it('bills cached input at its own rate, or as plain input when unpriced', () => {
    // deep-1 prices cache reads at a tenth of fresh input.
    expect(priceTokens({ model: 'deep-1', input: 0, output: 0, cachedInput: 1_000_000 }, prices)).toBe(1.5)
    // fast-1 has no cached rate — those tokens are ordinary input.
    expect(priceTokens({ model: 'fast-1', input: 500_000, output: 0, cachedInput: 500_000 }, prices)).toBe(3)
  })

  it('takes a table-wide `per` and lets an entry override it', () => {
    const table = { a: { input: 2, output: 4 }, b: { input: 2, output: 4, per: 1_000 } }
    expect(priceTokens({ model: 'a', input: 1_000_000, output: 0 }, table, { per: 1_000_000 })).toBe(2)
    expect(priceTokens({ model: 'b', input: 1_000, output: 0 }, table, { per: 1_000_000 })).toBe(2)
  })

  it('rounds and floors only when asked', () => {
    const usage = { model: 'fast-1', input: 12_000, output: 800 }
    expect(priceTokens(usage, prices, { round: 'up' })).toBe(1)
    expect(priceTokens(usage, prices, { round: 'nearest' })).toBe(0)
    expect(priceTokens(usage, prices, { minimum: 1 })).toBe(1)
  })

  it('refuses to price an unknown model rather than charging nothing', () => {
    expect(() => priceTokens({ model: 'mystery', input: 1, output: 1 }, prices))
      .toThrow(/no price for model 'mystery'/)
    expect(() => priceTokens({ model: 'a', input: 1, output: 1 }, { a: { input: 1, output: 1, per: 0 } }))
      .toThrow(/must be a positive number of tokens/)
  })

  it('is pure — the same usage always prices the same', () => {
    const usage = { model: 'deep-1', input: 3_000, output: 1_200, cachedInput: 900 }
    expect(priceTokens(usage, prices)).toBe(priceTokens(usage, prices))
    expect(usage).toEqual({ model: 'deep-1', input: 3_000, output: 1_200, cachedInput: 900 })
  })
})
