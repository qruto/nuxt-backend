import type { LanguageModelMiddleware } from 'ai'
import { getServiceToken } from 'convex/server'
import { backendError, getBackendError } from '../../errors.js'
import { logBackend } from '../../log.js'
import type { AiModel, InferenceRegion, MeteredModel, ModelStatus } from './config.js'
import { MODEL_ID } from './model-id.js'
import type { TokenUsage } from './pricing.js'

// Where a model id goes, and what each call through it cost. A `provider/model`
// id goes, in order, to:
//
// 1. the Convex AI Gateway, on a deployment that can have it (Convex Cloud, or
//    a local deployment linked to a project): Convex holds the provider keys
//    and bills the team, the deployment proves itself with a short-lived token
//    (`getServiceToken('ai-gateway')`). A free plan refuses it
//    (`AiGatewayDisabled`), and an anonymous local deployment cannot reach it
//    (`AiGatewayUnavailable`): then the next route answers.
// 2. the Vercel AI Gateway, with the deployment's `AI_GATEWAY_API_KEY`: Convex
//    runs actions on its own servers, never on Vercel, so that gateway's
//    keyless OIDC sign-in never reaches them.
//    With neither, the call is refused with the reason, and nothing is
//    answered in their place: development runs on the real models.
//
// A self-hosted deployment never has the Convex AI Gateway: it starts at 2.
// An app that wants its own provider key passes a model object instead.
//
// The AI SDK and the Convex gateway's provider are optional peers: an app that
// never names a model never installs them. So nothing here imports them at
// load time. Each import sits in a `try`, which keeps the platform's bundler
// from failing an app without them, and turns a missing package into a
// fallback, or a refusal that says what to install.

/** The env name the gateway's key is read from: the gateway's own, read as it is. */
export const GATEWAY_KEY_ENV = 'AI_GATEWAY_API_KEY'

/** The provider package the Convex AI Gateway is called through. */
export const CONVEX_GATEWAY_PROVIDER = '@convex-dev/ai-sdk-provider'

/** Where a model id goes when the Convex AI Gateway does not answer it. */
export type FallbackRoute
  = | { route: 'gateway', id: string, apiKey: string }
    | { route: 'own', id: string, model: Exclude<AiModel, string>, /** The model a test installed for an id: pinned like the gateway it stands in for. */ double?: true }
    | { route: 'missing', id: string, /** Pinned to a region, which only the Vercel AI Gateway serves. */ region?: InferenceRegion }

/**
 * What a model resolves to on this deployment, before anything is loaded:
 * `convex` tries the Convex AI Gateway first, and goes to its `fallback` when
 * this deployment cannot use it.
 */
export type ModelRoute
  = | FallbackRoute
    | { route: 'convex', id: string, fallback: FallbackRoute }

/** One model call a metered run made: the model, how it ended, the cost it reported in US dollars, and its tokens. */
/** A model's id: the `provider/model` string, or a model object's own. */
export function modelIdOf(model: AiModel): string
export function modelIdOf(model: AiModel | undefined): string | undefined
export function modelIdOf(model: AiModel | undefined): string | undefined {
  if (model === undefined) return undefined
  return typeof model === 'string' ? model : (model as { modelId: string }).modelId
}

export interface ModelCall {
  model: string
  /**
   * - `finished`: it reached its end, with its usage and any cost;
   * - `open`: a stream that had not ended when the run did (the handler
   *   stopped reading it): its cost was never reported;
   * - `failed`: a stream that broke with an error part after it started;
   * - `refused`: it never answered (the provider refused it, or the model
   *   is unreachable here), so it cost nothing.
   */
  state: 'finished' | 'open' | 'failed' | 'refused'
  /** The cost the call reported, in US dollars; `undefined` when it reported none. */
  usd?: number
  usage: TokenUsage
  /** Why a `failed` or `refused` call ended. */
  error?: unknown
  /** Why a finished call stopped, as the AI SDK reports it (`stop`, `content-filter`, …). */
  finishReason?: string
}

type Env = Readonly<Record<string, string | undefined>>

const runtimeEnv = (): Env => (typeof process === 'undefined' ? {} : process.env)

/**
 * Refuse a model id that is no `provider/model` id where it is configured,
 * so a typo fails the push rather than the first call. A model object passes.
 */
export function requireModelId(model: AiModel | undefined, where: string): void {
  if (typeof model === 'string' && !MODEL_ID.test(model)) {
    throw new Error(`[nuxt-backend] ${where}: model '${model}' is not a provider/model id, such as 'openai/gpt-5-mini'.`)
  }
}

/** A deployment URL's host name, or `null` when it is no URL. */
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname
  }
  catch {
    return null
  }
}

/** Whether a deployment URL is a loopback address, where a local deployment serves. */
function isLoopback(url: string): boolean {
  return ['127.0.0.1', 'localhost', '[::1]'].includes(hostOf(url) ?? '')
}

/**
 * Whether this deployment can have the Convex AI Gateway: Convex Cloud, or a
 * local deployment (one linked to a project reaches it; an anonymous one is
 * refused when it asks). A self-hosted deployment never does, and a run
 * without a deployment URL (a Vitest run) is no deployment.
 */
export function convexGatewayPossible(env: Env = runtimeEnv()): boolean {
  const url = env.CONVEX_CLOUD_URL
  if (!url) return false
  return isLoopback(url) || (hostOf(url)?.endsWith('.convex.cloud') ?? false)
}

/**
 * Where `nuxt-backend/test` leaves its answer for a `provider/model` id: a
 * function from an id to a model. Nothing else ever sets it, so a deployment
 * has none, and an id with no route is refused there. It is read off
 * `globalThis`, so a copy of this module a bundler loaded twice sees it too.
 */
export const TEST_MODELS = Symbol.for('nuxt-backend.testModels')

/** The same, for an embedding model's id (`ai.knowledge`). */
export const TEST_EMBEDDING_MODELS = Symbol.for('nuxt-backend.testEmbeddingModels')

/** The model a test installed for an id, when one did. */
function testDouble(id: string): Exclude<AiModel, string> | undefined {
  const make = (globalThis as Record<symbol, unknown>)[TEST_MODELS]
  return typeof make === 'function' ? (make as (id: string) => Exclude<AiModel, string>)(id) : undefined
}

/** Where an id goes when the Convex AI Gateway does not answer: the Vercel AI Gateway with the key, else the model a test installed, else nowhere. */
function fallbackRoute(id: string, env: Env): FallbackRoute {
  const apiKey = env[GATEWAY_KEY_ENV]
  if (apiKey) return { route: 'gateway', id, apiKey }
  const double = testDouble(id)
  return double ? { route: 'own', id, model: double, double: true } : { route: 'missing', id }
}

/**
 * Where a model goes on this deployment: a model object of your own as it is;
 * an id to the Convex AI Gateway first where {@link convexGatewayPossible},
 * then through the Vercel AI Gateway with the key, and nowhere without it.
 * A pinned inference region (`setupAi({ inferenceRegion })`) skips the
 * Convex AI Gateway, which documents no region: the Vercel route pins it.
 */
export function routeModel(model: AiModel, env: Env = runtimeEnv(), region?: InferenceRegion): ModelRoute {
  if (typeof model !== 'string') return { route: 'own', id: model.modelId, model }
  const fallback = fallbackRoute(model, env)
  if (region !== undefined) return fallback.route === 'missing' ? { ...fallback, region } : fallback
  return convexGatewayPossible(env) ? { route: 'convex', id: model, fallback } : fallback
}

/** The `ModelStatus.route` each route reports. */
const STATUS_ROUTE = {
  convex: 'convex-gateway',
  gateway: 'vercel-gateway',
  own: 'provider',
  missing: null,
} as const

/**
 * A route as `ai.modelStatus()` reports it. Read from the env alone, so a
 * query can show it: the Convex AI Gateway counts as live on Convex Cloud,
 * where a paid plan has it (a free plan refuses it when called, and doctor
 * says so); on a local deployment it may answer, so the state is its
 * fallback's.
 */
export function modelStatusOf(model: AiModel | undefined, env: Env = runtimeEnv(), region?: InferenceRegion): ModelStatus {
  if (model === undefined) return { model: null, state: 'missing', route: null }
  const route = routeModel(model, env, region)
  const settled = route.route === 'convex' && isLoopback(env.CONVEX_CLOUD_URL ?? '') ? route.fallback : route
  const state = settled.route === 'missing' ? 'missing' : 'live'
  return { model: route.id, state, route: STATUS_ROUTE[route.route] }
}

/**
 * The refusal of a call to a model this deployment cannot reach, saying why
 * the Convex AI Gateway did not answer it when it was tried.
 */
export function modelRefusal(route: { id: string, region?: InferenceRegion }, convexReason?: string): Error {
  const why = route.region
    ? `${route.id} is pinned to the '${route.region}' inference region, which only the Vercel AI Gateway serves, and ${GATEWAY_KEY_ENV} is not set on this deployment`
    : convexReason
      ? `The Convex AI Gateway did not answer ${route.id} (${convexReason}), and ${GATEWAY_KEY_ENV} is not set on this deployment`
      : `${route.id} needs ${GATEWAY_KEY_ENV} on this deployment, which cannot use the Convex AI Gateway`
  return backendError(
    'unavailable',
    { service: 'ai', reason: 'not_configured' },
    `[nuxt-backend] ${why}: add it to .env.local and run \`npx nuxt-backend env push\` (\`--prod\` for production), or pass a model object with your provider's own key.`,
  )
}

/** Why the Convex AI Gateway cannot be used here, as the token request says: the deployment's plan or kind, never a passing failure. */
const GATEWAY_OFF = /AiGatewayDisabled|AiGatewayUnavailable|outside of a Convex backend/

export type ConvexProvider = typeof import('@convex-dev/ai-sdk-provider')

/**
 * The Convex AI Gateway's model for an id, or why it cannot be used here: no
 * provider package to call it through, or a token request the deployment's
 * plan (`AiGatewayDisabled`) or kind (`AiGatewayUnavailable`) refuses. Any
 * other refusal of the token (a spent `aiGatewayCostDollars` limit, a
 * suspended team) refuses the call: a limit is never routed around.
 */
export async function convexGatewayModel<T = Exclude<AiModel, string>>(id: string, make: (provider: ConvexProvider) => T = provider => provider.convexGateway(id) as T): Promise<{ model: T } | { unavailable: string }> {
  let provider: ConvexProvider
  try {
    provider = await import('@convex-dev/ai-sdk-provider')
  }
  catch {
    return { unavailable: `${CONVEX_GATEWAY_PROVIDER} is not installed: \`pnpm add ${CONVEX_GATEWAY_PROVIDER}\`` }
  }
  try {
    await getServiceToken('ai-gateway')
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (GATEWAY_OFF.test(message)) return { unavailable: message }
    throw backendError('unavailable', { service: 'ai', reason: 'provider_refused' }, `[nuxt-backend] The Convex AI Gateway refused ${id}: ${message}`)
  }
  return { model: make(provider) }
}

export type Sdk = typeof import('ai')

/** The AI SDK, or the refusal that says to install it. */
export async function loadSdk(): Promise<Sdk> {
  try {
    return await import('ai')
  }
  catch (error) {
    throw backendError(
      'unavailable',
      { service: 'ai', reason: 'not_configured' },
      `[nuxt-backend] Model calls need the AI SDK: install it with \`pnpm add ai\`. (${error instanceof Error ? error.message : String(error)})`,
    )
  }
}

/** One gateway provider per key: the key is the only setting it takes. */
const gateways = new Map<string, ReturnType<Sdk['createGateway']>>()

export function gatewayFor(sdk: Sdk, apiKey: string): ReturnType<Sdk['createGateway']> {
  let gateway = gateways.get(apiKey)
  if (!gateway) {
    // The key is passed, never left for the provider to find: without one it
    // would try the platform's OIDC token, which a Convex action never has.
    gateway = sdk.createGateway({ apiKey })
    gateways.clear()
    gateways.set(apiKey, gateway)
  }
  return gateway
}

let convexGatewayNoticed = false

/** Say once per isolate that the Convex AI Gateway cannot be used here, and where ids go instead. */
export function noticeConvexGateway(id: string, unavailable: string, fallback: string): void {
  if (convexGatewayNoticed) return
  convexGatewayNoticed = true
  logBackend('info', 'ai.convex_gateway_unavailable', `The Convex AI Gateway cannot be used on this deployment (${unavailable}): ${id} goes to ${fallback}.`)
}

/** What a fallback route is called in the log. */
const FALLBACK_NAME = { missing: 'nothing, and is refused', gateway: 'the Vercel AI Gateway', own: 'the model a test installed' } as const

/**
 * The Convex AI Gateway's model for a `convex` route, or its fallback's when
 * this deployment cannot use it (said once per isolate), or the refusal when
 * there is none.
 */
async function convexOrFallback(sdk: Sdk, route: ModelRoute & { route: 'convex' }): Promise<Exclude<AiModel, string>> {
  const convex = await convexGatewayModel(route.id)
  if ('model' in convex) return convex.model
  noticeConvexGateway(route.id, convex.unavailable, FALLBACK_NAME[route.fallback.route])
  if (route.fallback.route === 'missing') throw modelRefusal(route.fallback, convex.unavailable)
  return baseModel(sdk, route.fallback)
}

/** The model a route loads, before metering wraps it. */
async function baseModel(sdk: Sdk, route: Exclude<ModelRoute, { route: 'missing' }>): Promise<Exclude<AiModel, string>> {
  switch (route.route) {
    case 'convex':
      return convexOrFallback(sdk, route)
    case 'gateway':
      return gatewayFor(sdk, route.apiKey)(route.id)
    case 'own':
      return route.model
  }
}

/**
 * A cost the gateway reported for a call, in US dollars: the Vercel AI
 * Gateway's `providerMetadata.gateway.cost` (a decimal string), or the
 * Convex AI Gateway's `providerMetadata.convexGateway.cost` (a number).
 * `undefined` when there is none to read.
 */
export function reportedUsd(metadata: unknown): number | undefined {
  const { gateway, convexGateway } = (metadata ?? {}) as { gateway?: { cost?: unknown }, convexGateway?: { cost?: unknown } }
  const cost = convexGateway?.cost ?? gateway?.cost
  if (typeof cost === 'string' && cost.trim() === '') return undefined
  const usd = typeof cost === 'string' ? Number(cost) : typeof cost === 'number' ? cost : Number.NaN
  return Number.isFinite(usd) && usd >= 0 ? usd : undefined
}

/** A call's tokens, as `priceTokens` reads them. */
interface CallUsage {
  inputTokens: { total?: number, noCache?: number, cacheRead?: number }
  outputTokens: { total?: number }
}

/** A finish reason as a string: the AI SDK's `{ unified }`, or the string itself. */
function reasonOf(finishReason: unknown): Pick<ModelCall, 'finishReason'> {
  const reason = typeof finishReason === 'string' ? finishReason : (finishReason as { unified?: unknown } | undefined)?.unified
  return typeof reason === 'string' ? { finishReason: reason } : {}
}

/** A call's usage and cost, as `priceTokens` and the settle read them. */
function finishedCall(model: string, usage: CallUsage, metadata: unknown): Pick<ModelCall, 'usd' | 'usage'> {
  const cached = usage.inputTokens.cacheRead ?? 0
  const input = usage.inputTokens.noCache ?? Math.max(0, (usage.inputTokens.total ?? 0) - cached)
  return {
    usd: reportedUsd(metadata),
    usage: { model, input, output: usage.outputTokens.total ?? 0, ...(cached > 0 ? { cachedInput: cached } : {}) },
  }
}

/** A call that has not reported anything yet. */
const emptyCall = (model: string, state: ModelCall['state'], error?: unknown): ModelCall =>
  ({ model, state, usage: { model, input: 0, output: 0 }, ...(error === undefined ? {} : { error }) })

/** The gateway's own option that pins a call to a region (Vercel AI Gateway, regional inference). */
export function regionOptions(region: InferenceRegion) {
  return { gateway: { inferenceRegion: { scope: 'zone', geoRegion: region } } } as const
}

/** Merge the region pin into a call's provider options, over whatever the call passed for the gateway. */
export function pinProviderOptions<T extends Record<string, unknown> | undefined>(providerOptions: T, region: InferenceRegion): Record<string, Record<string, unknown>> {
  const own = (providerOptions ?? {}) as Record<string, Record<string, unknown> | undefined>
  const pin = regionOptions(region).gateway
  // A call that passes its own `inferenceRegion` (per-provider overrides) keeps it.
  return { ...own, gateway: { ...pin, ...own.gateway } } as Record<string, Record<string, unknown>>
}

/**
 * The regions a call reports it ran in: each successful provider attempt's
 * `inferenceEndpoint.geoRegion` under `providerMetadata.gateway.routing`.
 */
export function reportedRegions(metadata: unknown): string[] {
  const routing = (metadata as { gateway?: { routing?: { modelAttempts?: unknown } } } | undefined)?.gateway?.routing
  const attempts = Array.isArray(routing?.modelAttempts) ? routing.modelAttempts as Array<{ providerAttempts?: unknown }> : []
  return attempts.flatMap(attempt => Array.isArray(attempt.providerAttempts) ? attempt.providerAttempts as Array<{ success?: unknown, inferenceEndpoint?: { geoRegion?: unknown } | null }> : [])
    .filter(attempt => attempt.success !== false)
    .flatMap(attempt => typeof attempt.inferenceEndpoint?.geoRegion === 'string' ? [attempt.inferenceEndpoint.geoRegion] : [])
}

/** Log a call that reports it ran outside the pinned region. */
export function checkRegion(id: string, metadata: unknown, region: InferenceRegion | undefined): void {
  if (region === undefined) return
  const elsewhere = reportedRegions(metadata).filter(reported => reported !== region)
  if (elsewhere.length > 0) logBackend('warn', 'ai.region_mismatch', `${id} is pinned to the '${region}' region but reported running in '${elsewhere.join('\', \'')}'. Check the call's own providerOptions.gateway.inferenceRegion overrides.`)
}

/**
 * The AI SDK middleware that records each call: a generation once it returns;
 * a stream as soon as it answers (`open`), then `finished` at its `finish`
 * part, which carries the usage and the cost, or `failed` at an error part.
 * A stream the handler stops reading stays `open`: its cost is unknown.
 */
function recordCalls(id: string, calls: ModelCall[], region?: InferenceRegion): LanguageModelMiddleware {
  return {
    specificationVersion: 'v4',
    ...(region === undefined ? {} : { transformParams: async ({ params }) => ({ ...params, providerOptions: pinProviderOptions(params.providerOptions, region) as typeof params.providerOptions }) }),
    wrapGenerate: async ({ doGenerate }) => {
      const result = await doGenerate()
      checkRegion(id, result.providerMetadata, region)
      calls.push({ model: id, state: 'finished', ...finishedCall(id, result.usage, result.providerMetadata), ...reasonOf(result.finishReason) })
      return result
    },
    wrapStream: async ({ doStream }) => {
      const { stream, ...rest } = await doStream()
      const call = emptyCall(id, 'open')
      calls.push(call)
      return {
        ...rest,
        stream: stream.pipeThrough(new TransformStream({
          transform(part, controller) {
            if (part.type === 'error' && call.state === 'open') Object.assign(call, { state: 'failed', error: part.error })
            // A finish after an error keeps the call failed, with what it cost.
            if (part.type === 'finish') checkRegion(id, part.providerMetadata, region)
            if (part.type === 'finish') Object.assign(call, finishedCall(id, part.usage, part.providerMetadata), reasonOf(part.finishReason), call.state === 'open' ? { state: 'finished' } : {})
            controller.enqueue(part)
          },
        })),
      }
    },
  }
}

/** Run one call, recording it `refused` when it never answers. */
async function recordRefusal<T>(id: string, calls: ModelCall[], call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  }
  catch (error) {
    calls.push(emptyCall(id, 'refused', error))
    throw error
  }
}

/**
 * The model a metered handler calls: an AI SDK language model, handed over at
 * once and loaded on its first call, that records every call into `calls`. A
 * model this deployment cannot reach refuses each call `unavailable`.
 */
export function meteredModel(route: ModelRoute, calls: ModelCall[], region?: InferenceRegion): MeteredModel {
  let loaded: Promise<MeteredModel> | undefined
  const load = () => (loaded ??= (async () => {
    if (route.route === 'missing') throw modelRefusal(route)
    const sdk = await loadSdk()
    // The pin rides on every call to an id; a model object of your own has no gateway to pin.
    const pin = route.route === 'own' && !route.double ? undefined : region
    return sdk.wrapLanguageModel({ model: await baseModel(sdk, route), middleware: recordCalls(route.id, calls, pin) })
  })())
  const provider = route.route === 'own' ? route.model.provider : route.route === 'convex' ? 'convexGateway' : route.route
  return {
    specificationVersion: 'v4',
    provider,
    modelId: route.id,
    // Read before the call is made: a model that cannot load supports no
    // URLs here, so its refusal comes from the call, which records it.
    get supportedUrls() {
      return load().then(model => model.supportedUrls, () => ({}))
    },
    doGenerate: options => recordRefusal(route.id, calls, async () => (await load()).doGenerate(options)),
    doStream: options => recordRefusal(route.id, calls, async () => (await load()).doStream(options)),
  }
}

/**
 * The error a run failed with when every model call it made failed, though
 * its handler returned: `streamText` hands a failed call to its `onError`
 * and ends the text stream as if the answer were done, so a handler reading
 * it returns an empty answer. Such a run failed, and is refused as such: a
 * catalog error passes as it is (a model this deployment cannot reach), any
 * other is logged and refused `unavailable` (reason `provider_refused`).
 * `undefined` when the run made no call, or any call answered.
 */
export function failedRun(calls: readonly ModelCall[]): Error | undefined {
  if (calls.length === 0 || calls.some(call => call.state === 'finished' || call.state === 'open')) return undefined
  const { model, error } = calls[0]!
  if (getBackendError(error)) return error as Error
  logBackend('error', 'ai.model_failed', `Every model call this run made failed (${model} first): the run is refused and nothing is charged.`, error)
  return backendError('unavailable', { service: 'ai', reason: 'provider_refused' }, `[nuxt-backend] The model call to ${model} failed. Try again shortly.`)
}
