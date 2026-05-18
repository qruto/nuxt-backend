/**
 * Helpers for integrating Convex into Nuxt applications using server rendering.
 *
 * This module contains:
 * 1. {@link preloadQuery}, for preloading data for reactive client components.
 * 2. {@link fetchQuery}, {@link fetchMutation} and {@link fetchAction} for loading
 *    and mutating Convex data from Nuxt server routes, API handlers, and middleware.
 *
 * All exported functions assume that a Convex deployment URL is set in the
 * `NUXT_PUBLIC_CONVEX_URL` environment variable.
 *
 * @module
 */

import { ConvexHttpClient } from 'convex/browser'
import type {
  ArgsAndOptions,
  FunctionReference,
  FunctionReturnType,
} from 'convex/server'
import { getFunctionName } from 'convex/server'
import { convexToJson, jsonToConvex } from 'convex/values'
import type { Preloaded } from '../vue/hydration'
import { getBackendRuntimeConfig } from './config'

/**
 * Options for {@link preloadQuery}, {@link fetchQuery}, {@link fetchMutation}
 * and {@link fetchAction}.
 *
 * @public
 */
export interface NuxtConvexOptions {
  /**
   * The JWT-encoded OpenID Connect authentication token to use for the function call.
   */
  token?: string
  /**
   * The URL of the Convex deployment to use. Defaults to `process.env.NUXT_PUBLIC_CONVEX_URL`.
   */
  url?: string
  /**
   * Skip validating that the deployment URL looks like
   * `https://happy-animal-123.convex.cloud` or localhost.
   */
  skipConvexDeploymentUrlCheck?: boolean
}

interface ConvexHttpClientWithFetchOptions extends ConvexHttpClient {
  setFetchOptions(options: RequestInit): void
}

function getConvexUrl(deploymentUrl: string | undefined): string {
  const runtimeUrl = getBackendRuntimeConfig().url
  const url = deploymentUrl
    ?? runtimeUrl
    ?? process.env.NUXT_PUBLIC_CONVEX_URL

  if (typeof url !== 'string' || !url) {
    throw new Error(
      deploymentUrl === undefined
        ? 'Environment variable NUXT_PUBLIC_CONVEX_URL is not set.'
        : 'Convex function called with invalid deployment address.',
    )
  }
  return url
}

function setupClient(options: NuxtConvexOptions): ConvexHttpClient {
  const client = new ConvexHttpClient(getConvexUrl(options.url)) as ConvexHttpClientWithFetchOptions
  if (options.token !== undefined) {
    client.setAuth(options.token)
  }
  client.setFetchOptions({ cache: 'no-store' })
  return client
}

/**
 * Execute a Convex query function and return a `Preloaded` payload
 * which can be passed to `usePreloadedQuery` in a client component.
 *
 * @param query - A FunctionReference for the public query to run.
 * @param args - The query arguments and optional {@link NuxtConvexOptions}
 *   passed as the final argument.
 * @returns A promise of the `Preloaded` payload.
 *
 * @public
 */
export async function preloadQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  ...args: ArgsAndOptions<Query, NuxtConvexOptions>
): Promise<Preloaded<Query>> {
  const value = await fetchQuery(query, ...args)
  const preloaded = {
    _name: getFunctionName(query),
    _argsJSON: convexToJson(args[0] ?? {}),
    _valueJSON: convexToJson(value),
  }
  return preloaded as Preloaded<Query>
}

/**
 * Returns the result of executing a query via `preloadQuery`.
 *
 * @param preloaded - The `Preloaded` payload returned by `preloadQuery`.
 * @returns The query result.
 *
 * @public
 */
export function preloadedQueryResult<Query extends FunctionReference<'query'>>(
  preloaded: Preloaded<Query>,
): FunctionReturnType<Query> {
  return jsonToConvex(preloaded._valueJSON)
}

/**
 * Execute a Convex query function.
 *
 * @param query - A FunctionReference for the public query to run.
 * @param args - The query arguments and optional {@link NuxtConvexOptions}
 *   passed as the final argument.
 * @returns A promise of the query's result.
 *
 * @public
 */
export async function fetchQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  ...args: ArgsAndOptions<Query, NuxtConvexOptions>
): Promise<FunctionReturnType<Query>> {
  const [fnArgs, options] = args
  const client = setupClient(options ?? {})
  return client.query(query, fnArgs || {})
}

/**
 * Execute a Convex mutation function.
 *
 * @param mutation - A FunctionReference for the public mutation to run.
 * @param args - The mutation arguments and optional {@link NuxtConvexOptions}
 *   passed as the final argument.
 * @returns A promise of the mutation's result.
 *
 * @public
 */
export async function fetchMutation<Mutation extends FunctionReference<'mutation'>>(
  mutation: Mutation,
  ...args: ArgsAndOptions<Mutation, NuxtConvexOptions>
): Promise<FunctionReturnType<Mutation>> {
  const [fnArgs, options] = args
  const client = setupClient(options ?? {})
  return client.mutation(mutation, fnArgs || {})
}

/**
 * Execute a Convex action function.
 *
 * @param action - A FunctionReference for the public action to run.
 * @param args - The action arguments and optional {@link NuxtConvexOptions}
 *   passed as the final argument.
 * @returns A promise of the action's result.
 *
 * @public
 */
export async function fetchAction<Action extends FunctionReference<'action'>>(
  action: Action,
  ...args: ArgsAndOptions<Action, NuxtConvexOptions>
): Promise<FunctionReturnType<Action>> {
  const [fnArgs, options] = args
  const client = setupClient(options ?? {})
  return client.action(action, fnArgs || {})
}
