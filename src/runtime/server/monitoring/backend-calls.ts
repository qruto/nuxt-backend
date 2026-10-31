import { getFunctionName, type FunctionReference } from 'convex/server'
import { convexAuth, type ConvexAuthEvent, type ConvexAuthOptions, type ConvexAuthService } from 'nuxt-convex-module/better-auth/server'
import { capturingBackendCall } from './capture'

// `backendAuth(event)`, auto-imported in `server/`: the base module's
// `convexAuth(event)`, unchanged, except that a call through it that fails
// with a crash or an `unavailable` refusal is reported, tagged with the
// function it ran and its code. A failed call on the server carries no
// function name of its own, so only its call site can tell.

/** A helper that takes a function reference first, reported under that function's name when it fails. */
function reported<Helper extends (ref: never, ...rest: never[]) => Promise<unknown>>(helper: Helper): Helper {
  const call = helper as unknown as (ref: FunctionReference<'query' | 'mutation' | 'action'>, ...rest: unknown[]) => Promise<unknown>
  return ((ref: FunctionReference<'query' | 'mutation' | 'action'>, ...rest: unknown[]) => capturingBackendCall(getFunctionName(ref), () => call(ref, ...rest))) as unknown as Helper
}

/**
 * The signed-in caller's backend client for one request: the base module's
 * `convexAuth(event)`, whose calls (`fetchAuthQuery`, `fetchAuthMutation`,
 * `fetchAuthAction`, `preloadAuthQuery`) are reported when they fail. It
 * takes the event either `defineEventHandler` passes, from `nuxt/server` or
 * the auto-imported one, or `useRequestEvent()` during SSR.
 */
export function backendAuth(event: ConvexAuthEvent, opts?: ConvexAuthOptions): ConvexAuthService {
  const service = convexAuth(event, opts)
  return {
    ...service,
    fetchAuthQuery: reported(service.fetchAuthQuery),
    fetchAuthMutation: reported(service.fetchAuthMutation),
    fetchAuthAction: reported(service.fetchAuthAction),
    preloadAuthQuery: reported(service.preloadAuthQuery),
  }
}
