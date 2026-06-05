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
// Mirrors `ConvexReactClientOptions`: an (intentionally empty) interface rather
// than a type alias, so consumers can augment it and the public surface matches
// the React client.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ConvexVueClientOptions extends BaseConvexClientOptions {}

export type ConvexLogger = Exclude<BaseConvexClientOptions['logger'], boolean | undefined>

const noopLogger: ConvexLogger = {
  logVerbose() {},
  log() {},
  warn() {},
  error() {},
}

/**
 * Build the default console-backed logger.
 *
 * Mirrors the observable behaviour of Convex's internal
 * `instantiateDefaultLogger`: `logVerbose` lines are only emitted when
 * `verbose` is enabled. Convex's `DefaultLogger` / `instantiateDefaultLogger`
 * helpers are not part of the public `convex/browser` exports, so we
 * reconstruct equivalent behaviour from the public `Logger` shape rather than
 * reaching into Convex internals.
 */
function defaultLogger(verbose: boolean): ConvexLogger {
  return {
    logVerbose: (...args) => {
      if (verbose) console.debug(...args)
    },
    log: (...args) => console.log(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
  }
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
  private listeners: Map<any, Set<() => void>>
  private options: ConvexVueClientOptions
  private closed = false
  private _logger: ConvexLogger

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
    // Resolve the logger once and hand the *same* instance to the underlying
    // BaseConvexClient via `options.logger`, so `client.logger` and the SDK's
    // internal logging share a single logger that honours `verbose`. This
    // mirrors ConvexReactClient's `_logger` wiring (which uses the non-exported
    // instantiateDefaultLogger/instantiateNoopLogger helpers).
    this._logger
      = options?.logger === false
        ? noopLogger
        : options?.logger !== true && options?.logger
          ? options.logger
          : defaultLogger(options?.verbose ?? false)
    this.options = { ...options, logger: this._logger }
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
    // Unlike ConvexReactClient — which passes a no-op transition handler here
    // and routes every transition through its internal PaginatedQueryClient —
    // the Vue port wires the base client's transition callback straight to
    // `transition()`. That internal PaginatedQueryClient is not part of
    // Convex's public API (see {@link watchPaginatedQuery}), so pagination is
    // handled in the composable layer instead and simple-query updates must be
    // delivered directly from the base client.
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
    if (typeof fetchToken === 'string') {
      throw new TypeError(
        'Passing a string to ConvexVueClient.setAuth is no longer supported, '
        + 'please upgrade to passing in an async function to handle reauthentication.',
      )
    }
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
   * **Not supported in the Vue port — use the {@link usePaginatedQuery}
   * composable instead.**
   *
   * Convex's native paginated-subscription engine (`PaginatedQueryClient`,
   * added in convex 1.40) is an internal module that is not part of the public
   * `convex/*` exports, so a third-party package cannot instantiate it without
   * reaching into Convex internals. The Vue port therefore handles pagination
   * entirely in the composable layer: {@link usePaginatedQuery} walks pages via
   * ordinary {@link watchQuery} subscriptions.
   *
   * This method is retained for structural and type parity with
   * `ConvexReactClient.watchPaginatedQuery`. It is reachable only if a caller
   * passes `paginationOptions` to {@link useConvexQueries} (the React-shaped
   * escape hatch); doing so throws this error to fail loudly rather than
   * silently mis-subscribe.
   *
   * @internal
   */
  watchPaginatedQuery<Query extends FunctionReference<'query'>>(
    _query: Query,
    _args: FunctionArgs<Query>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _options: any,
  ): PaginatedWatch<FunctionReturnType<Query>> {
    throw new Error(
      'ConvexVueClient.watchPaginatedQuery is not supported: Convex\'s internal '
      + 'PaginatedQueryClient is not part of the public API. Use the '
      + '`usePaginatedQuery` composable for paginated queries.',
    )
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
   *
   * This is the same logger instance handed to the underlying
   * {@link BaseConvexClient}, so client-level and SDK-level logging stay
   * consistent.
   */
  get logger(): ConvexLogger {
    return this._logger
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
  // Pass an explicit default so Vue doesn't emit its own generic
  // "injection not found" warning before we throw the more helpful error
  // below. Mirrors React's `useContext`, which returns null silently.
  const client = inject(ConvexClientKey, undefined)
  if (!client) {
    throw new Error(dedent`
      Could not find Convex client! \`useConvex\` must be used in a component tree
      where the Convex client has been provided.
      In Nuxt, ensure the nuxt-backend module is installed.
    `)
  }
  return client
}
