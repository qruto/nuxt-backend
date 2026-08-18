import { createError, type H3Event } from 'h3'
import { useEvent } from 'nitropack/runtime'
import { fetchAction, fetchMutation, fetchQuery } from 'nuxt-convex-module/server'
import { defineMcpTool, type McpToolDefinition } from '@nuxtjs/mcp-toolkit/server'
import type { ZodRawShape } from 'zod'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import type { BackendMcpSession } from './session'

export type { BackendMcpSession } from './session'
export { createExchangeCache, EXCHANGE_CACHE_MARGIN_MS, type ExchangeCache } from './cache'
export { BACKEND_MCP_FUNCTION_DEFAULTS, backendMcpFunction, builtinToolEnabled, type BackendMcpFunctionKey, type BackendMcpToolName } from './builtin'

declare module 'h3' {
  interface H3EventContext {
    /** Set by the MCP gate: the authenticated agent behind this request. */
    backendMcp?: BackendMcpSession
  }
}

/** The per-request agent context {@link useBackendMcp} returns. */
export interface BackendMcp {
  session: BackendMcpSession
  hasScope: (scope: string) => boolean
  /** Convex fetchers bound to the agent's short-lived user JWT. */
  fetchQuery: <Query extends FunctionReference<'query'>>(query: Query, args?: FunctionArgs<Query>) => Promise<FunctionReturnType<Query>>
  fetchMutation: <Mutation extends FunctionReference<'mutation'>>(mutation: Mutation, args?: FunctionArgs<Mutation>) => Promise<FunctionReturnType<Mutation>>
  fetchAction: <Action extends FunctionReference<'action'>>(action: Action, args?: FunctionArgs<Action>) => Promise<FunctionReturnType<Action>>
}

/**
 * The authenticated agent session behind the current MCP request, with
 * Convex fetchers bound to the user's short-lived JWT — so tool handlers
 * call deployment functions exactly as that signed-in user (`ctx.auth`,
 * workspace and billing entity resolution all behave like a web session).
 *
 * Pass the H3 event where you have it; without one the current request is
 * read from Nitro's async context (enabled by the module). Throws a 401
 * H3Error when the request carries no agent session (the MCP gate answers
 * unauthenticated requests before tools run, so this only trips when called
 * outside a gated route).
 */
export function useBackendMcp(event?: H3Event): BackendMcp {
  const resolvedEvent = event ?? useEvent()
  const session = resolvedEvent?.context.backendMcp
  if (!session) {
    throw createError({ statusCode: 401, message: 'No agent session — useBackendMcp() only works behind the MCP gate.' })
  }
  const token = { token: session.convexToken }
  return {
    session,
    hasScope: scope => session.scopes.includes(scope),
    fetchQuery: (query, args) => fetchQuery(query, (args ?? {}) as never, token),
    fetchMutation: (mutation, args) => fetchMutation(mutation, (args ?? {}) as never, token),
    fetchAction: (action, args) => fetchAction(action, (args ?? {}) as never, token),
  }
}

export type BackendMcpToolDefinition<
  InputSchema extends ZodRawShape | undefined = ZodRawShape,
  OutputSchema extends ZodRawShape = ZodRawShape,
> = McpToolDefinition<InputSchema, OutputSchema> & {
  /**
   * OAuth scope required for this tool. Agents without it never see the tool
   * in `tools/list`, and a direct call is refused — the handler-side check
   * matters because list-time hiding is only advisory.
   */
  scope?: string
}

/**
 * `defineMcpTool` with the agent-session contract: the tool is hidden from
 * unauthenticated requests, hidden without the required `scope`, and the
 * scope is re-checked when the handler runs. Compose extra visibility rules
 * via the standard `enabled` guard — it runs after the session/scope gate.
 */
export function defineBackendMcpTool<
  const InputSchema extends ZodRawShape | undefined = ZodRawShape,
  const OutputSchema extends ZodRawShape = ZodRawShape,
>(
  definition: BackendMcpToolDefinition<InputSchema, OutputSchema>,
): McpToolDefinition<InputSchema, OutputSchema> {
  const { scope, enabled, handler, ...rest } = definition
  return defineMcpTool<InputSchema, OutputSchema>({
    ...rest as McpToolDefinition<InputSchema, OutputSchema>,
    enabled: async (event) => {
      const session = event.context.backendMcp
      if (!session) return false
      if (scope && !session.scopes.includes(scope)) return false
      return enabled ? await enabled(event) : true
    },
    handler: (async (...args: unknown[]) => {
      if (scope && !useBackendMcp().hasScope(scope)) {
        throw createError({ statusCode: 403, message: `Missing required scope "${scope}".` })
      }
      return (handler as (...handlerArgs: unknown[]) => unknown)(...args)
    }) as McpToolDefinition<InputSchema, OutputSchema>['handler'],
  })
}
