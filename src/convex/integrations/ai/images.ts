import type { ImageModel } from 'ai'
import {
  checkRegion,
  type GatewayLoaders,
  loadRoute,
  type ModelCall,
  type ModelRoute,
  type ModelRouting,
  pinProviderOptions,
  reportedUsd,
  routeId,
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

/** A call that never answered, as the run records it. */
const refusedCall = (id: string, error: unknown): ModelCall => ({ model: id, state: 'refused', usage: { model: id, input: 0, output: 0 }, error })

/**
 * The image model a job step calls (`ctx.image()`): handed over at once and
 * loaded on its first call, recording each call's cost and tokens into
 * `calls`, and pinned to the routing's region on the gateway's route. Every
 * call gets the step's deadline when it brings no signal of its own.
 */
export function meteredImageModel(model: AiImageModel, calls: ModelCall[], options: { routing: ModelRouting, signal?: AbortSignal }): ImageModelObject {
  const { routing, signal: deadline } = options
  const id = imageModelId(model)
  let loaded: Promise<{ model: ImageModelObject, pinned: boolean }> | undefined
  const load = () => (loaded ??= typeof model === 'string'
    ? loadRoute(routeImage(model, routing), IMAGE_LOADERS)
    : Promise.resolve({ model: model as ImageModelObject, pinned: false }))
  return {
    specificationVersion: 'v4',
    provider: typeof model === 'string' ? 'gateway' : model.provider,
    modelId: id,
    maxImagesPerCall: 1,
    doGenerate: async (callOptions) => {
      let base: { model: ImageModelObject, pinned: boolean }
      try {
        base = await load()
      }
      catch (error) {
        calls.push(refusedCall(id, error))
        throw error
      }
      const pin = base.pinned ? routing.region : undefined
      const signal = callOptions.abortSignal ?? deadline
      try {
        const result = await base.model.doGenerate({
          ...callOptions,
          ...(signal ? { abortSignal: signal } : {}),
          ...(pin === undefined ? {} : { providerOptions: pinProviderOptions(callOptions.providerOptions, pin) as typeof callOptions.providerOptions }),
        })
        checkRegion(id, result.providerMetadata, pin)
        calls.push({
          model: id,
          state: 'finished',
          usd: reportedUsd(result.providerMetadata),
          usage: { model: id, input: result.usage?.inputTokens ?? 0, output: result.usage?.outputTokens ?? 0 },
          finishReason: result.images.length === 0 ? 'content-filter' : 'stop',
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
