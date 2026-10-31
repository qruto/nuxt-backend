import { actionGeneric, httpActionGeneric, queryGeneric, type GenericActionCtx, type GenericDataModel } from 'convex/server'
import { v, type PropertyValidators } from 'convex/values'
import type { StreamId } from '@convex-dev/persistent-text-streaming'
import type { SpendReservation } from '../billing.js'
import type { Ai, MeteredStreamConfig, MeteredUsage } from './config.js'
import type { AiContext } from './context.js'
import type { AiMetering } from './metering.js'
import { failedRun, type ModelCall } from './models.js'
import { estimateCost, finalizeCost } from './pricing.js'
import { logBackend } from '../../log.js'

/**
 * Metered, persisted token streams: `start` reserves the credits, creates the
 * stream and arms the abandon timer; the HTTP dispatcher runs the registered
 * handler, then settles a delivered stream or releases an interrupted one.
 */
export function createStreams(
  { billing, pts, requests, corsOrigin, streamRegistry, recordCost }: AiContext,
  { prepare, closeSpend, armRelease, checkDefinition, requiredModel, modelPicker }: AiMetering,
): Pick<Ai, 'stream' | 'httpHandler'> {
  const stream: Ai['stream'] = (definition) => {
    checkDefinition(definition, 'ai.stream')
    if (streamRegistry.has(definition.name)) {
      throw new Error(`[nuxt-backend] Duplicate ai.stream name '${definition.name}'.`)
    }
    streamRegistry.set(definition.name, definition as unknown as MeteredStreamConfig<PropertyValidators, unknown>)

    const start = actionGeneric({
      args: definition.args,
      handler: (async (ctx: GenericActionCtx<GenericDataModel>, args: Record<string, unknown>) => {
        const cost = estimateCost(definition.cost, args)
        const { usage, reservation } = await prepare(ctx as never, {
          meter: definition.meter,
          limit: definition.limit,
          cost,
          allowOverage: definition.allowOverage,
          model: requiredModel(definition),
          ...(definition.moderate ? { moderate: definition.moderate(args as never) } : {}),
        })
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
        // A stream that is started and never delivered (the browser closed
        // before the HTTP call, or it died mid-flight) would otherwise hold its
        // credits until the TTL pruned the reservation — and a pruned
        // reservation is never re-credited, only re-synced.
        await armRelease(ctx as never, reservation)
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
    // One dispatch runs the model per reservation: the claim is one
    // transaction, so a second POST of the same stream id (a retry, a
    // replay) loses it here, before any model call.
    if (!await ctx.runMutation(requests.claimRequest, { streamId })) {
      return new Response('Stream already started', { status: 409, headers })
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

    const release = async () => {
      await billing.releaseSpend(ctx as never, reservation)
      await ctx.runMutation(requests.markReleased, { streamId })
    }
    const settle = async (result: unknown, calls: readonly ModelCall[]) => {
      try {
        if (definition.meter !== false) {
          await closeSpend(ctx as never, usage, reservation, {
            finalAmount: finalizeCost(definition.cost, result, usage, calls),
          })
        }
        await ctx.runMutation(requests.markSettled, { streamId })
      }
      catch (error) {
        // `closeSpend` only throws when the provider event never landed, and
        // it releases the reservation itself before rethrowing — so the stream
        // genuinely consumed nothing and `markReleased` is the truth.
        logBackend('error', 'ai.stream_spend_lost', 'Stream delivered but the spend never ingested — the reservation was released.', error)
        await ctx.runMutation(requests.markReleased, { streamId })
      }
    }

    // The streaming component hands back its response at once and runs the
    // writer behind it, so the run is settled from inside the writer, once
    // the handler is done: the response must not wait for it, and a settle
    // out here would run before the handler had made a single call. Settle
    // only a delivered stream; anything else releases (ingested provider
    // events cannot be un-ingested, so the charge happens strictly after
    // success). Should the action die mid-stream, neither runs, and the
    // timer `start` armed releases the reservation.
    const response = await pts.stream(ctx, request, streamId as StreamId, async (streamCtx, _request, _id, append) => {
      // The model calls the handler makes, which a reported cost settles from.
      const calls: ModelCall[] = []
      let result: unknown
      try {
        result = await definition.handler(
          Object.assign(streamCtx, { usage, model: modelPicker(definition.model, calls) }) as never,
          JSON.parse(row.args) as never,
          { append },
        )
        // A handler that returned after every model call failed (a
        // swallowed stream error) failed all the same.
        const failure = failedRun(calls)
        if (failure) throw failure
      }
      catch (error) {
        await release()
        throw error
      }
      finally {
        // What its calls cost, done or failed: they were paid for either way.
        await recordCost(ctx, { userId: row.userId, owner: row.entityId }, calls)
      }
      await settle(result, calls)
    })

    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
    return response
  })

  return { stream, httpHandler }
}
