import { actionGeneric, httpActionGeneric, queryGeneric, type Auth, type FunctionReference, type GenericActionCtx, type GenericDataModel } from 'convex/server'
import { v, type ObjectType, type PropertyValidators } from 'convex/values'
import { PersistentTextStreaming, type StreamId } from '@convex-dev/persistent-text-streaming'
import type { Billing, SpendReservation } from './billing'

/**
 * The rails for selling metered AI features: wrap any Convex action so it is
 * rate-limited, prepaid-credit-metered (reserve → run → settle — a failed run
 * consumes nothing), and optionally token-streamed to the browser with the
 * text persisted server-side (reload mid-stream and it continues).
 *
 * Composes the billing spend reservation (`setupBilling`), the rate limiter,
 * and the upstream persistent-text-streaming component — usage recording IS
 * the provider event, so per-customer usage shows up in the provider's own
 * portal and dashboard with no extra tables here.
 */

type RunCtx = Parameters<Billing['reserveCredits']>[0]

/** The rate limiter shape `setupAi` consumes (a `setupRateLimiter` instance fits). */
export interface AiRateLimiter {
  limit: (ctx: unknown, name: never, options?: { key?: string, throws?: boolean }) => Promise<{ ok: boolean, retryAfter?: number }>
}

/** The component handles `setupAi` reads from your generated `components` object. */
export interface AiComponents {
  backend: {
    ai: {
      createRequest: FunctionReference<'mutation', 'internal', {
        streamId: string
        name: string
        entityId: string
        userId: string
        args: string
        meterId?: string
        cost: number
        externalId: string
      }, null>
      getByStream: FunctionReference<'query', 'internal', { streamId: string }, {
        streamId: string
        name: string
        entityId: string
        userId: string
        args: string
        meterId?: string
        cost: number
        externalId: string
        status: 'reserved' | 'settled' | 'released'
        createdAt: number
      } | null>
      markSettled: FunctionReference<'mutation', 'internal', { streamId: string }, null>
      markReleased: FunctionReference<'mutation', 'internal', { streamId: string }, null>
    }
  }
  persistentTextStreaming: ConstructorParameters<typeof PersistentTextStreaming>[0]
}

export interface SetupAiConfig {
  /** The `setupBilling(...)` instance — supplies entity resolution + the credit spend. */
  billing: Billing
  /**
   * Your `setupRateLimiter(...)` instance. Metered actions/streams check
   * their named limit (default `'ai'`) per billing entity before reserving.
   * Omit to leave them unthrottled.
   */
  rateLimiter?: AiRateLimiter
  /** CORS origin for the stream endpoint. Defaults to the `SITE_URL` env var. */
  cors?: { origin?: string }
}

/** Usage details handed to metered handlers (`ctx.usage`). */
export interface MeteredUsage {
  /** The billing entity (workspace/user) charged. */
  entityId: string
  /** The signed-in caller. */
  userId: string
  /** Configured meter name, when metered. */
  meter?: string
  /** Credits this call costs. */
  cost: number
}

export interface MeteredActionConfig<Args extends PropertyValidators> {
  /**
   * The configured credit meter to charge (`setupBilling({ credits })` /
   * catalog key) — or `false` for a rate-limit-only action.
   */
  meter: string | false
  /** Credits per call — a number or derived from the args. Default `1`. */
  cost?: number | ((args: ObjectType<Args>) => number)
  /**
   * Named rate limit (checked per billing entity via the configured
   * `rateLimiter`). Default `'ai'`; `false` disables the check.
   */
  limit?: string | false
  /**
   * When to charge: `'success'` (default) settles after the handler returns —
   * a failed run consumes nothing; `'start'` settles before running, for work
   * that is irrevocably consumed upstream the moment it starts.
   */
  charge?: 'success' | 'start'
  args: Args
  handler: (ctx: GenericActionCtx<GenericDataModel> & { usage: MeteredUsage }, args: ObjectType<Args>) => Promise<unknown>
}

export interface MeteredStreamConfig<Args extends PropertyValidators> {
  /** Registry key — unique per app; the HTTP dispatcher routes by it. */
  name: string
  /** The configured credit meter to charge, or `false` for limit-only. */
  meter: string | false
  /** Credits per stream — a number or derived from the args. Default `1`. */
  cost?: number | ((args: ObjectType<Args>) => number)
  /** Named rate limit. Default `'ai'`; `false` disables. */
  limit?: string | false
  args: Args
  /**
   * Produce the stream: `append(text)` pushes a chunk to the client AND
   * persists it. Credits settle when the handler finishes; an error or
   * disconnect releases them — an interrupted stream never charges.
   */
  handler: (
    ctx: GenericActionCtx<GenericDataModel> & { usage: MeteredUsage },
    args: ObjectType<Args>,
    stream: { append: (text: string) => Promise<void> },
  ) => Promise<void>
}

export interface Ai {
  /**
   * A drop-in replacement for `action` that rate-limits, reserves prepaid
   * credits, runs your handler, then settles the spend (usage lands in the
   * billing provider as an ingested event). Failed runs release the
   * reservation — nothing charged.
   *
   * @example
   * ```ts
   * export const generate = ai.meteredAction({
   *   meter: 'credits',
   *   cost: args => args.long ? 5 : 1,
   *   args: { prompt: v.string(), long: v.optional(v.boolean()) },
   *   handler: async (ctx, { prompt }) => runModel(prompt),
   * })
   * ```
   */
  meteredAction: <Args extends PropertyValidators>(config: MeteredActionConfig<Args>) => ReturnType<typeof actionGeneric>
  /**
   * A metered, persisted token stream. Returns `{ start, body }` to re-export
   * from your module — `useAiStream` drives them: `start` reserves credits and
   * creates the stream, the HTTP endpoint (`registerBackendRoutes({ ai })`)
   * runs your handler and streams chunks, `body` serves the persisted text
   * reactively (reload mid-stream and it continues).
   */
  stream: <Args extends PropertyValidators>(config: MeteredStreamConfig<Args>) => {
    start: ReturnType<typeof actionGeneric>
    body: ReturnType<typeof queryGeneric>
  }
  /** The stream endpoint for `registerBackendRoutes({ ai })` (POST + CORS preflight). */
  httpHandler: ReturnType<typeof httpActionGeneric>
  /** CORS headers for the stream route (used by `registerBackendRoutes`). */
  corsOrigin: string
}

/**
 * Configure the AI rails over billing + rate limiting + streaming.
 *
 * @example
 * ```ts
 * // backend/ai.ts
 * import { setupAi } from 'nuxt-backend/ai'
 * import { components } from './_generated/api'
 * import { billing } from './billing'
 * import { rateLimiter } from './rateLimiter'
 *
 * export const ai = setupAi(components, { billing, rateLimiter })
 * export const generate = ai.meteredAction({ ... })
 * export const { start: startEcho, body: echoBody } = ai.stream({ name: 'echo', ... })
 * ```
 */
export function setupAi(components: AiComponents, config: SetupAiConfig): Ai {
  const { billing, rateLimiter } = config
  const pts = new PersistentTextStreaming(components.persistentTextStreaming)
  const requests = components.backend.ai
  const corsOrigin = config.cors?.origin
    ?? (typeof process !== 'undefined' ? process.env.SITE_URL : undefined)
    ?? '*'

  const streamRegistry = new Map<string, MeteredStreamConfig<PropertyValidators>>()

  /** Entity + caller + rate limit + reservation — shared by both shapes. */
  const prepare = async (
    ctx: RunCtx & { auth?: Auth },
    options: { meter: string | false, limit?: string | false, cost: number },
  ): Promise<{ usage: MeteredUsage, reservation: SpendReservation }> => {
    const identity = await (ctx.auth?.getUserIdentity() ?? Promise.resolve(null))
    if (!identity) {
      throw new Error('[nuxt-backend] Sign in to use this feature.')
    }
    const entity = await billing.resolveEntity(ctx)
    if (!entity) {
      throw new Error('[nuxt-backend] No billing entity — sign in (a personal workspace is created automatically).')
    }

    const limitName = options.limit ?? 'ai'
    if (rateLimiter && limitName !== false) {
      const { ok, retryAfter } = await rateLimiter.limit(ctx, limitName as never, { key: entity.userId })
      if (!ok) {
        const wait = retryAfter ? ` Try again in ${Math.ceil(retryAfter / 1000)}s.` : ''
        throw new Error(`[nuxt-backend] Rate limit reached.${wait}`)
      }
    }

    const reservation = options.meter === false
      ? { entityId: entity.userId, externalId: crypto.randomUUID(), reserved: false, value: options.cost } satisfies SpendReservation
      : await billing.reserveCredits(ctx, { meter: options.meter, value: options.cost })

    return {
      usage: {
        entityId: entity.userId,
        userId: identity.subject,
        meter: options.meter === false ? undefined : options.meter,
        cost: options.cost,
      },
      reservation,
    }
  }

  const meteredAction: Ai['meteredAction'] = definition => actionGeneric({
    args: definition.args,
    // Loose internal typing: precise arg types live on MeteredActionConfig;
    // the open `Args` generic fights Convex's conditional args-array types.
    handler: (async (ctx: GenericActionCtx<GenericDataModel>, args: Record<string, unknown>) => {
      const cost = typeof definition.cost === 'function' ? definition.cost(args as never) : definition.cost ?? 1
      const { usage, reservation } = await prepare(ctx as never, { meter: definition.meter, limit: definition.limit, cost })
      const metered = definition.meter !== false

      if (definition.charge === 'start') {
        // Irrevocable upstream work: charge first, no refund on failure.
        if (metered) await billing.settleSpend(ctx as never, reservation, { metadata: { charge: 'start' } })
        return definition.handler(Object.assign(ctx, { usage }) as never, args as never)
      }

      let result: unknown
      try {
        result = await definition.handler(Object.assign(ctx, { usage }) as never, args as never)
      }
      catch (error) {
        if (metered) await billing.releaseSpend(ctx as never, reservation)
        throw error
      }
      if (metered) await billing.settleSpend(ctx as never, reservation)
      return result
    }) as never,
  })

  const stream: Ai['stream'] = (definition) => {
    if (streamRegistry.has(definition.name)) {
      throw new Error(`[nuxt-backend] Duplicate ai.stream name '${definition.name}'.`)
    }
    streamRegistry.set(definition.name, definition as unknown as MeteredStreamConfig<PropertyValidators>)

    const start = actionGeneric({
      args: definition.args,
      handler: (async (ctx: GenericActionCtx<GenericDataModel>, args: Record<string, unknown>) => {
        const cost = typeof definition.cost === 'function' ? definition.cost(args as never) : definition.cost ?? 1
        const { usage, reservation } = await prepare(ctx as never, { meter: definition.meter, limit: definition.limit, cost })
        const streamId = await pts.createStream(ctx as never)
        await ctx.runMutation(requests.createRequest, {
          streamId,
          name: definition.name,
          entityId: reservation.entityId,
          userId: usage.userId,
          args: JSON.stringify(args),
          meterId: reservation.meterId,
          cost,
          externalId: reservation.externalId,
        })
        return { streamId }
      }) as never,
    })

    const body = queryGeneric({
      args: { streamId: v.string() },
      handler: async (ctx, { streamId }) => {
        return pts.getStreamBody(ctx as never, streamId as StreamId)
      },
    })

    return { start, body }
  }

  const httpHandler = httpActionGeneric(async (ctx, request) => {
    const headers = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Vary': 'Origin',
    }
    let streamId: unknown
    try {
      streamId = ((await request.json()) as { streamId?: unknown }).streamId
    }
    catch {
      return new Response('Bad request', { status: 400, headers })
    }
    if (typeof streamId !== 'string') {
      return new Response('Bad request', { status: 400, headers })
    }
    // Possession of the unguessable stream id is the capability: it was
    // handed to this caller by the authenticated `start` action moments ago.
    const row = await ctx.runQuery(requests.getByStream, { streamId })
    if (!row || row.status !== 'reserved') {
      return new Response('Unknown or finished stream', { status: 404, headers })
    }
    const definition = streamRegistry.get(row.name)
    if (!definition) {
      return new Response('Unknown stream handler', { status: 404, headers })
    }

    const reservation: SpendReservation = {
      entityId: row.entityId,
      externalId: row.externalId,
      reserved: row.meterId !== undefined,
      meter: definition.meter === false ? undefined : definition.meter,
      meterId: row.meterId,
      value: row.cost,
    }
    const usage: MeteredUsage = {
      entityId: row.entityId,
      userId: row.userId,
      meter: definition.meter === false ? undefined : definition.meter,
      cost: row.cost,
    }

    let failed = false
    const response = await pts.stream(ctx, request, streamId as StreamId, async (streamCtx, _request, _id, append) => {
      try {
        await definition.handler(
          Object.assign(streamCtx, { usage }) as never,
          JSON.parse(row.args) as never,
          { append },
        )
      }
      catch (error) {
        failed = true
        throw error
      }
    })

    // Settle only a delivered stream; anything else releases — an interrupted
    // stream never charges (ingested provider events cannot be un-ingested,
    // so the charge happens strictly after success).
    if (failed) {
      await billing.releaseSpend(ctx as never, reservation)
      await ctx.runMutation(requests.markReleased, { streamId })
    }
    else {
      try {
        if (definition.meter !== false) await billing.settleSpend(ctx as never, reservation)
        await ctx.runMutation(requests.markSettled, { streamId })
      }
      catch (error) {
        console.error('[nuxt-backend] Stream settled but the spend failed to ingest — released instead:', error)
        await ctx.runMutation(requests.markReleased, { streamId })
      }
    }

    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
    return response
  })

  return { meteredAction, stream, httpHandler, corsOrigin }
}
