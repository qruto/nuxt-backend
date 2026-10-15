import { actionGeneric, httpActionGeneric, queryGeneric, type GenericActionCtx, type GenericDataModel } from 'convex/server'
import { v, type PropertyValidators } from 'convex/values'
import type { StreamId } from '@convex-dev/persistent-text-streaming'
import type { SpendReservation } from '../billing.js'
import type { Ai, MeteredStreamConfig, MeteredUsage } from './config.js'
import type { AiContext } from './context.js'
import type { AiMetering } from './metering.js'
import { estimateCost, finalizeCost } from './pricing.js'
import { logBackend } from '../../log.js'

/**
 * Metered, persisted token streams: `start` reserves the credits, creates the
 * stream and arms the abandon timer; the HTTP dispatcher runs the registered
 * handler, then settles a delivered stream or releases an interrupted one.
 */
export function createStreams(
  { billing, pts, requests, cache, corsOrigin, streamTimeout, streamRegistry }: AiContext,
  { prepare, closeSpend }: AiMetering,
): Pick<Ai, 'stream' | 'httpHandler'> {
  const stream: Ai['stream'] = (definition) => {
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
        // before the HTTP call, or died mid-flight) would otherwise hold its
        // credits until the TTL pruned the reservation — and a pruned
        // reservation is never re-credited, only re-synced. Schedule the
        // release now and cancel it when the stream settles.
        if (reservation.reserved && streamTimeout !== false) {
          try {
            const jobId = await ctx.scheduler.runAfter(streamTimeout, cache.release, {
              userId: reservation.entityId,
              externalId: reservation.externalId,
            })
            await ctx.runMutation(cache.attachReleaseJob, {
              userId: reservation.entityId,
              externalId: reservation.externalId,
              jobId,
            })
          }
          catch (error) {
            // The timer is an improvement on the reservation TTL, never a
            // precondition for streaming: a stream must not fail to start
            // because its safety net could not be armed.
            logBackend('warn', 'ai.stream_release_unscheduled', 'Could not schedule the stream reservation release — falling back to the pending-spend TTL.', error)
          }
        }
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
    let result: unknown
    const response = await pts.stream(ctx, request, streamId as StreamId, async (streamCtx, _request, _id, append) => {
      try {
        result = await definition.handler(
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
        if (definition.meter !== false) {
          await closeSpend(ctx as never, usage, reservation, {
            finalAmount: finalizeCost(definition.cost, result, usage),
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

    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
    return response
  })

  return { stream, httpHandler }
}
