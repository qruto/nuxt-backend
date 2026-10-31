import type { FunctionReference, GenericActionCtx, GenericDataModel } from 'convex/server'
import { backendError, type BackendErrorPayload } from './errors.js'
import { PAUSE_FLAGS, type PausableService } from './flags.js'
import type { ConvexError } from 'convex/values'

// The package's kill switches, where it honors them: sign-ups in the auth
// layer, checkout in billing, model calls in the AI layer. Each reads its
// switch from the `backend` component's flags on the call it pauses, so an
// administrator's change holds from the next call on, with no deploy.

/** The component's read of one flag's override, as the layers reach it. */
type FlagRead = FunctionReference<'query', 'internal', { key: string }, { override: { enabled?: boolean } } | null>

/** A context that can run the component's queries: any query, mutation or action ctx. */
interface ReadCtx {
  runQuery: GenericActionCtx<GenericDataModel>['runQuery']
}

/** Whether a service is paused now. */
export type PauseCheck = (ctx: ReadCtx, service: PausableService) => Promise<boolean>

/**
 * The pause check over the `backend` component (`components.backend`, read
 * structurally): whether the kill switch of a service is on. A component
 * built before flags pauses nothing.
 */
export function pauseCheck(backend: unknown): PauseCheck {
  const get = (backend as { flags?: { get?: FlagRead } } | undefined)?.flags?.get
  return async (ctx, service) => {
    if (!get) return false
    const row = await ctx.runQuery(get, { key: PAUSE_FLAGS[service] })
    return row?.override.enabled === true
  }
}

/** The English detail each paused service logs. */
const PAUSED = {
  signups: 'New sign-ups are paused (the pause_signups kill switch is on).',
  checkout: 'Checkout is paused (the pause_checkout kill switch is on).',
  ai: 'AI is paused (the pause_ai kill switch is on).',
} as const satisfies Record<PausableService, string>

/** The fields a paused service is refused with: `unavailable`, the service, and the reason `<service>_paused`. */
export function pausedData(service: PausableService): { service: PausableService, reason: `${PausableService}_paused` } {
  return { service, reason: `${service}_paused` }
}

/** The refusal of a call a kill switch pauses. */
export function pausedRefusal(service: PausableService): ConvexError<BackendErrorPayload<'unavailable'>> {
  return backendError('unavailable', pausedData(service), `[nuxt-backend] ${PAUSED[service]}`)
}

/** Refuse the call when its service is paused. */
export async function refusePaused(check: PauseCheck, ctx: ReadCtx, service: PausableService): Promise<void> {
  if (await check(ctx, service)) throw pausedRefusal(service)
}
