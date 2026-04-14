import { ConvexHttpClient } from 'convex/browser'
import type { FunctionReference, FunctionArgs, FunctionReturnType } from 'convex/server'
import { useRuntimeConfig } from '#imports'

type QueryReference = FunctionReference<'query'>
type MutationReference = FunctionReference<'mutation'>
type ActionReference = FunctionReference<'action'>

function getHttpClient(): ConvexHttpClient {
  const config = useRuntimeConfig()
  return new ConvexHttpClient(config.public.backend.url)
}

/**
 * Get the current auth token by exchanging the session cookie with the
 * Convex site's `/api/auth/convex/token` endpoint.
 *
 * Works in Nitro server handlers / API routes where `useState` is not available.
 */
export async function getToken(event?: { headers: { get(name: string): string | null } }): Promise<string | null> {
  const config = useRuntimeConfig()
  const siteUrl = config.backend.siteUrl
  if (!siteUrl) return null

  const cookieHeader = event?.headers.get('cookie')
  if (!cookieHeader) return null

  try {
    const response = await fetch(`${siteUrl}/api/auth/convex/token`, {
      headers: { Cookie: cookieHeader },
    })
    if (!response.ok) return null
    const data = await response.json() as { token?: string }
    return data?.token ?? null
  }
  catch {
    return null
  }
}

/**
 * Check if the current request is authenticated.
 */
export async function isAuthenticated(event?: { headers: { get(name: string): string | null } }): Promise<boolean> {
  const token = await getToken(event)
  return !!token
}

// --- Plain server-side utilities ---

export async function fetchQuery<Query extends QueryReference>(
  query: Query,
  args: FunctionArgs<Query>,
): Promise<FunctionReturnType<Query>> {
  const client = getHttpClient()
  return client.query(query, args)
}

export async function fetchMutation<Mutation extends MutationReference>(
  mutation: Mutation,
  args: FunctionArgs<Mutation>,
): Promise<FunctionReturnType<Mutation>> {
  const client = getHttpClient()
  return client.mutation(mutation, args)
}

export async function fetchAction<Action extends ActionReference>(
  action: Action,
  args: FunctionArgs<Action>,
): Promise<FunctionReturnType<Action>> {
  const client = getHttpClient()
  return client.action(action, args)
}

// --- Authenticated variants (auto-extract token or accept explicit token) ---

function getAuthenticatedClient(token: string): ConvexHttpClient {
  const client = getHttpClient()
  client.setAuth(token)
  return client
}

/**
 * Run an authenticated query. Pass an explicit token or an H3 event to
 * extract the token automatically.
 */
export async function fetchAuthQuery<Query extends QueryReference>(
  tokenOrEvent: string | { headers: { get(name: string): string | null } },
  query: Query,
  args: FunctionArgs<Query>,
): Promise<FunctionReturnType<Query>> {
  const token = typeof tokenOrEvent === 'string'
    ? tokenOrEvent
    : await getToken(tokenOrEvent)
  if (!token) throw new Error('[nuxt-backend] No auth token available for fetchAuthQuery')
  const client = getAuthenticatedClient(token)
  return client.query(query, args)
}

/**
 * Run an authenticated mutation. Pass an explicit token or an H3 event.
 */
export async function fetchAuthMutation<Mutation extends MutationReference>(
  tokenOrEvent: string | { headers: { get(name: string): string | null } },
  mutation: Mutation,
  args: FunctionArgs<Mutation>,
): Promise<FunctionReturnType<Mutation>> {
  const token = typeof tokenOrEvent === 'string'
    ? tokenOrEvent
    : await getToken(tokenOrEvent)
  if (!token) throw new Error('[nuxt-backend] No auth token available for fetchAuthMutation')
  const client = getAuthenticatedClient(token)
  return client.mutation(mutation, args)
}

/**
 * Run an authenticated action. Pass an explicit token or an H3 event.
 */
export async function fetchAuthAction<Action extends ActionReference>(
  tokenOrEvent: string | { headers: { get(name: string): string | null } },
  action: Action,
  args: FunctionArgs<Action>,
): Promise<FunctionReturnType<Action>> {
  const token = typeof tokenOrEvent === 'string'
    ? tokenOrEvent
    : await getToken(tokenOrEvent)
  if (!token) throw new Error('[nuxt-backend] No auth token available for fetchAuthAction')
  const client = getAuthenticatedClient(token)
  return client.action(action, args)
}

// --- Preloading utilities ---

export interface PreloadedQuery<Result = unknown> {
  _result: Result
  _queryReference: string
}

export async function preloadQuery<Query extends QueryReference>(
  query: Query,
  args: FunctionArgs<Query>,
): Promise<PreloadedQuery<FunctionReturnType<Query>>> {
  const result = await fetchQuery(query, args)
  return { _result: result, _queryReference: query.toString() }
}

/**
 * Preload an authenticated query. Pass an explicit token or an H3 event.
 */
export async function preloadAuthQuery<Query extends QueryReference>(
  tokenOrEvent: string | { headers: { get(name: string): string | null } },
  query: Query,
  args: FunctionArgs<Query>,
): Promise<PreloadedQuery<FunctionReturnType<Query>>> {
  const result = await fetchAuthQuery(tokenOrEvent, query, args)
  return { _result: result, _queryReference: query.toString() }
}

export function preloadedQueryResult<Result>(
  preloaded: PreloadedQuery<Result>,
): Result {
  return preloaded._result
}
