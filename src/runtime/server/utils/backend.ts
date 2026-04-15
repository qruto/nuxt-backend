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

// --- Authenticated variants (inject token from session cookie) ---

function getAuthenticatedClient(token: string): ConvexHttpClient {
  const client = getHttpClient()
  client.setAuth(token)
  return client
}

export async function fetchAuthQuery<Query extends QueryReference>(
  token: string,
  query: Query,
  args: FunctionArgs<Query>,
): Promise<FunctionReturnType<Query>> {
  const client = getAuthenticatedClient(token)
  return client.query(query, args)
}

export async function fetchAuthMutation<Mutation extends MutationReference>(
  token: string,
  mutation: Mutation,
  args: FunctionArgs<Mutation>,
): Promise<FunctionReturnType<Mutation>> {
  const client = getAuthenticatedClient(token)
  return client.mutation(mutation, args)
}

export async function fetchAuthAction<Action extends ActionReference>(
  token: string,
  action: Action,
  args: FunctionArgs<Action>,
): Promise<FunctionReturnType<Action>> {
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

export async function preloadAuthQuery<Query extends QueryReference>(
  token: string,
  query: Query,
  args: FunctionArgs<Query>,
): Promise<PreloadedQuery<FunctionReturnType<Query>>> {
  const result = await fetchAuthQuery(token, query, args)
  return { _result: result, _queryReference: query.toString() }
}

export function preloadedQueryResult<Result>(
  preloaded: PreloadedQuery<Result>,
): Result {
  return preloaded._result
}
