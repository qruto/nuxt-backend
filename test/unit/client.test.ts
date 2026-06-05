import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ws from 'ws'
import { makeFunctionReference } from 'convex/server'
import { ConvexVueClient } from '../../src/runtime/vue/client'
import { createMutation } from '../../src/runtime/vue/composables/use-mutation'
import { silentConnectLogger } from '../helpers/silent-logger'

const address = 'https://127.0.0.1:3001'

const testQuery = makeFunctionReference<'query'>('myQuery:default')
const testMutation = makeFunctionReference<'mutation'>('myMutation:default')

// `address` is intentionally unreachable; `silentConnectLogger` drops the
// underlying convex client's connection logs (irrelevant to these tests) while
// keeping `warn`/`error` intact.
const createClient = () =>
  new ConvexVueClient(address, {
    webSocketConstructor: ws as unknown as typeof WebSocket,
    logger: silentConnectLogger,
  })

// ── ConvexVueClient ───────────────────────────────────────────────────────────

describe('ConvexVueClient', () => {
  let client: ConvexVueClient

  beforeEach(() => {
    client = createClient()
  })

  afterEach(async () => {
    await client?.close()
    client = undefined as unknown as ConvexVueClient
  })

  describe('constructor', () => {
    it('can be constructed', () => {
      expect(typeof client).not.toEqual('undefined')
    })

    it('stores the address', () => {
      expect(client.url).toBe(address)
    })

    it('throws if address is undefined', () => {
      expect(() => new ConvexVueClient(undefined as unknown as string)).toThrow('No address provided')
    })

    it('throws if address is not a string', () => {
      expect(() => new ConvexVueClient(123 as unknown as string)).toThrow('requires a URL')
    })

    it('throws if address is not absolute', () => {
      expect(() => new ConvexVueClient('not-a-url')).toThrow('not an absolute URL')
    })
  })

  describe('lazy instantiation', () => {
    it('does not create the sync client eagerly', () => {
      // The cachedSync should be undefined before first access
      expect(Reflect.get(client, 'cachedSync')).toBeUndefined()

      // Access connectionState triggers instantiation
      void client.connectionState()
      expect(Reflect.get(client, 'cachedSync')).toBeDefined()
    })
  })

  describe('watchQuery', () => {
    it('returns a Watch object with onUpdate, localQueryResult, and journal', () => {
      const watch = client.watchQuery(testQuery, {})

      expect(watch).toHaveProperty('onUpdate')
      expect(watch).toHaveProperty('localQueryResult')
      expect(watch).toHaveProperty('journal')
      expect(typeof watch.onUpdate).toBe('function')
      expect(typeof watch.localQueryResult).toBe('function')
      expect(typeof watch.journal).toBe('function')
    })

    it('onUpdate returns an unsubscribe function', () => {
      const watch = client.watchQuery(testQuery, {})
      const unsubscribe = watch.onUpdate(() => {})

      expect(typeof unsubscribe).toBe('function')
      unsubscribe()
    })
  })

  describe('watchPaginatedQuery', () => {
    // Unlike ConvexReactClient (which routes pagination through Convex's
    // internal, non-public PaginatedQueryClient), the Vue port handles paginated
    // queries entirely in the `usePaginatedQuery` composable. The client-level
    // method is retained for structural parity but throws loudly so callers
    // don't silently mis-subscribe.
    it('throws because the internal PaginatedQueryClient is not part of the public API', () => {
      expect(() =>
        client.watchPaginatedQuery(testQuery, {}, { initialNumItems: 10 }),
      ).toThrow('ConvexVueClient.watchPaginatedQuery is not supported')
    })
  })

  describe('auth', () => {
    it('setAuth does not throw', () => {
      expect(() => {
        client!.setAuth(async () => null)
      }).not.toThrow()
    })

    it('setAuth throws when passed a string (legacy signature)', () => {
      // Mirrors ConvexReactClient.setAuth: the string-token signature was
      // removed in favour of an async fetcher that supports reauthentication.
      expect(() =>
        // @ts-expect-error legacy string signature is intentionally unsupported
        client!.setAuth('a-static-token'),
      ).toThrow(
        'Passing a string to ConvexVueClient.setAuth is no longer supported',
      )
    })

    it('clearAuth does not throw', () => {
      // Trigger sync creation first
      void client.connectionState()
      expect(() => {
        client!.clearAuth()
      }).not.toThrow()
    })

    it('clearAuth before sync creation does not throw', () => {
      expect(() => {
        client!.clearAuth()
      }).not.toThrow()
    })
  })

  describe('connectionState', () => {
    it('returns a valid connection state', () => {
      const state = client.connectionState()
      expect(state).toHaveProperty('isWebSocketConnected')
      expect(state).toHaveProperty('hasInflightRequests')
    })
  })

  describe('close', () => {
    it('closes the underlying client', async () => {
      // Trigger sync creation
      void client.connectionState()
      await client.close()

      expect(() => client!.connectionState()).toThrow('already been closed')
      client = undefined as unknown as ConvexVueClient // already closed
    })

    it('is safe to call when no sync client exists', async () => {
      await client.close()
      client = undefined as unknown as ConvexVueClient
    })
  })
})

// ── logger ──────────────────────────────────────────────────────────────────
// Coverage for the client's logger resolution. Mirrors ConvexReactClient's
// `_logger` wiring (instantiateDefaultLogger / instantiateNoopLogger),
// reconstructed from the public `Logger` shape.

describe('ConvexVueClient logger', () => {
  it('exposes a default console logger when none is provided', () => {
    const client = new ConvexVueClient(address)
    for (const level of ['logVerbose', 'log', 'warn', 'error'] as const) {
      expect(typeof client.logger[level]).toBe('function')
    }
  })

  it('uses a noop logger when logger is false', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const client = new ConvexVueClient(address, { logger: false })

    client.logger.log('swallowed')
    client.logger.warn('swallowed')

    expect(logSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    logSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('returns a provided logger object unchanged', () => {
    const custom = { logVerbose() {}, log() {}, warn() {}, error() {} }
    const client = new ConvexVueClient(address, { logger: custom })
    expect(client.logger).toBe(custom)
  })

  it('only emits logVerbose lines when verbose is enabled', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    const quiet = new ConvexVueClient(address)
    quiet.logger.logVerbose('hidden')
    expect(debugSpy).not.toHaveBeenCalled()

    const loud = new ConvexVueClient(address, { verbose: true })
    loud.logger.logVerbose('shown')
    expect(debugSpy).toHaveBeenCalledWith('shown')

    debugSpy.mockRestore()
  })

  it('hands the same logger instance to the underlying sync client', () => {
    const custom = { logVerbose() {}, log() {}, warn() {}, error() {} }
    const client = new ConvexVueClient(address, { logger: custom })
    // The resolved logger is stored on `options.logger`, which is exactly what
    // gets handed to the lazily-created BaseConvexClient — so client-level and
    // SDK-level logging share one instance.
    expect(Reflect.get(client, 'options').logger).toBe(client.logger)
    expect(client.logger).toBe(custom)
  })
})

// ── createMutation ────────────────────────────────────────────────────────────
// Coverage for the Vue client mutation helper.

describe('createMutation', () => {
  let client: ConvexVueClient

  beforeEach(() => {
    client = createClient()
  })

  afterEach(async () => {
    await client?.close()
    client = undefined as unknown as ConvexVueClient
  })

  it('optimistic updates can be created', () => {
    createMutation(testMutation, client).withOptimisticUpdate(
      () => {
        // no update
      },
    )
  })

  it('specifying an optimistic update twice produces an error', () => {
    const mutation = createMutation(
      testMutation,
      client,
    ).withOptimisticUpdate(() => {
      // no update
    })
    expect(() => {
      mutation.withOptimisticUpdate(() => {
        // no update
      })
    }).toThrow('Already specified optimistic update for mutation myMutation')
  })

  it('using a mutation as an event handler directly throws a useful error', () => {
    // In Vue, @click handlers receive a native DOM Event as first argument.
    const fakeDomEvent = {
      bubbles: false,
      cancelable: true,
      target: null,
      currentTarget: null,
      defaultPrevented: false,
      isTrusted: false,
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
      timeStamp: 0,
      type: 'click',
    }
    const mutation = createMutation(testMutation, client)
    expect(() => mutation(fakeDomEvent as unknown as Record<string, unknown>)).toThrow(
      'Convex mutation called with Event object.',
    )
  })

  it('optimistic update handlers cannot be async', () => {
    const mutation = createMutation(
      testMutation,
      client,
    ).withOptimisticUpdate(async () => {}) // async fn: intentionally wrong type

    const consoleWarnSpy = vi.spyOn(console, 'warn')
    void mutation()
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Optimistic update handler returned a Promise. Optimistic updates should be synchronous.',
    )
    consoleWarnSpy.mockRestore()
  })
})

// ── useQuery ─────────────────────────────────────────────────────────────────
// Composable tests require a Vue component tree and live in
// test/nuxt/composables.test.ts (useQuery describe).

// ── async query fetch ─────────────────────────────────────────────────────────
// Coverage for async query reads on the Vue client.

describe('How many times do you have to go through the first one? ', () => {
  let client: ConvexVueClient

  beforeEach(() => {
    client = createClient()
  })

  afterEach(async () => {
    await client?.close()
  })

  function applyOptimisticUpdate() {
    void client.mutation(
      testMutation,
      {},
      {
        optimisticUpdate: (localStore) => {
          localStore.setQuery(testQuery, {}, 'queryResult')
        },
      },
    )
  }

  it('returns after optimistic update', async () => {
    const queryResult = client.query(testQuery, {})
    applyOptimisticUpdate()
    expect(await queryResult).toStrictEqual('queryResult')
  })

  it('returns existing result', async () => {
    applyOptimisticUpdate()
    const queryResult = client.query(testQuery, {})
    expect(await queryResult).toStrictEqual('queryResult')
  })
})

// ── prewarmQuery ──────────────────────────────────────────────────────────────
// Type coverage for the Vue client's prewarmQuery helper.

describe('prewarmQuery types', () => {
  let client: ConvexVueClient

  beforeEach(() => {
    client = createClient()
  })

  afterEach(async () => {
    await client?.close()
    client = undefined as unknown as ConvexVueClient
  })

  it('accepts QueryOptions shape', () => {
    client.prewarmQuery({
      query: makeFunctionReference<'query', { name: string }, string>('myQuery'),
      args: { name: 'hi' },
    })
  })

  it('accepts extendSubscriptionFor on prewarmQuery', () => {
    client.prewarmQuery({
      query: makeFunctionReference<'query', { name: string }, string>('myQuery'),
      args: { name: 'hi' },
      extendSubscriptionFor: 10_000,
    })
  })
})
