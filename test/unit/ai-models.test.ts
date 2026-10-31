import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateText, simulateReadableStream, streamText } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setupAi, type AiComponents } from '../../src/convex/integrations/ai'
import type { Billing, SpendReservation } from '../../src/convex/integrations/billing'
import { convexGatewayPossible, failedRun, modelRefusal, modelStatusOf, reportedUsd, routeModel, type ModelCall } from '../../src/convex/integrations/ai/models'
import { priceModelCalls } from '../../src/convex/integrations/ai/pricing'
import { TEST_IMAGE_PNG, TEST_MODEL_USD, TEST_UNSAFE_MARKER, testModel } from '../../src/convex/test-models'
import { getBackendError } from '../../src/convex/errors'

// Models by id, through the AI Gateway: where an id goes on each kind of
// deployment, and the credits a run settles at from the cost each call
// reports. Nothing here reaches a model: the gateway's own provider runs
// against a stubbed fetch, and a model object of your own is the mock
// `nuxt-backend/test` gives every id (src/convex/test-models.ts).

const root = fileURLToPath(new URL('../..', import.meta.url))

// The Convex AI Gateway: the deployment's token request, which only a Convex
// runtime answers (here it refuses as an anonymous local deployment does,
// unless a test says otherwise), and the gateway's provider package, whose
// model answers with the cost the gateway reports.
const convexGateway = vi.hoisted(() => ({
  token: vi.fn(async (): Promise<string> => {
    throw new Error('AiGatewayUnavailable: this deployment cannot use the AI Gateway')
  }),
  models: [] as string[],
}))
vi.mock('convex/server', async importOriginal => ({ ...await importOriginal<Record<string, unknown>>(), getServiceToken: convexGateway.token }))
vi.mock('@convex-dev/ai-sdk-provider', async () => {
  const { MockLanguageModelV4 } = await import('ai/test')
  return {
    convexGateway: (modelId: string) => {
      convexGateway.models.push(modelId)
      return new MockLanguageModelV4({
        provider: 'convexGateway',
        modelId,
        doGenerate: async () => ({
          content: [{ type: 'text', text: 'From the Convex AI Gateway.' }],
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } },
          providerMetadata: { convexGateway: { cost: 0.0042 } },
          warnings: [],
        }),
      })
    },
  }
})

// The streaming component, as far as a metered stream drives it, and as it
// does it (0.3.x): the response goes back at once, and the writer runs the
// handler behind it, unawaited, closing the body when the handler is done.
vi.mock('@convex-dev/persistent-text-streaming', () => ({
  PersistentTextStreaming: class {
    createStream = async () => 'stream_1'
    getStreamBody = async () => null
    async stream(ctx: unknown, request: Request, streamId: string, run: (ctx: unknown, request: Request, streamId: string, append: (text: string) => Promise<void>) => Promise<void>) {
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
      const writer = writable.getWriter()
      const encoder = new TextEncoder()
      void (async () => {
        try {
          await run(ctx, request, streamId, async text => writer.write(encoder.encode(text)))
        }
        catch {
          // The component marks the stream `error`; the response just ends.
        }
        await writer.close()
      })()
      return new Response(readable)
    }
  },
}))

const components = {
  backend: {
    ai: {
      createRequest: 'ref:ai.createRequest',
      getByStream: 'ref:ai.getByStream',
      claimRequest: 'ref:ai.claimRequest',
      markSettled: 'ref:ai.markSettled',
      markReleased: 'ref:ai.markReleased',
    },
    billing: {
      finalize: 'ref:billing.finalize',
      release: 'ref:billing.release',
      attachReleaseJob: 'ref:billing.attachReleaseJob',
    },
    costs: { record: 'ref:costs.record', summary: 'ref:costs.summary' },
    adapter: { findOne: 'ref:adapter.findOne' },
  },
  persistentTextStreaming: { lib: { createStream: 'ref:pts.createStream' } },
} as unknown as AiComponents

function makeBilling(value = 50): Billing {
  const reservation: SpendReservation = { entityId: 'org_1', externalId: 'ext_1', reserved: true, meter: 'credits', meterId: 'm1', value }
  return {
    requireEntity: vi.fn(async () => ({ userId: 'org_1', email: 'a@b.co' })),
    reserveCredits: vi.fn(async () => reservation),
    settleSpend: vi.fn(async () => {}),
    releaseSpend: vi.fn(async () => {}),
  } as unknown as Billing
}

const signedIn = () => ({
  auth: { getUserIdentity: async () => ({ subject: 'user_1', email: 'a@b.co' }) },
  runMutation: vi.fn(async (ref: unknown) => ref === 'ref:billing.finalize'
    ? { settled: true, released: 0, balance: 10, balanceBefore: 20 }
    : null),
  runQuery: vi.fn(async () => null),
  scheduler: { runAfter: vi.fn(async () => 'job_1'), cancel: vi.fn(async () => {}) },
})

function invoke(action: unknown, ctx: unknown, args: unknown): Promise<unknown> {
  return (action as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler(ctx, args)
}

/** POST a started stream to the stream route, as `useAiStream` does, with its request row in place; `claimed: false` when another dispatch claimed it first. */
async function postStream(ai: ReturnType<typeof setupAi>, name: string, cost = 50, { claimed = true } = {}) {
  const base = signedIn()
  const ctx = {
    ...base,
    runMutation: vi.fn(async (ref: unknown) => ref === 'ref:ai.claimRequest' ? claimed : base.runMutation(ref)),
    runQuery: vi.fn(async () => ({ streamId: 's1', name, entityId: 'org_1', userId: 'user_1', args: '{}', meterId: 'm1', cost, externalId: 'ext_1', status: 'reserved', createdAt: 0 })),
  }
  const response = await (ai.httpHandler as unknown as { _handler: (ctx: unknown, request: Request) => Promise<Response> })
    ._handler(ctx, new Request('https://backend.test/ai/stream', { method: 'POST', body: JSON.stringify({ streamId: 's1' }) }))
  return { response, ctx }
}

/** A model of your own whose stream answers `parts` and then closes. */
function streamingModel(parts: unknown[]) {
  return new MockLanguageModelV4({
    provider: 'acme',
    modelId: 'acme-1',
    doStream: async () => ({ stream: simulateReadableStream({ chunks: parts as never[], initialDelayInMs: null, chunkDelayInMs: null }) }),
  })
}

/** The refusal of a model this deployment cannot reach. */
const routeError = () => modelRefusal({ id: 'openai/gpt-5-mini' })

/** A model of your own its provider refuses: every call rejects. */
const refusingModel = () => new MockLanguageModelV4({
  provider: 'acme',
  modelId: 'acme-1',
  doGenerate: async () => {
    throw new Error('401 Unauthorized')
  },
  doStream: async () => {
    throw new Error('401 Unauthorized')
  },
})

/** A handler body that reads a model's text stream to its end, as the docs show. */
async function readAll(model: Parameters<typeof streamText>[0]['model']): Promise<string> {
  const result = streamText({ model, prompt: 'hi' })
  let text = ''
  for await (const chunk of result.textStream) text += chunk
  return text
}

/** The amount the run settled at: what `settleSpend` was handed. */
function settledAt(billing: Billing): number | undefined {
  const call = vi.mocked(billing.settleSpend).mock.calls[0]
  return (call?.[2] as { finalAmount?: number } | undefined)?.finalAmount
}

const CLOUD = 'https://happy-otter-123.convex.cloud'
const LOCAL = 'http://127.0.0.1:3210'
/** A self-hosted deployment on a public host: never the Convex AI Gateway. */
const SELF_HOSTED = 'https://convex.example.com'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Where an id goes on a deployment once the Convex AI Gateway, when it is tried, does not answer. */
function fallbackOf(env: Record<string, string>): string {
  const route = routeModel('openai/gpt-5-mini', env)
  return route.route === 'convex' ? route.fallback.route : route.route
}

describe('routing a model', () => {
  it('tries the Convex AI Gateway first where a deployment can have it, with the next route behind it', () => {
    const gateway = { route: 'gateway', id: 'openai/gpt-5-mini', apiKey: 'k' }
    for (const url of [CLOUD, LOCAL]) {
      expect(routeModel('openai/gpt-5-mini', { AI_GATEWAY_API_KEY: 'k', CONVEX_CLOUD_URL: url })).toEqual({ route: 'convex', id: 'openai/gpt-5-mini', fallback: gateway })
    }
    expect(routeModel('openai/gpt-5-mini', { CONVEX_CLOUD_URL: CLOUD })).toEqual({ route: 'convex', id: 'openai/gpt-5-mini', fallback: { route: 'missing', id: 'openai/gpt-5-mini' } })
    expect(convexGatewayPossible({ CONVEX_CLOUD_URL: SELF_HOSTED })).toBe(false)
    expect(convexGatewayPossible({ CONVEX_CLOUD_URL: 'https://evil.convex.cloud.example.com' })).toBe(false)
    expect(convexGatewayPossible({})).toBe(false)
  })

  it('sends a provider/model id through the Vercel AI Gateway once the key is set, where the Convex one never answers', () => {
    for (const url of [SELF_HOSTED, undefined]) {
      expect(routeModel('openai/gpt-5-mini', { AI_GATEWAY_API_KEY: 'k', CONVEX_CLOUD_URL: url })).toEqual({ route: 'gateway', id: 'openai/gpt-5-mini', apiKey: 'k' })
    }
  })

  it('answers nothing in place of a model: without the key an id goes nowhere, on any deployment, in a test too', () => {
    expect(fallbackOf({ CONVEX_CLOUD_URL: CLOUD })).toBe('missing')
    // A local deployment, or a self-hosted one on a loopback or a public host: never a stand-in.
    expect(fallbackOf({ CONVEX_CLOUD_URL: LOCAL })).toBe('missing')
    expect(routeModel('openai/gpt-5-mini', { CONVEX_CLOUD_URL: SELF_HOSTED }).route).toBe('missing')
    // A leftover marker of the old stand-in does nothing, and neither does a Vitest run.
    expect(fallbackOf({ CONVEX_CLOUD_URL: LOCAL, NUXT_BACKEND_SIMULATE_MODELS: '1' })).toBe('missing')
    expect(routeModel('openai/gpt-5-mini', { VITEST: 'true' }).route).toBe('missing')
    expect(routeModel('openai/gpt-5-mini', {}).route).toBe('missing')
  })

  it('calls a model object as it is, with its own provider key', () => {
    const own = new MockLanguageModelV4({ provider: 'acme', modelId: 'acme-1' })
    expect(routeModel(own, { CONVEX_CLOUD_URL: CLOUD })).toMatchObject({ route: 'own', id: 'acme-1' })
  })

  it('reports where calls go first, and the state the layer reads', () => {
    const status = (state: string, route: string | null) => ({ model: 'openai/gpt-5-mini', state, route })
    // Convex Cloud: the Convex AI Gateway, with or without a key behind it.
    expect(modelStatusOf('openai/gpt-5-mini', { AI_GATEWAY_API_KEY: 'k', CONVEX_CLOUD_URL: CLOUD })).toEqual(status('live', 'convex-gateway'))
    expect(modelStatusOf('openai/gpt-5-mini', { CONVEX_CLOUD_URL: CLOUD })).toEqual(status('live', 'convex-gateway'))
    // A local deployment may reach it, so its state is the route behind it.
    expect(modelStatusOf('openai/gpt-5-mini', { CONVEX_CLOUD_URL: LOCAL })).toEqual(status('missing', 'convex-gateway'))
    // Self-hosted: the key or nothing.
    expect(modelStatusOf('openai/gpt-5-mini', { AI_GATEWAY_API_KEY: 'k', CONVEX_CLOUD_URL: SELF_HOSTED })).toEqual(status('live', 'vercel-gateway'))
    expect(modelStatusOf('openai/gpt-5-mini', { CONVEX_CLOUD_URL: SELF_HOSTED })).toEqual(status('missing', null))
    expect(modelStatusOf(new MockLanguageModelV4({ provider: 'acme', modelId: 'acme-1' }), {})).toEqual({ model: 'acme-1', state: 'live', route: 'provider' })
    expect(modelStatusOf(undefined, {})).toEqual({ model: null, state: 'missing', route: null })
  })

  it('refuses an id that is no provider/model id where it is configured', () => {
    expect(() => setupAi(components, { billing: makeBilling(), model: 'gpt-5' })).toThrow(/not a provider\/model id/)
    const ai = setupAi(components, { billing: makeBilling() })
    expect(() => ai.meteredAction({ meter: 'credits', model: 'gpt-5', args: {}, handler: async () => null })).toThrow(/ai\.meteredAction: model 'gpt-5'/)
    expect(() => ai.meteredAction({ meter: 'credits', cost: { estimate: 5, creditsPerUsd: 0 }, args: {}, handler: async () => null })).toThrow(/creditsPerUsd/)
  })

  it('reads setupAi\'s model in modelStatus, from the deployment\'s env', () => {
    vi.stubEnv('CONVEX_CLOUD_URL', SELF_HOSTED)
    vi.stubEnv('AI_GATEWAY_API_KEY', '')
    const ai = setupAi(components, { billing: makeBilling(), model: 'anthropic/claude-sonnet-4.5' })
    expect(ai.modelStatus()).toEqual({ model: 'anthropic/claude-sonnet-4.5', state: 'missing', route: null })
    vi.stubEnv('AI_GATEWAY_API_KEY', 'k')
    expect(ai.modelStatus()).toEqual({ model: 'anthropic/claude-sonnet-4.5', state: 'live', route: 'vercel-gateway' })
    vi.stubEnv('CONVEX_CLOUD_URL', CLOUD)
    expect(ai.modelStatus('openai/gpt-5')).toEqual({ model: 'openai/gpt-5', state: 'live', route: 'convex-gateway' })
  })
})

describe('a metered call through the gateway', () => {
  /** The gateway's answer to one generation: the AI SDK's own result shape, with its cost. */
  const gatewayAnswer = (cost?: string) => ({
    content: [{ type: 'text', text: 'A short summary.' }],
    finishReason: { unified: 'stop', raw: 'stop' },
    usage: {
      inputTokens: { total: 1200, noCache: 1000, cacheRead: 200, cacheWrite: 0 },
      outputTokens: { total: 80, text: 80, reasoning: 0 },
    },
    ...(cost === undefined ? {} : { providerMetadata: { gateway: { cost } } }),
    warnings: [],
  })

  function stubGateway(cost?: string) {
    const fetch = vi.fn(async () => new Response(JSON.stringify(gatewayAnswer(cost)), { headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)
    return fetch
  }

  const summarize = (ai: ReturnType<typeof setupAi>, cost: Parameters<ReturnType<typeof setupAi>['meteredAction']>[0]['cost']) => ai.meteredAction({
    meter: 'credits',
    cost,
    args: {},
    handler: async (ctx, args: { text?: string }) => {
      const { text } = await generateText({ model: ctx.model(), prompt: `Summarize: ${args.text ?? ''}` })
      return text
    },
  })

  it('calls the gateway with the deployment\'s key and settles the cost it reports', async () => {
    vi.stubEnv('CONVEX_CLOUD_URL', CLOUD)
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-key-for-tests')
    const fetch = stubGateway('0.0123')
    const billing = makeBilling(50)
    const ai = setupAi(components, { billing, model: 'openai/gpt-5-mini' })

    const result = await invoke(summarize(ai, { estimate: 50, creditsPerUsd: 1000 }), signedIn(), { text: 'the quarterly report' })

    expect(result).toBe('A short summary.')
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/language-model$/)
    const headers = new Headers(init.headers)
    expect(headers.get('authorization')).toBe('Bearer gateway-key-for-tests')
    expect(headers.get('ai-language-model-id')).toBe('openai/gpt-5-mini')
    // $0.0123 at 1000 credits a dollar, under the 50 reserved.
    expect(settledAt(billing)).toBe(12.3)
  })

  it('rounds and floors the reported cost as the cost says', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-key-for-tests')
    stubGateway('0.0001')
    const billing = makeBilling(50)
    const ai = setupAi(components, { billing, model: 'openai/gpt-5-mini' })

    await invoke(summarize(ai, { estimate: 50, creditsPerUsd: 1000, round: 'up', minimum: 1 }), signedIn(), {})

    expect(settledAt(billing)).toBe(1)
  })

  it('holds a reported cost to the reservation: the estimate is the ceiling', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-key-for-tests')
    stubGateway('2.5')
    const billing = makeBilling(50)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ai = setupAi(components, { billing, model: 'openai/gpt-5-mini' })

    await invoke(summarize(ai, { estimate: 50, creditsPerUsd: 1000 }), signedIn(), {})

    expect(settledAt(billing)).toBe(50)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ai.cost_over_reservation'))
  })

  it('prices a call that reports no cost by its tokens, when the cost has a price for its model', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-key-for-tests')
    stubGateway()
    const billing = makeBilling(50)
    const ai = setupAi(components, { billing, model: 'openai/gpt-5-mini' })
    const prices = { 'openai/gpt-5-mini': { input: 2, output: 8, cachedInput: 0.5, per: 1000 } }

    await invoke(summarize(ai, { estimate: 50, creditsPerUsd: 1000, prices }), signedIn(), {})

    // 1000 fresh input, 200 cached, 80 output tokens, per thousand.
    expect(settledAt(billing)).toBeCloseTo((1000 * 2 + 200 * 0.5 + 80 * 8) / 1000, 9)
  })

  it('charges the reservation, and says so, when a call reports no cost and no price covers it', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-key-for-tests')
    stubGateway()
    const billing = makeBilling(50)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ai = setupAi(components, { billing, model: 'openai/gpt-5-mini' })

    await invoke(summarize(ai, { estimate: 50, creditsPerUsd: 1000 }), signedIn(), {})

    expect(settledAt(billing)).toBe(50)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ai.cost_unreported'))
  })

  it('refuses before anything counts on a deployment without the key or the Convex AI Gateway', async () => {
    vi.stubEnv('CONVEX_CLOUD_URL', SELF_HOSTED)
    vi.stubEnv('AI_GATEWAY_API_KEY', '')
    const fetch = stubGateway('0.01')
    const billing = makeBilling(50)
    const limiter = { limit: vi.fn(async () => ({ ok: true })) }
    const ai = setupAi(components, { billing, rateLimiter: limiter as never, model: 'openai/gpt-5-mini' })

    const refusal = await invoke(summarize(ai, { estimate: 50, creditsPerUsd: 1000 }), signedIn(), {}).catch((error: unknown) => error)

    expect(getBackendError(refusal)).toMatchObject({ code: 'unavailable', data: { service: 'ai', reason: 'not_configured' } })
    expect(limiter.limit).not.toHaveBeenCalled()
    expect(billing.reserveCredits).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('releases the reservation when a model the action did not name is unreachable', async () => {
    vi.stubEnv('CONVEX_CLOUD_URL', CLOUD)
    vi.stubEnv('AI_GATEWAY_API_KEY', '')
    const billing = makeBilling(5)
    const ai = setupAi(components, { billing })
    const action = ai.meteredAction({
      meter: 'credits',
      cost: 5,
      args: {},
      handler: async ctx => (await generateText({ model: ctx.model('openai/gpt-5-mini'), prompt: 'hi' })).text,
    })

    const refusal = await invoke(action, signedIn(), {}).catch((error: unknown) => error)

    expect(getBackendError(refusal)).toMatchObject({ code: 'unavailable', data: { reason: 'not_configured' } })
    expect(billing.releaseSpend).toHaveBeenCalled()
    expect(billing.settleSpend).not.toHaveBeenCalled()
  })

  it('says when there is no model to call at all', async () => {
    const ai = setupAi(components, { billing: makeBilling() })
    const action = ai.meteredAction({ meter: false, args: {}, handler: async ctx => ctx.model() })
    await expect(invoke(action, signedIn(), {})).rejects.toThrow(/no model to call/)
  })
})

describe('a call pinned to the EU (setupAi({ inferenceRegion: \'eu\' }))', () => {
  /** The gateway's answer, reporting the region each provider attempt ran in. */
  const answerFrom = (geoRegion: string | null) => ({
    content: [{ type: 'text', text: 'Bonjour.' }],
    finishReason: { unified: 'stop', raw: 'stop' },
    usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 2, text: 2, reasoning: 0 } },
    providerMetadata: {
      gateway: {
        cost: '0.001',
        routing: { modelAttempts: [{ providerAttempts: [{ provider: 'anthropic', success: true, inferenceEndpoint: geoRegion ? { slug: `geo-${geoRegion}`, scope: 'zone', geoRegion } : null }] }] },
      },
    },
    warnings: [],
  })

  const translate = (ai: ReturnType<typeof setupAi>, providerOptions?: Record<string, Record<string, unknown>>) => ai.meteredAction({
    meter: 'credits',
    cost: { estimate: 50, creditsPerUsd: 1000 },
    args: {},
    handler: async (ctx) => {
      const { text } = await generateText({ model: ctx.model(), prompt: 'Say hello in French.', ...(providerOptions ? { providerOptions: providerOptions as never } : {}) })
      return text
    },
  })

  it('never tries the Convex AI Gateway, even on Convex Cloud with its provider installed', () => {
    const env = { CONVEX_CLOUD_URL: CLOUD, AI_GATEWAY_API_KEY: 'k' }
    expect(routeModel('anthropic/claude-sonnet-4.5', env, 'eu')).toEqual({ route: 'gateway', id: 'anthropic/claude-sonnet-4.5', apiKey: 'k' })
    expect(modelStatusOf('anthropic/claude-sonnet-4.5', env, 'eu')).toEqual({ model: 'anthropic/claude-sonnet-4.5', state: 'live', route: 'vercel-gateway' })
    expect(modelStatusOf('anthropic/claude-sonnet-4.5', { CONVEX_CLOUD_URL: CLOUD }, 'eu')).toEqual({ model: 'anthropic/claude-sonnet-4.5', state: 'missing', route: null })
  })

  it('refuses every call without the key, saying the pin needs the Vercel route', async () => {
    vi.stubEnv('CONVEX_CLOUD_URL', CLOUD)
    const billing = makeBilling()
    const ai = setupAi(components, { billing, model: 'anthropic/claude-sonnet-4.5', inferenceRegion: 'eu' })
    const error = await invoke(translate(ai), signedIn(), {}).catch((caught: unknown) => caught)
    expect(getBackendError(error)).toMatchObject({ code: 'unavailable', data: { service: 'ai', reason: 'not_configured' } })
    expect((error as Error).message).toMatch(/pinned to the 'eu' inference region/)
    expect(convexGateway.token).not.toHaveBeenCalled()
    expect(billing.reserveCredits).not.toHaveBeenCalled()
  })

  it('adds the gateway\'s own region option to every call, and settles as any other', async () => {
    vi.stubEnv('CONVEX_CLOUD_URL', CLOUD)
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-key-for-tests')
    const fetch = vi.fn(async () => new Response(JSON.stringify(answerFrom('eu')), { headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const billing = makeBilling(50)
    const ai = setupAi(components, { billing, model: 'anthropic/claude-sonnet-4.5', inferenceRegion: 'eu' })

    expect(await invoke(translate(ai), signedIn(), {})).toBe('Bonjour.')

    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as { providerOptions?: { gateway?: Record<string, unknown> } }
    expect(body.providerOptions?.gateway?.inferenceRegion).toEqual({ scope: 'zone', geoRegion: 'eu' })
    expect(convexGateway.token).not.toHaveBeenCalled()
    expect(settledAt(billing)).toBe(1)
    expect(warn).not.toHaveBeenCalled()
  })

  it('keeps a call\'s own per-provider overrides over the default pin', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-key-for-tests')
    const fetch = vi.fn(async () => new Response(JSON.stringify(answerFrom('eu')), { headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)
    const own = { scope: 'zone', geoRegion: 'eu', providers: { anthropic: null } }
    const ai = setupAi(components, { billing: makeBilling(), model: 'anthropic/claude-sonnet-4.5', inferenceRegion: 'eu' })

    await invoke(translate(ai, { gateway: { inferenceRegion: own, tags: ['translate'] } }), signedIn(), {})

    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as { providerOptions?: { gateway?: Record<string, unknown> } }
    expect(body.providerOptions?.gateway).toMatchObject({ inferenceRegion: own, tags: ['translate'] })
  })

  it('logs ai.region_mismatch when a call reports running in another region', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-key-for-tests')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(answerFrom('us')), { headers: { 'content-type': 'application/json' } })))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ai = setupAi(components, { billing: makeBilling(), model: 'anthropic/claude-sonnet-4.5', inferenceRegion: 'eu' })

    await invoke(translate(ai), signedIn(), {})

    expect(warn.mock.calls.flat().join(' ')).toMatch(/ai\.region_mismatch[\s\S]*'us'/)
  })

  it('pins the model nuxt-backend/test answers an id with, so a test sees the option', async () => {
    const seen: unknown[] = []
    const symbol = Symbol.for('nuxt-backend.testModels')
    const previous = (globalThis as Record<symbol, unknown>)[symbol]
    ;(globalThis as Record<symbol, unknown>)[symbol] = (id: string) => new MockLanguageModelV4({
      provider: 'test',
      modelId: id,
      doGenerate: async (options) => {
        seen.push(options.providerOptions)
        return answerFrom('eu') as never
      },
    })
    try {
      const ai = setupAi(components, { billing: makeBilling(), model: 'anthropic/claude-sonnet-4.5', inferenceRegion: 'eu' })
      await invoke(translate(ai), signedIn(), {})
    }
    finally {
      ;(globalThis as Record<symbol, unknown>)[symbol] = previous
    }
    expect(seen).toEqual([{ gateway: { inferenceRegion: { scope: 'zone', geoRegion: 'eu' } } }])
  })

  it('refuses a region the gateway does not pin, where setupAi is called', () => {
    expect(() => setupAi(components, { billing: makeBilling(), inferenceRegion: 'us' as never })).toThrow(/no region the gateway pins/)
  })
})

describe('a metered call through the Convex AI Gateway', () => {
  afterEach(() => {
    convexGateway.token.mockReset().mockRejectedValue(new Error('AiGatewayUnavailable: this deployment cannot use the AI Gateway'))
    convexGateway.models.length = 0
  })

  const summarize = (ai: ReturnType<typeof setupAi>) => ai.meteredAction({
    meter: 'credits',
    cost: { estimate: 50, creditsPerUsd: 1000 },
    args: {},
    handler: async ctx => (await generateText({ model: ctx.model(), prompt: 'Summarize' })).text,
  })

  it('answers on Convex Cloud with no key at all, and settles the cost the gateway reports', async () => {
    vi.stubEnv('CONVEX_CLOUD_URL', CLOUD)
    vi.stubEnv('AI_GATEWAY_API_KEY', '')
    convexGateway.token.mockResolvedValue('deployment-jwt')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const billing = makeBilling(50)

    const result = await invoke(summarize(setupAi(components, { billing, model: 'openai/gpt-5-mini' })), signedIn(), {})

    expect(result).toBe('From the Convex AI Gateway.')
    expect(convexGateway.models).toEqual(['openai/gpt-5-mini'])
    expect(fetch).not.toHaveBeenCalled()
    // $0.0042 at 1000 credits a dollar.
    expect(settledAt(billing)).toBe(4.2)
  })

  it('goes to the Vercel AI Gateway when the plan has no Convex AI Gateway and the key is set', async () => {
    vi.stubEnv('CONVEX_CLOUD_URL', CLOUD)
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-key-for-tests')
    convexGateway.token.mockRejectedValue(new Error('AiGatewayDisabled: the AI Gateway needs a paid plan'))
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const fetch = vi.fn(async () => Response.json({
      content: [{ type: 'text', text: 'From the Vercel AI Gateway.' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
      providerMetadata: { gateway: { cost: '0.001' } },
      warnings: [],
    }))
    vi.stubGlobal('fetch', fetch)
    const billing = makeBilling(50)

    expect(await invoke(summarize(setupAi(components, { billing, model: 'openai/gpt-5-mini' })), signedIn(), {})).toBe('From the Vercel AI Gateway.')
    expect(new Headers((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].headers).get('authorization')).toBe('Bearer gateway-key-for-tests')
    expect(settledAt(billing)).toBe(1)
    expect(convexGateway.models).toEqual([])
  })

  it('refuses as not configured, naming why, when neither gateway answers, and releases', async () => {
    vi.stubEnv('CONVEX_CLOUD_URL', CLOUD)
    vi.stubEnv('AI_GATEWAY_API_KEY', '')
    convexGateway.token.mockRejectedValue(new Error('AiGatewayDisabled: the AI Gateway needs a paid plan'))
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const billing = makeBilling(50)

    const refusal = await invoke(summarize(setupAi(components, { billing, model: 'openai/gpt-5-mini' })), signedIn(), {}).catch((error: unknown) => error)

    expect(getBackendError(refusal)).toMatchObject({ code: 'unavailable', data: { service: 'ai', reason: 'not_configured' } })
    expect(String((refusal as Error).message)).toMatch(/AiGatewayDisabled.*AI_GATEWAY_API_KEY is not set/)
    expect(billing.releaseSpend).toHaveBeenCalled()
    expect(billing.settleSpend).not.toHaveBeenCalled()
  })

  it('never routes around a spending limit: a spent limit refuses the call, whatever key is set', async () => {
    vi.stubEnv('CONVEX_CLOUD_URL', CLOUD)
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-key-for-tests')
    convexGateway.token.mockRejectedValue(new Error('SpendingLimitExceeded: the team is over its spending limit'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const billing = makeBilling(50)

    const refusal = await invoke(summarize(setupAi(components, { billing, model: 'openai/gpt-5-mini' })), signedIn(), {}).catch((error: unknown) => error)

    expect(getBackendError(refusal)).toMatchObject({ code: 'unavailable', data: { service: 'ai', reason: 'provider_refused' } })
    expect(fetch).not.toHaveBeenCalled()
    expect(billing.releaseSpend).toHaveBeenCalled()
  })
})

describe('the model nuxt-backend/test gives every id', () => {
  const MODEL = testModel('openai/gpt-5-mini')

  it('settles a run at the cost the model reports, and calls no gateway', async () => {
    vi.stubEnv('CONVEX_CLOUD_URL', LOCAL)
    vi.stubEnv('AI_GATEWAY_API_KEY', '')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const billing = makeBilling(50)
    const ai = setupAi(components, { billing, model: MODEL })
    const action = ai.meteredAction({
      meter: 'credits',
      cost: { estimate: 50, creditsPerUsd: 10_000 },
      args: {},
      handler: async (ctx, args: { prompt?: string }) => (await generateText({ model: ctx.model(), prompt: args.prompt ?? '' })).text,
    })

    const text = await invoke(action, signedIn(), { prompt: 'Name three colours' })

    expect(text).toBe('Test reply to: Name three colours')
    expect(fetch).not.toHaveBeenCalled()
    // The reported dollars, at ten thousand credits a dollar.
    expect(settledAt(billing)).toBeCloseTo(TEST_MODEL_USD * 10_000, 6)
  })

  it('answers as a safety classifier for a classifier\'s id: unsafe for text carrying the marker, else safe', async () => {
    const ask = async (id: string, prompt: string) => (await generateText({ model: testModel(id), prompt })).text
    expect(await ask('meta-llama/llama-guard-4-12b', 'A fox who wants to fly')).toBe('safe')
    expect(await ask('meta-llama/llama-guard-4-12b', `A fox ${TEST_UNSAFE_MARKER}`)).toBe('unsafe\nS1')
    expect(await ask('openai/gpt-oss-safeguard-20b', `<content>\n${TEST_UNSAFE_MARKER}\n</content>`)).toBe('unsafe\nS1')
    expect(await ask('openai/gpt-5-mini', TEST_UNSAFE_MARKER)).toBe(`Test reply to: ${TEST_UNSAFE_MARKER}`)
  })

  it('draws for an image model\'s id: a PNG file beside the text, and none for a text model', async () => {
    const drawn = await generateText({ model: testModel('google/gemini-2.5-flash-image'), prompt: 'Draw one comic panel' })
    expect(drawn.files.map(file => file.mediaType)).toEqual(['image/png'])
    expect(drawn.files[0]!.uint8Array).toEqual(TEST_IMAGE_PNG)
    // The bytes are a PNG a test can store and sniff: the signature, then the header chunk.
    expect([...TEST_IMAGE_PNG.slice(0, 8)]).toEqual([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    expect(drawn.text).toBe('Test reply to: Draw one comic panel')
    expect((await generateText({ model: testModel('openai/gpt-image-1'), prompt: 'A fox' })).files).toHaveLength(1)
    expect((await generateText({ model: testModel('openai/gpt-5-mini'), prompt: 'A fox' })).files).toEqual([])
    const streamed = streamText({ model: testModel('google/gemini-2.5-flash-image'), prompt: 'Draw' })
    expect((await streamed.files).map(file => file.mediaType)).toEqual(['image/png'])
  })

  it('answers the same prompt the same way every time', async () => {
    const ask = async () => (await generateText({ model: testModel('openai/gpt-5-mini'), system: 'Be brief.', prompt: 'Hello' })).text
    expect(await ask()).toBe(await ask())
    expect(await ask()).toContain('Hello')
  })

  it('streams word by word and reports its cost at the end, which the run settles', async () => {
    const billing = makeBilling(50)
    const ai = setupAi(components, { billing, model: MODEL })
    const chunks: string[] = []
    const action = ai.meteredAction({
      meter: 'credits',
      cost: { estimate: 50, creditsPerUsd: 10_000 },
      args: {},
      handler: async (ctx) => {
        const result = streamText({ model: ctx.model(), prompt: 'Stream this' })
        for await (const chunk of result.textStream) chunks.push(chunk)
        return chunks.join('')
      },
    })

    const text = await invoke(action, signedIn(), {})

    expect(chunks.length).toBeGreaterThan(3)
    expect(text).toContain('Stream this')
    expect(settledAt(billing)).toBeCloseTo(TEST_MODEL_USD * 10_000, 6)
  })

  it('settles a delivered ai.stream at the cost its model calls reported', async () => {
    const billing = makeBilling(50)
    const ai = setupAi(components, { billing, model: MODEL })
    ai.stream({
      name: 'answer',
      meter: 'credits',
      cost: { estimate: 50, creditsPerUsd: 10_000 },
      args: {},
      handler: async (ctx, _args, { append }) => {
        const result = streamText({ model: ctx.model(), prompt: 'Stream this' })
        for await (const chunk of result.textStream) await append(chunk)
      },
    })
    const { response, ctx } = await postStream(ai, 'answer')

    // The response is back while the handler still streams: nothing is
    // settled yet, and nothing could be priced if it were.
    expect(billing.settleSpend).not.toHaveBeenCalled()
    expect(await response.text()).toContain('Stream this')
    expect(settledAt(billing)).toBeCloseTo(TEST_MODEL_USD * 10_000, 6)
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:ai.markSettled', { streamId: 's1' })
  })

  it('runs the model once per stream: a dispatch that loses the claim answers 409 and calls nothing', async () => {
    const billing = makeBilling(50)
    const ai = setupAi(components, { billing, model: MODEL })
    const handler = vi.fn(async () => {})
    ai.stream({ name: 'answer', meter: 'credits', cost: { estimate: 50, creditsPerUsd: 10_000 }, args: {}, handler })
    const { response, ctx } = await postStream(ai, 'answer', 50, { claimed: false })

    expect(response.status).toBe(409)
    expect(handler).not.toHaveBeenCalled()
    expect(billing.settleSpend).not.toHaveBeenCalled()
    expect(billing.releaseSpend).not.toHaveBeenCalled()
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:ai.claimRequest', { streamId: 's1' })
  })

  it('refuses to start a stream whose model this deployment cannot reach', async () => {
    vi.stubEnv('CONVEX_CLOUD_URL', SELF_HOSTED)
    vi.stubEnv('AI_GATEWAY_API_KEY', '')
    const billing = makeBilling(50)
    const ai = setupAi(components, { billing, model: 'openai/gpt-5-mini' })
    const { start } = ai.stream({ name: 'answer', meter: 'credits', cost: { estimate: 50, creditsPerUsd: 100 }, args: {}, handler: async () => {} })

    const refusal = await invoke(start, signedIn(), {}).catch((error: unknown) => error)

    expect(getBackendError(refusal)).toMatchObject({ code: 'unavailable', data: { reason: 'not_configured' } })
    expect(billing.reserveCredits).not.toHaveBeenCalled()
  })

  it('has no stand-in in the package: models.ts never loads a model of its own for an id', () => {
    const models = readFileSync(join(root, 'src/convex/integrations/ai/models.ts'), 'utf8')
    expect(models).not.toMatch(/simulated|stand-in|SIMULATE_MODELS/i)
    expect(readdirSync(join(root, 'src/convex/integrations/ai'))).not.toContain('simulated.ts')
    // The AI SDK itself is an optional peer: only `import type` reaches it statically.
    const files = readdirSync(join(root, 'src'), { recursive: true, encoding: 'utf8' }).filter(file => /\.(?:ts|vue)$/.test(file) && file.startsWith(join('convex', 'integrations', 'ai')))
    for (const file of files) {
      expect(readFileSync(join(root, 'src', file), 'utf8'), file).not.toMatch(/^import (?!type )[^\n]*from 'ai(?:\/[^']*)?'/m)
    }
  })
})

describe('a run whose model calls fail or stop early', () => {
  /** The gateway answering 401, as it does to a bad or expired key. */
  function refuseGateway() {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'expired-key-for-tests')
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Invalid API key', type: 'authentication_error' } }), { status: 401, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)
    return fetch
  }

  const silenceErrors = () => vi.spyOn(console, 'error').mockImplementation(() => {})

  it('refuses and releases an action whose stream call the gateway refused, though streamText swallowed it', async () => {
    refuseGateway()
    const error = silenceErrors()
    const billing = makeBilling(5)
    const ai = setupAi(components, { billing, model: 'openai/gpt-5-mini' })
    const action = ai.meteredAction({ meter: 'credits', cost: { estimate: 5, creditsPerUsd: 1000, minimum: 1 }, args: {}, handler: async ctx => readAll(ctx.model()) })

    const refusal = await invoke(action, signedIn(), {}).catch((caught: unknown) => caught)

    expect(getBackendError(refusal)).toMatchObject({ code: 'unavailable', data: { service: 'ai', reason: 'provider_refused' } })
    expect(billing.releaseSpend).toHaveBeenCalled()
    expect(billing.settleSpend).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith(expect.stringContaining('ai.model_failed'), expect.anything())
  })

  it('refuses a streamed call to a model this deployment cannot reach as not configured, and releases', async () => {
    vi.stubEnv('CONVEX_CLOUD_URL', CLOUD)
    vi.stubEnv('AI_GATEWAY_API_KEY', '')
    silenceErrors()
    const billing = makeBilling(5)
    // A fixed cost and no model on the action: nothing is checked up front.
    const ai = setupAi(components, { billing })
    const action = ai.meteredAction({ meter: 'credits', cost: 5, args: {}, handler: async ctx => readAll(ctx.model('openai/gpt-5-mini')) })

    const refusal = await invoke(action, signedIn(), {}).catch((caught: unknown) => caught)

    expect(getBackendError(refusal)).toMatchObject({ code: 'unavailable', data: { service: 'ai', reason: 'not_configured' } })
    expect(billing.releaseSpend).toHaveBeenCalled()
    expect(billing.settleSpend).not.toHaveBeenCalled()
  })

  it('releases a run whose stream broke with an error part before its finish', async () => {
    silenceErrors()
    const billing = makeBilling(5)
    const ai = setupAi(components, { billing })
    const broken = streamingModel([
      { type: 'stream-start', warnings: [] },
      { type: 'text-start', id: 't' },
      { type: 'text-delta', id: 't', delta: 'Half an ans' },
      { type: 'error', error: new Error('upstream reset') },
    ])
    const action = ai.meteredAction({ meter: 'credits', cost: { estimate: 5, creditsPerUsd: 1000 }, args: {}, handler: async ctx => readAll(ctx.model(broken)) })

    const refusal = await invoke(action, signedIn(), {}).catch((caught: unknown) => caught)

    expect(getBackendError(refusal)).toMatchObject({ code: 'unavailable', data: { reason: 'provider_refused' } })
    expect(billing.releaseSpend).toHaveBeenCalled()
    expect(billing.settleSpend).not.toHaveBeenCalled()
  })

  it('charges the reservation, never the minimum, for a stream the handler stopped reading', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const billing = makeBilling(50)
    const ai = setupAi(components, { billing, model: testModel('openai/gpt-5-mini') })
    const action = ai.meteredAction({
      meter: 'credits',
      cost: { estimate: 50, creditsPerUsd: 100_000, minimum: 1 },
      args: {},
      handler: async (ctx) => {
        const result = streamText({ model: ctx.model(), prompt: 'one two three four five six seven' })
        for await (const chunk of result.textStream) return chunk
        return ''
      },
    })

    await invoke(action, signedIn(), {})

    expect(settledAt(billing)).toBe(50)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ai.cost_unreported'))
  })

  it('prices a fallback by the call that answered: the refused one cost nothing', async () => {
    const billing = makeBilling(50)
    const ai = setupAi(components, { billing, model: testModel('openai/gpt-5-mini') })
    const action = ai.meteredAction({
      meter: 'credits',
      cost: { estimate: 50, creditsPerUsd: 10_000 },
      args: {},
      handler: async (ctx) => {
        try {
          await generateText({ model: ctx.model(refusingModel()), prompt: 'Name three colours' })
        }
        catch {
          // Fall back to the default model below.
        }
        return (await generateText({ model: ctx.model(), prompt: 'Name three colours' })).text
      },
    })

    expect(await invoke(action, signedIn(), {})).toContain('Name three colours')
    expect(settledAt(billing)).toBeCloseTo(TEST_MODEL_USD * 10_000, 6)
  })

  it('releases a delivered ai.stream whose every model call failed, and marks it released', async () => {
    silenceErrors()
    const billing = makeBilling(50)
    const ai = setupAi(components, { billing })
    ai.stream({
      name: 'refused',
      meter: 'credits',
      model: refusingModel(),
      cost: { estimate: 50, creditsPerUsd: 1000, minimum: 1 },
      args: {},
      handler: async (ctx, _args, { append }) => {
        const result = streamText({ model: ctx.model(), prompt: 'hi' })
        for await (const chunk of result.textStream) await append(chunk)
      },
    })

    const { response, ctx } = await postStream(ai, 'refused')
    await response.text()

    expect(billing.releaseSpend).toHaveBeenCalled()
    expect(billing.settleSpend).not.toHaveBeenCalled()
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:ai.markReleased', { streamId: 's1' })
    expect(ctx.runMutation).not.toHaveBeenCalledWith('ref:ai.markSettled', expect.anything())
  })
})

describe('pricing the calls a run made', () => {
  const call = (usd: number | undefined, model = 'openai/gpt-5-mini'): ModelCall => ({ model, state: 'finished', usd, usage: { model, input: 100, output: 10 } })

  it('sums the reported dollars at the rate, without float noise', () => {
    expect(priceModelCalls([call(0.1), call(0.2)], { creditsPerUsd: 10 })).toBe(3)
  })

  it('costs nothing but the minimum when no model was called', () => {
    expect(priceModelCalls([], { creditsPerUsd: 100 })).toBe(0)
    expect(priceModelCalls([], { creditsPerUsd: 100, minimum: 1 })).toBe(1)
  })

  it('reads the gateway\'s decimal-string cost, and nothing that is not one', () => {
    expect(reportedUsd({ gateway: { cost: '0.0045405' } })).toBe(0.0045405)
    expect(reportedUsd({ gateway: { cost: 0.5 } })).toBe(0.5)
    // The Convex AI Gateway's provider reports a number of US dollars.
    expect(reportedUsd({ convexGateway: { cost: 0.0042 } })).toBe(0.0042)
    for (const metadata of [undefined, {}, { gateway: {} }, { gateway: { cost: '' } }, { gateway: { cost: 'free' } }, { gateway: { cost: '-1' } }]) {
      expect(reportedUsd(metadata), JSON.stringify(metadata)).toBeUndefined()
    }
  })

  it('prices a refused call at nothing, a failed one at what it reported, and an unfinished stream not at all', () => {
    const prices = { 'openai/gpt-5-mini': { input: 1, output: 1 } }
    expect(priceModelCalls([call(0.1), { ...call(undefined), state: 'refused' }], { creditsPerUsd: 10 })).toBe(1)
    expect(priceModelCalls([{ ...call(0.2), state: 'failed' }], { creditsPerUsd: 10 })).toBe(2)
    // A stream that never reported usage is no call to price by tokens either.
    expect(priceModelCalls([call(0.1), { ...call(undefined), state: 'open' }], { creditsPerUsd: 10, prices })).toBeUndefined()
    expect(priceModelCalls([{ ...call(undefined), state: 'failed' }], { creditsPerUsd: 10, prices })).toBeUndefined()
  })

  it('fails a run only when every call it made failed, passing a catalog refusal as it is', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const refused = (cause: unknown): ModelCall => ({ ...call(undefined), state: 'refused', error: cause })
    expect(failedRun([])).toBeUndefined()
    expect(failedRun([refused(new Error('x')), call(0.1)])).toBeUndefined()
    expect(failedRun([{ ...call(undefined), state: 'open' }])).toBeUndefined()
    const notConfigured = getBackendError(routeError())
    expect(getBackendError(failedRun([refused(routeError())]))).toEqual(notConfigured)
    expect(getBackendError(failedRun([refused(new Error('401')), { ...call(undefined), state: 'failed', error: new Error('reset') }])))
      .toMatchObject({ code: 'unavailable', data: { service: 'ai', reason: 'provider_refused' } })
    expect(error).toHaveBeenCalledTimes(1)
  })

  it('refuses to guess a call it cannot price', () => {
    expect(priceModelCalls([call(0.1), call(undefined, 'acme-1')], { creditsPerUsd: 10 })).toBeUndefined()
    expect(priceModelCalls([call(undefined, 'acme-1')], { creditsPerUsd: 10, prices: { 'acme-1': { input: 1, output: 1 } } })).toBe(110)
  })
})
