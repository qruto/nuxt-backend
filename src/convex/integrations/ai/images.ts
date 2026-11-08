import type { ImageModel } from 'ai'
import type { InferenceRegion } from './config.js'
import {
  checkRegion,
  convexGatewayModel,
  gatewayFor,
  loadSdk,
  type ModelCall,
  type ModelRoutes,
  modelRefusal,
  noticeConvexGateway,
  pinProviderOptions,
  reportedUsd,
  routeModel,
  TEST_IMAGE_MODELS,
} from './models.js'

// Where an image model goes (`ctx.image()` in a job step): the same route as
// a language model's id, with `setupAi({ routes })` applied. The Convex AI
// Gateway first where the deployment can have it, then the Vercel AI Gateway
// with `AI_GATEWAY_API_KEY`, then the mock `nuxt-backend/test` installs, else
// a refusal. A model object of your own is called as it is. Each call is
// recorded like a language model's: its cost, its tokens, and the model, so
// the job's price report, the Costs tab, the spend limit and the image's
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

/** The model an id loads, through the route its language model would take, and whether the Vercel route pinned it. */
async function baseImageModel(id: string, region: InferenceRegion | undefined, routes: ModelRoutes | undefined, env: Env): Promise<{ model: ImageModelObject, pinned: boolean }> {
  const route = routeModel(id, env, { region, routes })
  const fallback = async (target: typeof route, unavailable?: string): Promise<{ model: ImageModelObject, pinned: boolean }> => {
    if (target.route === 'gateway') return { model: gatewayFor(await loadSdk(), target.apiKey).image(id) as ImageModelObject, pinned: true }
    const double = target.route === 'own' ? testDouble(id) : undefined
    if (double) return { model: double, pinned: true }
    throw modelRefusal({ id, ...(region ? { region } : {}) }, unavailable)
  }
  if (route.route !== 'convex') return fallback(route)
  const convex = await convexGatewayModel(id, provider => provider.convexGateway.imageModel(id) as ImageModelObject)
  if ('model' in convex) return { model: convex.model, pinned: false }
  noticeConvexGateway(id, convex.unavailable, route.fallback.route === 'gateway' ? 'the Vercel AI Gateway' : 'nothing, and is refused')
  return fallback(route.fallback, convex.unavailable)
}

/**
 * The image model a job step calls (`ctx.image()`): handed over at once and
 * loaded on its first call, recording each call's cost and tokens into
 * `calls`, and pinned to `region` on the gateway's route. Every call gets
 * the step's deadline when it brings no signal of its own.
 */
export function meteredImageModel(model: AiImageModel, calls: ModelCall[], options: { region?: InferenceRegion, routes?: ModelRoutes, signal?: AbortSignal } = {}): ImageModelObject {
  const id = imageModelId(model)
  let loaded: Promise<{ model: ImageModelObject, pinned: boolean }> | undefined
  const load = () => (loaded ??= typeof model === 'string'
    ? baseImageModel(model, options.region, options.routes, runtimeEnv())
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
        calls.push({ model: id, state: 'refused', usage: { model: id, input: 0, output: 0 }, error })
        throw error
      }
      const pin = base.pinned ? options.region : undefined
      const signal = callOptions.abortSignal ?? options.signal
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
        })
        return result
      }
      catch (error) {
        calls.push({ model: id, state: 'refused', usage: { model: id, input: 0, output: 0 }, error })
        throw error
      }
    },
  }
}
