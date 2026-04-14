import { ConvexHttpClient } from 'convex/browser'
import type { FunctionReference, FunctionArgs, FunctionReturnType } from 'convex/server'
import { useRuntimeConfig } from '#imports'
import { getToken, isAuthenticated } from './auth'

type QueryReference = FunctionReference<'query'>
type MutationReference = FunctionReference<'mutation'>
type ActionReference = FunctionReference<'action'>
type AnyReference = QueryReference | MutationReference | ActionReference

type OptionalArgs<Reference extends AnyReference> = FunctionArgs<Reference> extends Record<string, never>
  ? [args?: FunctionArgs<Reference>]
  : [args: FunctionArgs<Reference>]

function getHttpClient(token?: string | null): ConvexHttpClient {
  const config = useRuntimeConfig()
  const client = new ConvexHttpClient(config.public.backend.url)
  if (token) {
    client.setAuth(token)
  }
  return client
}

function resolveArgs<Reference extends AnyReference>(
  args: OptionalArgs<Reference>,
): FunctionArgs<Reference> {
  return (args[0] ?? {}) as FunctionArgs<Reference>
}

function normalizeAuthCall<Reference extends AnyReference>(
  tokenOrReference: string | Reference,
  referenceOrArgs: Reference | FunctionArgs<Reference> | undefined,
  args: OptionalArgs<Reference>,
) {
  if (typeof tokenOrReference === 'string') {
    return {
      token: tokenOrReference,
      reference: referenceOrArgs as Reference,
      args,
    }
  }

  return {
    token: null,
    reference: tokenOrReference,
    args: (
      referenceOrArgs === undefined
        ? []
        : [referenceOrArgs as FunctionArgs<Reference>]
    ) as OptionalArgs<Reference>,
  }
}

// --- Plain server-side utilities ---

export async function fetchQuery<Query extends QueryReference>(
  query: Query,
  ...args: OptionalArgs<Query>
): Promise<FunctionReturnType<Query>> {
  const client = getHttpClient()
  return client.query(query, resolveArgs(args))
}

export async function fetchMutation<Mutation extends MutationReference>(
  mutation: Mutation,
  ...args: OptionalArgs<Mutation>
): Promise<FunctionReturnType<Mutation>> {
  const client = getHttpClient()
  return client.mutation(mutation, resolveArgs(args))
}

export async function fetchAction<Action extends ActionReference>(
  action: Action,
  ...args: OptionalArgs<Action>
): Promise<FunctionReturnType<Action>> {
  const client = getHttpClient()
  return client.action(action, resolveArgs(args))
}

// --- Authenticated variants (inject token from session cookie) ---

export async function fetchAuthQuery<Query extends QueryReference>(
  query: Query,
  ...args: OptionalArgs<Query>
): Promise<FunctionReturnType<Query>>
export async function fetchAuthQuery<Query extends QueryReference>(
  token: string,
  query: Query,
  ...args: OptionalArgs<Query>
): Promise<FunctionReturnType<Query>>
export async function fetchAuthQuery<Query extends QueryReference>(
  tokenOrQuery: string | Query,
  queryOrArgs?: Query | FunctionArgs<Query>,
  ...args: OptionalArgs<Query>
): Promise<FunctionReturnType<Query>> {
  const call = normalizeAuthCall(tokenOrQuery, queryOrArgs, args)
  const client = getHttpClient(call.token ?? await getToken())
  return client.query(call.reference, resolveArgs(call.args))
}

export async function fetchAuthMutation<Mutation extends MutationReference>(
  mutation: Mutation,
  ...args: OptionalArgs<Mutation>
): Promise<FunctionReturnType<Mutation>>
export async function fetchAuthMutation<Mutation extends MutationReference>(
  token: string,
  mutation: Mutation,
  ...args: OptionalArgs<Mutation>
): Promise<FunctionReturnType<Mutation>>
export async function fetchAuthMutation<Mutation extends MutationReference>(
  tokenOrMutation: string | Mutation,
  mutationOrArgs?: Mutation | FunctionArgs<Mutation>,
  ...args: OptionalArgs<Mutation>
): Promise<FunctionReturnType<Mutation>> {
  const call = normalizeAuthCall(tokenOrMutation, mutationOrArgs, args)
  const client = getHttpClient(call.token ?? await getToken())
  return client.mutation(call.reference, resolveArgs(call.args))
}

export async function fetchAuthAction<Action extends ActionReference>(
  action: Action,
  ...args: OptionalArgs<Action>
): Promise<FunctionReturnType<Action>>
export async function fetchAuthAction<Action extends ActionReference>(
  token: string,
  action: Action,
  ...args: OptionalArgs<Action>
): Promise<FunctionReturnType<Action>>
export async function fetchAuthAction<Action extends ActionReference>(
  tokenOrAction: string | Action,
  actionOrArgs?: Action | FunctionArgs<Action>,
  ...args: OptionalArgs<Action>
): Promise<FunctionReturnType<Action>> {
  const call = normalizeAuthCall(tokenOrAction, actionOrArgs, args)
  const client = getHttpClient(call.token ?? await getToken())
  return client.action(call.reference, resolveArgs(call.args))
}

// --- Preloading utilities ---

export interface PreloadedQuery<Result = unknown> {
  _result: Result
  _queryReference: string
}

export async function preloadQuery<Query extends QueryReference>(
  query: Query,
  ...args: OptionalArgs<Query>
): Promise<PreloadedQuery<FunctionReturnType<Query>>> {
  const result = await fetchQuery(query, ...args)
  return { _result: result, _queryReference: query.toString() }
}

export async function preloadAuthQuery<Query extends QueryReference>(
  query: Query,
  ...args: OptionalArgs<Query>
): Promise<PreloadedQuery<FunctionReturnType<Query>>>
export async function preloadAuthQuery<Query extends QueryReference>(
  token: string,
  query: Query,
  ...args: OptionalArgs<Query>
): Promise<PreloadedQuery<FunctionReturnType<Query>>>
export async function preloadAuthQuery<Query extends QueryReference>(
  tokenOrQuery: string | Query,
  queryOrArgs?: Query | FunctionArgs<Query>,
  ...args: OptionalArgs<Query>
): Promise<PreloadedQuery<FunctionReturnType<Query>>> {
  const call = normalizeAuthCall(tokenOrQuery, queryOrArgs, args)
  const client = getHttpClient(call.token ?? await getToken())
  const result = await client.query(call.reference, resolveArgs(call.args))
  return { _result: result, _queryReference: call.reference.toString() }
}

export function preloadedQueryResult<Result>(
  preloaded: PreloadedQuery<Result>,
): Result {
  return preloaded._result
}

export { getToken, isAuthenticated }
