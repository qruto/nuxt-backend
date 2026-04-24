/**
 * Server-side Better Auth + Convex integration for Nuxt.
 *
 * Provides {@link convexBetterAuth} — the Nuxt equivalent of
 * `convexBetterAuthNextJs` from `@convex-dev/better-auth/nextjs`.
 *
 * Instead of reading headers from `next/headers`, it accepts the H3
 * {@link H3Event} that is available in every Nuxt server route, API handler
 * and server middleware.
 *
 * @module
 */

import type { H3Event } from 'h3'
import { getRequestHeaders } from 'h3'
import { getToken } from '@convex-dev/better-auth/utils'
import type { GetTokenOptions } from '@convex-dev/better-auth/utils'
import type { FunctionReference, FunctionReturnType } from 'convex/server'
import type { Preloaded } from '../../vue/hydration'
import { fetchAction, fetchMutation, fetchQuery, preloadQuery } from '../../nuxt/index'

function getConvexSiteUrl(override?: string): string {
  const url = override ?? process.env.NUXT_PUBLIC_CONVEX_SITE_URL

  if (!url) {
    throw new Error(
      'Environment variable NUXT_PUBLIC_CONVEX_SITE_URL is not set. '
      + 'This is required to fetch a Convex auth token server-side. '
      + 'Set it in your .env file or via the `backend.siteUrl` option in nuxt.config.',
    )
  }

  if (url.endsWith('.convex.cloud')) {
    throw new Error(
      `NUXT_PUBLIC_CONVEX_SITE_URL should be your Convex Site URL (ending in .convex.site), `
      + `but it is currently set to ${url}.`,
    )
  }

  return url
}

/**
 * Options for {@link convexBetterAuth}.
 *
 * Extends {@link GetTokenOptions} from `@convex-dev/better-auth/utils` with
 * an optional override for the Convex site URL.
 *
 * @public
 */
export type ConvexBetterAuthOptions = GetTokenOptions & {
  /**
   * Override the Convex site URL. Defaults to `NUXT_PUBLIC_CONVEX_SITE_URL`.
   */
  convexSiteUrl?: string
}

/**
 * Create a per-request Better Auth + Convex helper for Nuxt server code.
 *
 * Mirrors `convexBetterAuthNextJs` from `@convex-dev/better-auth/nextjs` but
 * adapted for H3 events instead of `next/headers`.
 *
 * Call once at the top of a server route / event handler and destructure the
 * helpers you need. The auth token is fetched at most once per request (cached
 * inside the returned object).
 *
 * @example
 * ```ts
 * // server/api/profile.get.ts
 * export default defineEventHandler(async (event) => {
 *   const { fetchAuthQuery, isAuthenticated } = convexBetterAuth(event)
 *   if (!await isAuthenticated()) {
 *     throw createError({ statusCode: 401 })
 *   }
 *   return fetchAuthQuery(api.users.current)
 * })
 * ```
 *
 * @example
 * ```ts
 * // pages/profile.vue — preloading data for SSR
 * const { data } = await useAsyncData(async () => {
 *   const event = useRequestEvent()!
 *   return convexBetterAuth(event).preloadAuthQuery(api.users.current)
 * })
 * ```
 *
 * @param event - The H3 event from a Nuxt server route or middleware.
 * @param opts  - Optional {@link ConvexBetterAuthOptions}.
 *
 * @public
 */
export function convexBetterAuth(event: H3Event, opts?: ConvexBetterAuthOptions) {
  const siteUrl = getConvexSiteUrl(opts?.convexSiteUrl)

  // Per-request token cache — lazy, invalidated on forced refresh.
  type TokenResult = Awaited<ReturnType<typeof getToken>>
  let cached: TokenResult | null = null

  const getCachedToken = async ({ forceRefresh = false }: { forceRefresh?: boolean } = {}): Promise<TokenResult> => {
    if (cached && !forceRefresh) return cached

    const rawHeaders = getRequestHeaders(event)
    const headers = new Headers(rawHeaders as Record<string, string>)
    // Strip hop-by-hop headers that cause issues when forwarding.
    headers.delete('content-length')
    headers.delete('transfer-encoding')
    headers.set('accept-encoding', 'identity')

    cached = await getToken(siteUrl, headers, { ...opts, forceRefresh })
    return cached
  }

  /**
   * Run `fn` with the current auth token, retrying once with a fresh token if
   * the JWT cache is enabled and the call throws an auth error.
   */
  const callWithToken = async <T>(fn: (token: string | undefined) => Promise<T>): Promise<T> => {
    const tokenResult = await getCachedToken()
    try {
      return await fn(tokenResult.token)
    }
    catch (error) {
      if (
        !opts?.jwtCache?.enabled
        || tokenResult.isFresh
        || !opts.jwtCache.isAuthError(error)
      ) {
        throw error
      }
      const freshResult = await getCachedToken({ forceRefresh: true })
      return fn(freshResult.token)
    }
  }

  return {
    /**
     * Return the Convex JWT for the current user, or `undefined` when the user
     * is not authenticated.
     */
    getToken: async (): Promise<string | undefined> => {
      const result = await getCachedToken()
      return result.token
    },

    /**
     * Return `true` when the current request has a valid Convex auth token.
     */
    isAuthenticated: async (): Promise<boolean> => {
      const result = await getCachedToken()
      return !!result.token
    },

    /**
     * Preload a Convex query with the current user's auth token.
     * Pass the result to `usePreloadedQuery` in a client component.
     */
    preloadAuthQuery: <Query extends FunctionReference<'query'>>(
      query: Query,
      args?: Query['_args'],
    ): Promise<Preloaded<Query>> =>
      callWithToken(token =>
        preloadQuery(query, args ?? ({} as Query['_args']), { token }),
      ),

    /**
     * Execute a Convex query function with the current user's auth token.
     */
    fetchAuthQuery: <Query extends FunctionReference<'query'>>(
      query: Query,
      args?: Query['_args'],
    ): Promise<FunctionReturnType<Query>> =>
      callWithToken(token =>
        fetchQuery(query, args ?? ({} as Query['_args']), { token }),
      ),

    /**
     * Execute a Convex mutation function with the current user's auth token.
     */
    fetchAuthMutation: <Mutation extends FunctionReference<'mutation'>>(
      mutation: Mutation,
      args?: Mutation['_args'],
    ): Promise<FunctionReturnType<Mutation>> =>
      callWithToken(token =>
        fetchMutation(mutation, args ?? ({} as Mutation['_args']), { token }),
      ),

    /**
     * Execute a Convex action function with the current user's auth token.
     */
    fetchAuthAction: <Action extends FunctionReference<'action'>>(
      action: Action,
      args?: Action['_args'],
    ): Promise<FunctionReturnType<Action>> =>
      callWithToken(token =>
        fetchAction(action, args ?? ({} as Action['_args']), { token }),
      ),
  }
}
