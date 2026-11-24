import { makeFunctionReference, type FunctionReference } from 'convex/server'
import { fetchAction, fetchMutation, fetchQuery, preloadQuery } from 'nuxt-convex-module/server'
import auth from '#convex/auth-server'

// What `nuxt-convex-module/better-auth/server` resolves to in a Convex Auth
// app: `convexBetterAuthNuxt(event)`, the server's calls as the signed-in
// person, with the access token Convex Auth's proxy refreshed for this
// request (`server/convex-auth.ts`, or the package's own). `backendAuth`,
// the page guard and the health route read it unchanged.

/** The event either `defineEventHandler` passes, or `useRequestEvent()`. */
type ServerEvent = Parameters<typeof auth.convexAuthNuxtAccessToken>[0]

type AnyRef = FunctionReference<'query' | 'mutation' | 'action'>

const AUTH_REQUEST = makeFunctionReference<'action', Record<string, unknown>, { status: number, body: unknown }>('auth:authRequest')

/** The signed-in caller's backend client for one request. */
export function convexBetterAuthNuxt(event: ServerEvent, _opts?: unknown) {
  const getToken = async (): Promise<string | undefined> => (await auth.convexAuthNuxtAccessToken(event)) ?? undefined
  const withToken = <Fn extends (ref: never, args: never, options: { token?: string }) => Promise<unknown>>(call: Fn) =>
    async (ref: AnyRef, ...args: unknown[]) => (call as unknown as (ref: AnyRef, args: unknown, options: { token?: string }) => Promise<unknown>)(ref, args[0] ?? {}, { token: await getToken() })
  return {
    getToken,
    isAuthenticated: () => auth.isAuthenticatedNuxt(event),
    handler: () => {
      throw new Error('[nuxt-backend] A Convex Auth app has no Better Auth route to proxy: its auth runs in the deployment\'s functions.')
    },
    fetchAuthQuery: withToken(fetchQuery as never),
    fetchAuthMutation: withToken(fetchMutation as never),
    fetchAuthAction: withToken(fetchAction as never),
    preloadAuthQuery: withToken(preloadQuery as never),
    /** One account engine route as the caller (`GET /organization/get-active-member`): its body, or `null` when it refused. */
    fetchEngine: async (path: string): Promise<unknown> => {
      const token = await getToken()
      if (!token) return null
      const answer = await fetchAction(AUTH_REQUEST, { method: 'GET', path }, { token })
      return answer.status < 400 ? answer.body : null
    },
  }
}

/** The old name, as the base module keeps it. */
export const convexAuth = convexBetterAuthNuxt
