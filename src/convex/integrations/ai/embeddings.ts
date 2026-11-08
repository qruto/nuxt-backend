import type { EmbeddingModel } from 'ai'
import {
  checkRegion,
  type GatewayLoaders,
  loadRoute,
  loadSdk,
  type ModelCall,
  type ModelRoute,
  type ModelRouting,
  pinProviderOptions,
  reportedUsd,
  requireModelId,
  routeId,
  TEST_EMBEDDING_MODELS,
} from './models.js'

// Where an embedding model goes (`ai.knowledge`): the same route as a
// language model's id, through `setupAi({ gateway })`'s order (default: the
// Convex AI Gateway, then the Vercel AI Gateway with `AI_GATEWAY_API_KEY`),
// then the mock `nuxt-backend/test` installs, else a refusal. A model
// object of your own is called as it is.

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

/** Where an embedding id goes on this deployment: the language models' order, the test's mock last. */
function routeEmbedding(id: string, routing: ModelRouting, env: Env, dimension?: number): ModelRoute<EmbeddingModelObject> {
  return routeId(id, env, routing, model => testDouble(model, dimension))
}

/** Whether a model id has a route here, before anything is called: what `send` and `add` check. */
export function embeddingReachable(model: AiEmbeddingModel, routing: ModelRouting, env: Env = runtimeEnv()): boolean {
  return typeof model !== 'string' || routeEmbedding(model, routing, env).route !== 'missing'
}

/** How an embedding model loads from each gateway. */
const EMBEDDING_LOADERS: GatewayLoaders<EmbeddingModelObject> = {
  convex: (provider, id) => provider.convexGateway.embeddingModel(id) as EmbeddingModelObject,
  vercel: (gateway, id) => gateway.embeddingModel(id),
}

/**
 * The embedding model a knowledge store calls, recording each call's cost
 * and tokens into `calls`, and pinned to the routing's region on the
 * gateway's route.
 */
export async function meteredEmbeddingModel(model: AiEmbeddingModel, calls: ModelCall[], { routing, dimension }: { routing: ModelRouting, dimension?: number }): Promise<EmbeddingModelObject> {
  const sdk = await loadSdk()
  const id = embeddingModelId(model)
  const { model: base, pinned } = typeof model === 'string' ? await loadRoute(routeEmbedding(model, routing, runtimeEnv(), dimension), EMBEDDING_LOADERS) : { model, pinned: false }
  const pin = pinned ? routing.region : undefined
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
