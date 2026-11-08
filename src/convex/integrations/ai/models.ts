import type { LanguageModelMiddleware } from 'ai'
import { getServiceToken } from 'convex/server'
import { backendError, getBackendError } from '../../errors.js'
import { logBackend } from '../../log.js'
import type { AiGateway, AiModel, InferenceRegion, MeteredModel, ModelStatus, SetupAiConfig } from './config.js'
import { upstreamErrorOf } from './job-errors.js'
import { MODEL_ID } from './model-id.js'
import type { TokenUsage } from './pricing.js'

// Where a model id goes, and what each call through it cost. A `provider/model`
// id goes through the gateways `setupAi({ gateway })` names, in order, by
// default the Convex AI Gateway, then the Vercel AI Gateway:
//
// - the Convex AI Gateway, on a deployment that can have it (Convex Cloud, or
//   a local deployment linked to a project): Convex holds the provider keys
//   and bills the team, the deployment proves itself with a short-lived token
//   (`getServiceToken('ai-gateway')`). A free plan refuses it
//   (`AiGatewayDisabled`), and an anonymous local deployment cannot reach it
//   (`AiGatewayUnavailable`): then the next gateway in the order answers. A
//   self-hosted deployment never has it.
// - the Vercel AI Gateway, with the deployment's `AI_GATEWAY_API_KEY`: Convex
//   runs actions on its own servers, never on Vercel, so that gateway's
//   keyless OIDC sign-in never reaches them. Without the key, the next
//   gateway answers.
//
// Whether the Vercel AI Gateway answers is known from the env alone, and
// whether the Convex one does only once its token is asked for. So an order
// is always one of: the Vercel AI Gateway; the Convex AI Gateway with what
// answers when it cannot; or what answers past the last gateway. That is the
// model a test installed (`nuxt-backend/test`), or nothing: the call is
// refused with the reason, and no model answers in their place, so
// development runs on the real models.
//
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

/** A model object: a language model by default, an embedding model for a knowledge store. */
type ModelObject = Exclude<AiModel, string>

/**
 * Where a model id goes when the Convex AI Gateway does not answer it, or
 * where the order never names it: `M` is the kind of model a test installs.
 */
export type FallbackRoute<M = ModelObject>
  = | { route: 'gateway', id: string, apiKey: string }
    | { route: 'own', id: string, model: M, /** The model a test installed for an id: pinned like the gateway it stands in for. */ double?: true }
    | {
      route: 'missing'
      id: string
      /** Pinned to a region, which only the Vercel AI Gateway serves. */
      region?: InferenceRegion
      /** The order `setupAi({ gateway })` named, when it is not the default one: what the refusal says was allowed. */
      gateways?: readonly AiGateway[]
    }

/**
 * What a model resolves to on this deployment, before anything is loaded:
 * `convex` tries the Convex AI Gateway first, and goes to its `fallback` when
 * this deployment cannot use it.
 */
export type ModelRoute<M = ModelObject>
  = | FallbackRoute<M>
    | { route: 'convex', id: string, fallback: FallbackRoute<M> }

/**
 * The gateways a `provider/model` id may go through, in order, and the
 * region every call is pinned to: `setupAi`'s `gateway` and
 * `inferenceRegion`, as {@link routingOf} settles them.
 */
export interface ModelRouting {
  gateways: readonly AiGateway[]
  region?: InferenceRegion
}

/** The order an id goes through when `setupAi` names none: the Convex AI Gateway, then the Vercel AI Gateway. */
export const DEFAULT_GATEWAYS: readonly AiGateway[] = ['convex', 'vercel']

const DEFAULT_ROUTING: ModelRouting = { gateways: DEFAULT_GATEWAYS }

/** Every gateway `setupAi({ gateway })` may name. */
const GATEWAY_NAMES: ReadonlySet<string> = new Set<AiGateway>(['convex', 'vercel'])

/** Whether an order is the default one. */
const isDefaultOrder = (gateways: readonly AiGateway[]): boolean =>
  gateways.length === DEFAULT_GATEWAYS.length && gateways.every((gateway, at) => gateway === DEFAULT_GATEWAYS[at])

/**
 * `setupAi`'s `gateway` and `inferenceRegion`, settled once: the order with
 * each gateway once, narrowed to the Vercel AI Gateway by a region pin,
 * which the Convex AI Gateway documents none of. Refuses a gateway it does
 * not know, an empty order, and a pin with no `'vercel'` to serve it.
 */
export function routingOf(config: Pick<SetupAiConfig, 'gateway' | 'inferenceRegion'>): ModelRouting {
  const { gateway, inferenceRegion: region } = config
  const named: readonly unknown[] = gateway === undefined ? DEFAULT_GATEWAYS : Array.isArray(gateway) ? gateway : [gateway]
  if (named.length === 0) throw new Error('[nuxt-backend] setupAi({ gateway }): name at least one gateway, \'convex\' or \'vercel\'.')
  for (const name of named) {
    if (typeof name !== 'string' || !GATEWAY_NAMES.has(name)) throw new Error(`[nuxt-backend] setupAi({ gateway }): '${String(name)}' is no gateway; use 'convex' or 'vercel'.`)
  }
  const gateways = [...new Set(named as AiGateway[])]
  if (region === undefined) return { gateways }
  if (!gateways.includes('vercel')) {
    throw new Error(`[nuxt-backend] setupAi({ gateway, inferenceRegion }): only the Vercel AI Gateway pins inference to a region, and the Convex AI Gateway documents none. Add 'vercel' to \`gateway\`, or drop \`inferenceRegion\`.`)
  }
  return { gateways: ['vercel'], region }
}

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
function testDouble(id: string): ModelObject | undefined {
  const make = (globalThis as Record<symbol, unknown>)[TEST_MODELS]
  return typeof make === 'function' ? (make as (id: string) => ModelObject)(id) : undefined
}

/**
 * Where an id goes through `gateways`, in order: the Vercel AI Gateway where
 * its key is set; the Convex AI Gateway where {@link convexGatewayPossible},
 * with the rest of the order as its fallback; past the last gateway, the
 * model `double` answers for a test, else nowhere. The key is read only when
 * the order names the Vercel AI Gateway.
 */
function resolveGateways<M>(id: string, gateways: readonly AiGateway[], env: Env, end: () => FallbackRoute<M>): ModelRoute<M> {
  const [first, ...rest] = gateways
  if (first === 'vercel') {
    const apiKey = env[GATEWAY_KEY_ENV]
    return apiKey ? { route: 'gateway', id, apiKey } : resolveGateways(id, rest, env, end)
  }
  if (first === 'convex') {
    if (!convexGatewayPossible(env)) return resolveGateways(id, rest, env, end)
    // routingOf names each gateway once, so what follows the Convex AI Gateway is its fallback.
    return { route: 'convex', id, fallback: resolveGateways(id, rest, env, end) as FallbackRoute<M> }
  }
  return end()
}

/**
 * Where a `provider/model` id goes on this deployment, for a model of any
 * kind: `double` is the model a test installed for it, the last to answer.
 * A pinned region (`routing.region`) is named on a refusal; the order on
 * one when it is not the default.
 */
export function routeId<M>(id: string, env: Env, routing: ModelRouting, double: (id: string) => M | undefined): ModelRoute<M> {
  const { gateways, region } = routing
  return resolveGateways<M>(id, gateways, env, () => {
    const model = double(id)
    if (model !== undefined) return { route: 'own', id, model, double: true }
    return { route: 'missing', id, ...(region === undefined ? isDefaultOrder(gateways) ? {} : { gateways } : { region }) }
  })
}

/**
 * Where a model goes on this deployment: a model object of your own as it
 * is; an id through `setupAi({ gateway })`'s order (default: the Convex AI
 * Gateway where {@link convexGatewayPossible}, then the Vercel AI Gateway
 * with the key), and nowhere past it. A pinned inference region narrows the
 * order to the Vercel AI Gateway, which pins it ({@link routingOf}).
 */
export function routeModel(model: AiModel, env: Env = runtimeEnv(), routing: ModelRouting = DEFAULT_ROUTING): ModelRoute {
  if (typeof model !== 'string') return { route: 'own', id: model.modelId, model }
  return routeId(model, env, routing, testDouble)
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
export function modelStatusOf(model: AiModel | undefined, env: Env = runtimeEnv(), routing: ModelRouting = DEFAULT_ROUTING): ModelStatus {
  if (model === undefined) return { model: null, state: 'missing', route: null }
  const route = routeModel(model, env, routing)
  const settled = route.route === 'convex' && isLoopback(env.CONVEX_CLOUD_URL ?? '') ? route.fallback : route
  const state = settled.route === 'missing' ? 'missing' : 'live'
  return { model: route.id, state, route: STATUS_ROUTE[route.route] }
}

/** The fix a refusal names when the Vercel AI Gateway's key is what is missing. */
const KEY_FIX = 'add it to .env.local and run `npx nuxt-backend env push` (production takes a key of its own: `npx convex env set --prod AI_GATEWAY_API_KEY`), or pass a model object with your provider\'s own key.'

/** Why a model with no route is refused, and the fix, by the order it went through. */
function refusalReason(route: { id: string, region?: InferenceRegion, gateways?: readonly AiGateway[] }, convexReason?: string): string {
  const { id, region, gateways = DEFAULT_GATEWAYS } = route
  if (region) return `${id} is pinned to the '${region}' inference region, which only the Vercel AI Gateway serves, and ${GATEWAY_KEY_ENV} is not set on this deployment: ${KEY_FIX}`
  if (!gateways.includes('vercel')) {
    const why = convexReason
      ? `The Convex AI Gateway did not answer ${id} (${convexReason})`
      : `${id} goes through the Convex AI Gateway, which this deployment cannot use (a self-hosted deployment, or none)`
    return `${why}, and setupAi({ gateway: 'convex' }) names no other gateway: call it on a deployment the Convex AI Gateway serves (Convex Cloud, or a local deployment linked to a project, on a paid plan, with ${CONVEX_GATEWAY_PROVIDER} installed), or add 'vercel' to \`gateway\` and set ${GATEWAY_KEY_ENV}.`
  }
  if (!gateways.includes('convex')) return `${id} goes through the Vercel AI Gateway (setupAi({ gateway: 'vercel' })), and ${GATEWAY_KEY_ENV} is not set on this deployment: ${KEY_FIX}`
  if (convexReason) return `The Convex AI Gateway did not answer ${id} (${convexReason}), and ${GATEWAY_KEY_ENV} is not set on this deployment: ${KEY_FIX}`
  return `${id} needs ${GATEWAY_KEY_ENV} on this deployment, which cannot use the Convex AI Gateway: ${KEY_FIX}`
}

/**
 * The refusal of a call to a model this deployment cannot reach, saying why
 * the Convex AI Gateway did not answer it when it was tried, and what the
 * order (`setupAi({ gateway })`) allowed instead.
 */
export function modelRefusal(route: { id: string, region?: InferenceRegion, gateways?: readonly AiGateway[] }, convexReason?: string): Error {
  return backendError('unavailable', { service: 'ai', reason: 'not_configured' }, `[nuxt-backend] ${refusalReason(route, convexReason)}`)
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
export const FALLBACK_NAME = { missing: 'nothing, and is refused', gateway: 'the Vercel AI Gateway', own: 'the model a test installed' } as const

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
  const upstream = upstreamErrorOf(error)
  logBackend('error', 'ai.model_failed', `Every model call this run made failed (${model} first${upstream ? `: ${upstream}` : ''}): the run is refused and nothing is charged.`, error)
  return backendError('unavailable', { service: 'ai', reason: 'provider_refused' }, `[nuxt-backend] The model call to ${model} failed. Try again shortly.`)
}
