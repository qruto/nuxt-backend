import type { InjectionKey } from 'vue'
import { inject } from 'vue'
import { BaseConvexClient } from 'convex/browser'
import dedent from 'dedent'
import type {
  AuthTokenFetcher,
  BaseConvexClientOptions,
  ConnectionState,
  MutationOptions as BaseMutationOptions,
  OptimisticUpdate,
  QueryJournal,
  QueryOptions,
  QueryToken,
  SubscribeOptions,
  PaginationStatus,
} from 'convex/browser'
import type { Watch as ConvexWatch } from 'convex/react'
import type {
  ArgsAndOptions,
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs, UserIdentityAttributes,
} from 'convex/server'
import { getFunctionName } from 'convex/server'
import type { Value } from 'convex/values'

export type { AuthTokenFetcher, ConnectionState, OptimisticUpdate, QueryJournal }

/**
 * A live subscription to the output of a Convex query function.
 *
 * Returned by {@link ConvexVueClient.watchQuery}. Most component code should
 * use the {@link useQuery} composable instead.
 *
 * Shape is derived from `convex/react` for API parity (see React client.ts).
 * We extend to include internal `localQueryLogs` (present at runtime and in
 * Convex source, omitted from some public .d.ts builds).
 *
 * @public
 */
export interface Watch<T> extends ConvexWatch<T> {
  /** @internal */
  localQueryLogs(): string[] | undefined
}

/**
 * A watch on the output of a paginated Convex query function.
 *
 * @public
 */
export interface PaginatedWatch<T> {
  onUpdate(callback: () => void): () => void
  localQueryResult():
    | {
      results: T[]
      status: PaginationStatus
      loadMore: (numItems: number) => boolean
    }
    | undefined
}

/**
 * Options for {@link ConvexVueClient.watchQuery}.
 *
 * Pass a `journal` to resume a previously-saved query journal for faster
 * initial hydration.
 *
 * @public
 */
export interface WatchQueryOptions extends SubscribeOptions {
  /** @internal */
  componentPath?: string
}

/**
 * Options passed to {@link ConvexVueClient.mutation}.
 *
 * @public
 */
export type VueMutationOptions<Args extends Record<string, Value>> = Omit<
  BaseMutationOptions,
  'optimisticUpdate'
> & {
  optimisticUpdate?: OptimisticUpdate<Args> | undefined
}

/**
 * Construction options for {@link ConvexVueClient}.
 *
 * All options from `BaseConvexClientOptions` are accepted, such as
 * `webSocketConstructor` (needed for testing in Node.js environments).
 *
 * @public
 */
export interface ConvexVueClientOptions extends BaseConvexClientOptions {
  custom?: boolean
}

export type ConvexLogger = Exclude<BaseConvexClientOptions['logger'], boolean | undefined>

const noopLogger: ConvexLogger = {
  logVerbose() {},
  log() {},
  warn() {},
  error() {},
}

const defaultConsoleLogger: ConvexLogger = {
  logVerbose: (...args) => console.debug(...args),
  log: (...args) => console.log(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
}

// Local definition for the paginated client ctor getter (to match pasted react client
// logic for getter + method + field + handle + PaginationStatus etc).
// We intentionally do not import the internal PaginatedQueryClient (from
// convex/browser/sync/... which is not part of the public exports) to avoid
// "forbidden internals". The main paginated query composables use fully local
// implementations (local defs + local helpers) for parity. This keeps the
// low-level watchPaginatedQuery path falling back gracefully.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPaginatedQueryClientCtor(): any {
  // Always throw here so the try/catch in paginatedQueryClient getter surfaces
  // the documented "not available" message. This is the intended behavior when
  // not using the (non-exported) internal.
  throw new Error('getPaginatedQueryClientCtor: internal not available (local def avoids forbidden import)')
}

interface SyncClientWithInternals extends BaseConvexClient {
  setAdminAuth(token: string, identity?: UserIdentityAttributes): void
  localQueryLogs(udfPath: string, args?: Record<string, Value>): string[] | undefined
}

/**
 * The primary Convex client for Vue and Nuxt applications.
 *
 * Manages a WebSocket connection to the Convex backend and exposes methods
 * for subscribing to queries, running mutations, and executing actions.
 * The underlying WebSocket is created lazily so that no connection is opened
 * during server-side rendering.
 *
 * In a Nuxt app the client is automatically provided by the plugin and
 * available via the {@link useConvex} composable or `useNuxtApp().$convex`.
 *
 * @public
 */
export class ConvexVueClient {
  private address: string
  private cachedSync?: BaseConvexClient
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private cachedPaginatedQueryClient?: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private listeners: Map<any, Set<() => void>>
  private options: ConvexVueClientOptions
  private closed = false

  private adminAuth?: string
  private fakeUserIdentity?: UserIdentityAttributes

  constructor(address: string, options?: ConvexVueClientOptions) {
    if (address === undefined) {
      throw new Error(dedent`
        No address provided to ConvexVueClient.\n
        If trying to deploy to production, make sure to follow all the instructions found at https://docs.convex.dev/production/hosting/\n
        If running locally, make sure to run \`convex dev\` and ensure the .env.local file is populated.
      `)
    }
    if (typeof address !== 'string') {
      throw new TypeError(
        `ConvexVueClient requires a URL like 'https://happy-otter-123.convex.cloud', received ${typeof address}.`,
      )
    }
    if (!address.includes('://')) {
      throw new Error('Provided address was not an absolute URL.')
    }
    this.address = address
    this.listeners = new Map()
    this.options = { ...options }
  }

  /**
   * The deployment URL this client is connected to.
   */
  get url(): string {
    return this.address
  }

  /**
   * Lazily-instantiated underlying sync client.
   *
   * The WebSocket is not opened until this getter is first accessed, which
   * prevents unnecessary connections during SSR.
   *
   * @internal
   */
  get sync(): BaseConvexClient {
    if (this.closed) {
      throw new Error('ConvexVueClient has already been closed.')
    }
    if (this.cachedSync) {
      return this.cachedSync
    }
    this.cachedSync = new BaseConvexClient(
      this.address,
      (updatedQueries: QueryToken[]) => this.transition(updatedQueries),
      this.options,
    )
    if (this.adminAuth) {
      const sync = this.cachedSync as SyncClientWithInternals
      sync.setAdminAuth(this.adminAuth, this.fakeUserIdentity)
    }
    return this.cachedSync
  }

  /**
   * Lazily instantiate the `PaginatedQueryClient` so we don't create it
   * when server-side rendering.
   *
   * @internal
   */
  get paginatedQueryClient() {
    if (this.cachedPaginatedQueryClient) {
      return this.cachedPaginatedQueryClient
    }
    // access sync to ensure base
    void this.sync
    try {
      const PQC = getPaginatedQueryClientCtor()
      this.cachedPaginatedQueryClient = new PQC(
        this.cachedSync,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (transition: any) => this.handleTransition(transition),
      )
      return this.cachedPaginatedQueryClient
    }
    catch {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.cachedPaginatedQueryClient = null as any
      throw new Error(
        'PaginatedQueryClient is not available. This is an internal Convex detail; '
        + 'usePaginatedQuery_experimental currently falls back to a manual implementation.',
      )
    }
  }

  /**
   * Register a callback that returns the current auth token.
   *
   * Called by auth integrations (e.g. Better Auth) to pass tokens to the
   * Convex backend. Supply an optional `onChange` to be notified when the
   * server confirms the authenticated state.
   */
  setAuth(
    fetchToken: AuthTokenFetcher,
    onChange?: (isAuthenticated: boolean) => void,
  ): void {
    this.sync.setAuth(
      fetchToken,
      onChange ?? (() => {}),
    )
  }

  /**
   * Clear the current auth token and sign out from Convex.
   *
   * The underlying sync client is only contacted if it has already been
   * instantiated; calling this before the first WebSocket connection is a
   * safe no-op.
   */
  clearAuth(): void {
    this.sync.clearAuth()
  }

  /** @internal */
  setAdminAuth(token: string, identity?: UserIdentityAttributes): void {
    this.adminAuth = token
    this.fakeUserIdentity = identity
    if (this.closed) {
      throw new Error('ConvexVueClient has already been closed.')
    }
    if (this.cachedSync) {
      const sync = this.cachedSync as SyncClientWithInternals
      sync.setAdminAuth(token, identity)
    }
  }

  /**
   * Create a low-level {@link Watch} subscription to a Convex query.
   *
   * Prefer the {@link useQuery} composable for component code. Use
   * `watchQuery` directly when you need fine-grained control over subscription
   * lifecycle — e.g. in tests or outside a component setup context.
   */
  watchQuery<Query extends FunctionReference<'query'>>(
    query: Query,
    ...argsAndOptions: ArgsAndOptions<Query, WatchQueryOptions>
  ): Watch<FunctionReturnType<Query>> {
    const [args, options] = argsAndOptions
    const name = getFunctionName(query)

    return {
      onUpdate: (callback: () => void) => {
        const { queryToken, unsubscribe } = this.sync.subscribe(
          name,
          args,
          options,
        )

        const currentListeners = this.listeners.get(queryToken)
        if (currentListeners !== undefined) {
          currentListeners.add(callback)
        }
        else {
          this.listeners.set(queryToken, new Set([callback]))
        }

        return () => {
          if (this.closed) return

          const listeners = this.listeners.get(queryToken)!
          listeners.delete(callback)
          if (listeners.size === 0) {
            this.listeners.delete(queryToken)
          }
          unsubscribe()
        }
      },

      localQueryResult: () => {
        if (this.cachedSync) {
          return this.cachedSync.localQueryResult(name, args) as FunctionReturnType<Query> | undefined
        }
        return undefined
      },

      localQueryLogs: () => {
        if (this.cachedSync) {
          const sync = this.cachedSync as SyncClientWithInternals
          return sync.localQueryLogs(name, args)
        }
        return undefined
      },

      journal: () => {
        if (this.cachedSync) {
          return this.cachedSync.queryJournal(name, args)
        }
        return undefined
      },
    }
  }

  /**
   * Construct a new {@link PaginatedWatch} on a Convex paginated query function.
   *
   * **Most application code should not call this method directly. Instead use
   * the {@link usePaginatedQuery} composable.**
   *
   * The act of creating a watch does nothing, a Watch is stateless.
   *
   * @internal
   */
  watchPaginatedQuery<Query extends FunctionReference<'query'>>(
    query: Query,
    args: FunctionArgs<Query>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options: any,
  ): PaginatedWatch<FunctionReturnType<Query>> {
    const name = getFunctionName(query)
    const PQC = this.paginatedQueryClient // ensures created and lazy inits

    return {
      onUpdate: (callback: () => void) => {
        const { paginatedQueryToken, unsubscribe }
          = PQC.subscribe(name, (args || {}) as Record<string, Value>, options)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const currentListeners = this.listeners.get(paginatedQueryToken as any)
        if (currentListeners !== undefined) {
          currentListeners.add(callback)
        }
        else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          this.listeners.set(paginatedQueryToken as any, new Set([callback]))
        }

        return () => {
          if (this.closed) {
            return
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const currentListeners = this.listeners.get(paginatedQueryToken as any)!
          currentListeners.delete(callback)
          if (currentListeners.size === 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.listeners.delete(paginatedQueryToken as any)
          }
          unsubscribe()
        }
      },

      localQueryResult: () => {
        return PQC.localQueryResult(name, (args || {}) as Record<string, Value>, options) as
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          | { results: FunctionReturnType<Query>['page'], status: any, loadMore: any }
          | undefined
      },
    }
  }

  /**
   * Run a Convex mutation function.
   *
   * Returns a Promise that resolves to the mutation's return value once the
   * write has been committed on the server. Accepts an optional
   * `optimisticUpdate` to apply locally before the round-trip completes.
   */
  mutation<Mutation extends FunctionReference<'mutation'>>(
    mutation: Mutation,
    ...argsAndOptions: ArgsAndOptions<
      Mutation,
      VueMutationOptions<FunctionArgs<Mutation>>
    >
  ): Promise<FunctionReturnType<Mutation>> {
    const [args, options] = argsAndOptions
    const name = getFunctionName(mutation)
    return this.sync.mutation(name, args, options)
  }

  /**
   * Run a Convex action function.
   *
   * Actions run on the Convex backend and can call third-party services or
   * perform work that goes beyond what mutations allow. Returns a Promise of
   * the action's return value.
   */
  action<Action extends FunctionReference<'action'>>(
    action: Action,
    ...args: OptionalRestArgs<Action>
  ): Promise<FunctionReturnType<Action>> {
    const name = getFunctionName(action)
    return this.sync.action(name, ...args)
  }

  /**
   * Fetch a query result once as a Promise.
   *
   * Resolves immediately if a local result is already cached, otherwise waits
   * for the next update. Prefer {@link useQuery} in component code where
   * live reactivity is needed.
   */
  query<Query extends FunctionReference<'query'>>(
    query: Query,
    ...args: OptionalRestArgs<Query>
  ): Promise<FunctionReturnType<Query>> {
    const watch = this.watchQuery(query, ...args)
    const existingResult = watch.localQueryResult()
    if (existingResult !== undefined) {
      return Promise.resolve(existingResult)
    }
    return new Promise((resolve, reject) => {
      const unsubscribe = watch.onUpdate(() => {
        unsubscribe()
        try {
          resolve(watch.localQueryResult() as FunctionReturnType<Query>)
        }
        catch (e) {
          reject(e)
        }
      })
    })
  }

  /**
   * Return the current WebSocket connection state.
   *
   * For a reactive version inside components, use
   * {@link useConvexConnectionState}.
   */
  connectionState(): ConnectionState {
    return this.sync.connectionState()
  }

  /**
   * Register a callback invoked whenever the WebSocket connection state changes.
   *
   * Returns an unsubscribe function. In components, prefer
   * {@link useConvexConnectionState} which handles cleanup automatically.
   */
  subscribeToConnectionState(
    cb: (connectionState: ConnectionState) => void,
  ): () => void {
    return this.sync.subscribeToConnectionState(cb)
  }

  /**
   * Get the logger configured for this client.
   */
  get logger(): ConvexLogger {
    const logger = this.options.logger
    if (logger === false) {
      return noopLogger
    }
    if (logger && typeof logger === 'object') {
      return logger
    }
    return defaultConsoleLogger
  }

  /**
   * Subscribe to a query briefly to warm the local cache.
   *
   * Useful for prefetching data before navigating to a new route. The
   * subscription is automatically cancelled after `extendSubscriptionFor`
   * milliseconds (default 5 000 ms).
   *
   * @example
   * ```ts
   * // Prefetch on hover before the user navigates
   * convex.prewarmQuery({ query: api.tasks.list, args: {} })
   * ```
   */
  prewarmQuery<Query extends FunctionReference<'query'>>(
    queryOptions: QueryOptions<Query> & { extendSubscriptionFor?: number },
  ): void {
    const extendSubscriptionFor = queryOptions.extendSubscriptionFor ?? 5_000
    const watch = this.watchQuery(queryOptions.query, queryOptions.args)
    const unsubscribe = watch.onUpdate(() => {})
    setTimeout(unsubscribe, extendSubscriptionFor)
  }

  /**
   * Close the WebSocket and cancel all active subscriptions.
   *
   * Should be called when the client is no longer needed (e.g. during plugin
   * teardown). The client cannot be reused after this call.
   */
  async close(): Promise<void> {
    this.closed = true
    this.listeners = new Map()
    if (this.cachedSync) {
      const sync = this.cachedSync
      this.cachedSync = undefined
      await sync.close()
    }
  }

  private transition(updatedQueries: QueryToken[]): void {
    for (const queryToken of updatedQueries) {
      const callbacks = this.listeners.get(queryToken)
      if (callbacks) {
        for (const callback of callbacks) {
          callback()
        }
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleTransition(transition: any) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const simple = transition.queries.map((q: any) => q.token)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paginated = transition.paginatedQueries.map((q: any) => q.token)
    this.transition([...simple, ...paginated])
  }
}

/**
 * Vue injection key for the {@link ConvexVueClient}.
 *
 * Used with `provide` / `inject` to pass the client down the component tree.
 * The Nuxt plugin registers the client automatically; you only need this key
 * when writing manual tests or custom providers.
 *
 * @public
 */
export const ConvexClientKey: InjectionKey<ConvexVueClient> = Symbol('ConvexVueClient')

/**
 * Access the {@link ConvexVueClient} from any Vue composable or component.
 *
 * Reads the client that was registered by the Nuxt plugin (or a manual
 * `provide` call). Throws if called outside a component tree that has a
 * client provided.
 *
 * @returns The active {@link ConvexVueClient} instance.
 * @throws If no client has been provided in the component tree.
 *
 * @public
 */
export function useConvex(): ConvexVueClient {
  const client = inject(ConvexClientKey)
  if (!client) {
    throw new Error(dedent`
      Could not find Convex client! \`useConvex\` must be used in a component tree
      where the Convex client has been provided.
      In Nuxt, ensure the nuxt-backend module is installed.
    `)
  }
  return client
}
