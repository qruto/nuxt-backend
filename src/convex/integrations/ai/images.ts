import type { ImageModel } from 'ai'
import { backendError } from '../../errors.js'
import { CONTENT_REFUSAL, emptiedForSafety, NO_IMAGE } from './job-errors.js'
import {
  checkRegion,
  type GatewayLoaders,
  loadRoute,
  type ModelCall,
  type ModelRoute,
  type ModelRouting,
  pinProviderOptions,
  refusalRouting,
  reportedUsd,
  routeId,
  stepSignal,
  TEST_IMAGE_MODELS,
} from './models.js'

// Where an image model goes (`ctx.image()` in a job step): the same route as
// a language model's id, through its `setupAi({ routes })` order or
// `setupAi({ gateway })`'s, then the mock `nuxt-backend/test` installs,
// else a refusal. A model object of your own is called as it is. Each call
// is recorded like a language model's: its cost, its tokens, and the model,
// so the job's price report, the Costs tab, the spend limit and the image's
// provenance all count it.

/** An image model: a `provider/model` id from the gateway's list, or an AI SDK image model object. */
export type AiImageModel = string | Exclude<ImageModel, string>

type ImageModelObject = Extract<Exclude<ImageModel, string>, { specificationVersion: 'v4' }>

type Env = Readonly<Record<string, string | undefined>>

const runtimeEnv = (): Env => (typeof process === 'undefined' ? {} : process.env)

/** The id an image model is known by. */
export function imageModelId(model: AiImageModel): string {
  return typeof model === 'string' ? model : model.modelId
}

/** The mock a test installed for an image id, when one did. */
function testDouble(id: string): ImageModelObject | undefined {
  const make = (globalThis as Record<symbol, unknown>)[TEST_IMAGE_MODELS]
  return typeof make === 'function' ? (make as (id: string) => ImageModelObject)(id) : undefined
}

/** Where an image id goes on this deployment: the language models' resolver, the test's mock last. */
export function routeImage(id: string, routing: ModelRouting, env: Env = runtimeEnv()): ModelRoute<ImageModelObject> {
  return routeId(id, env, routing, testDouble)
}

/** How an image model loads from each gateway. */
const IMAGE_LOADERS: GatewayLoaders<ImageModelObject> = {
  convex: (provider, id) => provider.convexGateway.imageModel(id) as ImageModelObject,
  vercel: (gateway, id) => gateway.image(id) as ImageModelObject,
}

/**
 * A call that never answered, as the run records it: one the provider
 * refused for its content (`moderation_blocked`, its safety system) with a
 * `content-filter` reason, so the job fails as `content_blocked` at once;
 * one that answered no image (`NoImageGeneratedError`) with `no-image`,
 * an empty answer one more attempt may fill.
 */
const refusedCall = (id: string, error: unknown): ModelCall => {
  const code = (error as { code?: unknown } | null)?.code
  const text = error instanceof Error ? `${error.name} ${error.message} ${typeof code === 'string' ? code : ''}` : String(error)
  const finishReason = CONTENT_REFUSAL.test(text) ? 'content-filter' : NO_IMAGE.test(text) ? 'no-image' : undefined
  return { model: id, kind: 'image', state: 'refused', usage: { model: id, input: 0, output: 0 }, error, ...(finishReason ? { finishReason } : {}) }
}

/**
 * Where an image edit goes: a call with input images (`files`) or a
 * `mask`. The Convex AI Gateway does not support editing, so an edit takes
 * the Vercel AI Gateway alone, where the id's order names it, and is refused
 * where it does not, before any call.
 */
function loadEdit(id: string, routing: ModelRouting): Promise<{ model: ImageModelObject, pinned: boolean }> {
  if (!refusalRouting(id, routing).gateways.includes('vercel')) {
    throw backendError('unavailable', { service: 'ai', reason: 'not_configured' }, `[nuxt-backend] ${id}: an image edit (input images or a mask) goes through the Vercel AI Gateway, since the Convex AI Gateway does not support image editing, and this model's order names no 'vercel'. Add it for the model: setupAi({ routes: { '${id}': 'vercel' } }), with AI_GATEWAY_API_KEY set.`)
  }
  return loadRoute(routeImage(id, { ...routing, routes: { ...routing.routes, [id]: ['vercel'] } }), IMAGE_LOADERS)
}

/**
 * Why a call drew no image: refused by the provider's content filter when
 * its answer says no other try would draw one (`isRetryable: false`, as
 * the Vercel AI Gateway marks it), or gives a finish reason for safety
 * ({@link emptiedForSafety}); else an empty answer one more attempt may
 * fill.
 */
const emptyReason = (result: { isRetryable?: boolean, providerMetadata?: unknown, warnings?: readonly unknown[] }): string =>
  result.isRetryable === false || emptiedForSafety(result) ? 'content-filter' : 'no-image'

/**
 * The image model a job step calls (`ctx.image()`): handed over at once and
 * loaded on its first call, recording each call's cost and tokens into
 * `calls`, and pinned to the routing's region on the gateway's route. Every
 * call gets the step's deadline beside any signal of its own. An edit
 * (`files` or a `mask`) goes through the Vercel AI Gateway alone.
 */
export function meteredImageModel(model: AiImageModel, calls: ModelCall[], options: { routing: ModelRouting, signal?: AbortSignal }): ImageModelObject {
  const { routing, signal: deadline } = options
  const id = imageModelId(model)
  const loaded = new Map<boolean, Promise<{ model: ImageModelObject, pinned: boolean }>>()
  const load = (edit: boolean) => {
    let route = loaded.get(edit)
    if (!route) {
      route = typeof model !== 'string'
        ? Promise.resolve({ model: model as ImageModelObject, pinned: false })
        : edit ? loadEdit(model, routing) : loadRoute(routeImage(model, routing), IMAGE_LOADERS)
      loaded.set(edit, route)
    }
    return route
  }
  return {
    specificationVersion: 'v4',
    provider: typeof model === 'string' ? 'gateway' : model.provider,
    modelId: id,
    maxImagesPerCall: 1,
    doGenerate: async (callOptions) => {
      let base: { model: ImageModelObject, pinned: boolean }
      try {
        base = await load(Boolean(callOptions.files?.length || callOptions.mask))
      }
      catch (error) {
        calls.push(refusedCall(id, error))
        throw error
      }
      const pin = base.pinned ? routing.region : undefined
      const signal = stepSignal(callOptions.abortSignal, deadline)
      try {
        const result = await base.model.doGenerate({
          ...callOptions,
          ...(signal ? { abortSignal: signal } : {}),
          ...(pin === undefined ? {} : { providerOptions: pinProviderOptions(callOptions.providerOptions, pin) as typeof callOptions.providerOptions }),
        })
        checkRegion(id, result.providerMetadata, pin)
        calls.push({
          model: id,
          kind: 'image',
          state: 'finished',
          usd: reportedUsd(result.providerMetadata),
          usage: { model: id, input: result.usage?.inputTokens ?? 0, output: result.usage?.outputTokens ?? 0 },
          finishReason: result.images.length === 0 ? emptyReason(result) : 'stop',
        })
        return result
      }
      catch (error) {
        calls.push(refusedCall(id, error))
        throw error
      }
    },
  }
}
