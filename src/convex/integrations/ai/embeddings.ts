import type { EmbeddingModel } from 'ai'
import type { InferenceRegion } from './config.js'
import {
  checkRegion,
  convexGatewayModel,
  convexGatewayPossible,
  GATEWAY_KEY_ENV,
  gatewayFor,
  loadSdk,
  type ModelCall,
  modelRefusal,
  noticeConvexGateway,
  pinProviderOptions,
  reportedUsd,
  requireModelId,
  TEST_EMBEDDING_MODELS,
} from './models.js'

// Where an embedding model goes (`ai.knowledge`): the same route as a
// language model's id. The Convex AI Gateway first, on a deployment that can
// have it and when no region is pinned, then the Vercel AI Gateway with
// `AI_GATEWAY_API_KEY`, then the mock `nuxt-backend/test` installs, else a
// refusal. A model object of your own is called as it is.

/** An embedding model: a `provider/model` id from the gateway's list, or an AI SDK embedding model object. */
export type AiEmbeddingModel = string | Exclude<EmbeddingModel, string>

type EmbeddingModelObject = Exclude<EmbeddingModel, string>

type Env = Readonly<Record<string, string | undefined>>

const runtimeEnv = (): Env => (typeof process === 'undefined' ? {} : process.env)

/** The id an embedding model is known by. */
export function embeddingModelId(model: AiEmbeddingModel): string {
  return typeof model === 'string' ? model : model.modelId
}

/** The mock a test installed for an embedding id, when one did. */
function testDouble(id: string, dimension = 1536): EmbeddingModelObject | undefined {
  const make = (globalThis as Record<symbol, unknown>)[TEST_EMBEDDING_MODELS]
  return typeof make === 'function' ? (make as (id: string, dimension: number) => EmbeddingModelObject)(id, dimension) : undefined
}

/** Whether a model id has a route here, before anything is called: what `send` and `add` check. */
export function embeddingReachable(model: AiEmbeddingModel, region: InferenceRegion | undefined, env: Env = runtimeEnv()): boolean {
  if (typeof model !== 'string') return true
  if (env[GATEWAY_KEY_ENV] || testDouble(model)) return true
  return region === undefined && convexGatewayPossible(env)
}

interface EmbeddingRouteOptions {
  region: InferenceRegion | undefined
  /** The store's vector length: what the test's mock answers with. */
  dimension: number | undefined
  env: Env
}

/** The model an id loads: the Convex AI Gateway's, the Vercel AI Gateway's, the test's, or a refusal. */
async function baseEmbeddingModel(id: string, { region, dimension, env }: EmbeddingRouteOptions): Promise<{ model: EmbeddingModelObject, pinned: boolean }> {
  const apiKey = env[GATEWAY_KEY_ENV]
  const fallback = async (unavailable?: string): Promise<{ model: EmbeddingModelObject, pinned: boolean }> => {
    if (apiKey) return { model: gatewayFor(await loadSdk(), apiKey).embeddingModel(id), pinned: true }
    const double = testDouble(id, dimension)
    if (double) return { model: double, pinned: true }
    throw modelRefusal({ id, ...(region ? { region } : {}) }, unavailable)
  }
  if (region !== undefined || !convexGatewayPossible(env)) return fallback()
  const convex = await convexGatewayModel(id, provider => provider.convexGateway.embeddingModel(id) as EmbeddingModelObject)
  if ('model' in convex) return { model: convex.model, pinned: false }
  noticeConvexGateway(id, convex.unavailable, apiKey ? 'the Vercel AI Gateway' : 'nothing, and is refused')
  return fallback(convex.unavailable)
}

/**
 * The embedding model a knowledge store calls, recording each call's cost
 * and tokens into `calls`, and pinned to `region` on the gateway's route.
 */
export async function meteredEmbeddingModel(model: AiEmbeddingModel, calls: ModelCall[], { region, dimension }: { region?: InferenceRegion, dimension?: number } = {}): Promise<EmbeddingModelObject> {
  const sdk = await loadSdk()
  const id = embeddingModelId(model)
  const { model: base, pinned } = typeof model === 'string' ? await baseEmbeddingModel(model, { region, dimension, env: runtimeEnv() }) : { model, pinned: false }
  const pin = pinned ? region : undefined
  return sdk.wrapEmbeddingModel({
    model: base as never,
    middleware: {
      specificationVersion: 'v4',
      ...(pin === undefined ? {} : { transformParams: async ({ params }) => ({ ...params, providerOptions: pinProviderOptions(params.providerOptions, pin) as typeof params.providerOptions }) }),
      wrapEmbed: async ({ doEmbed }) => {
        try {
          const result = await doEmbed()
          checkRegion(id, result.providerMetadata, pin)
          calls.push({ model: id, state: 'finished', usd: reportedUsd(result.providerMetadata), usage: { model: id, input: result.usage?.tokens ?? 0, output: 0 } })
          return result
        }
        catch (error) {
          calls.push({ model: id, state: 'refused', usage: { model: id, input: 0, output: 0 }, error })
          throw error
        }
      },
    },
  })
}

/** Refuse an embedding id that is no `provider/model` id where it is configured. */
export function requireEmbeddingModel(model: AiEmbeddingModel | undefined, where: string): asserts model is AiEmbeddingModel {
  if (model === undefined) throw new Error(`[nuxt-backend] ${where}: name the embedding \`model\`, such as 'openai/text-embedding-3-small'.`)
  if (typeof model === 'string') requireModelId(model as never, where)
}
