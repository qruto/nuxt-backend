import type { MeteredModel } from './integrations/ai/config.js'
import { TEST_EMBEDDING_MODELS, TEST_MODELS } from './integrations/ai/models.js'

// The model every `provider/model` id gets under `nuxt-backend/test`: a mock
// from the AI SDK's own test entry (`ai/test`) that repeats the prompt and
// reports a fixed cost in the shape the AI Gateway reports it, so a test of a
// metered action settles through the path a live call does, with no key and
// no network. A safety classifier's id (Llama Guard, a safeguard model) gets
// a classifier instead, so `ai.requireSafe` passes or refuses on purpose, and
// an image model's id (`google/gemini-2.5-flash-image`, `openai/gpt-image-1`)
// answers with a PNG beside the text, so a step that stores the image runs.
// Development and production never load it: it is installed by
// `defineBackendTestApp` and by nothing else.

/** What a call through the mock costs, in US dollars. */
export const TEST_MODEL_USD = 0.001

/** The AI SDK and its test entry, when they are installed: an app that never names a model has neither. */
const sdk = await Promise.all([import('ai'), import('ai/test')]).then(([ai, test]) => ({ simulateReadableStream: ai.simulateReadableStream, MockLanguageModelV4: test.MockLanguageModelV4, MockEmbeddingModelV4: test.MockEmbeddingModelV4 }), () => null)

/** The text of the last user message of a prompt: what the mock repeats. */
function lastUserText(prompt: Parameters<MeteredModel['doGenerate']>[0]['prompt']): string {
  const user = [...prompt].reverse().find(message => message.role === 'user')
  const content = user?.content as unknown
  if (typeof content === 'string') return content
  return Array.isArray(content) ? content.flatMap(part => part && typeof part === 'object' && 'text' in part ? [String(part.text)] : []).join(' ') : ''
}

/** What text carries for the mock safety classifier to flag it: `unsafe` and `S1`. Anything else is `safe`. */
export const TEST_UNSAFE_MARKER = '[[unsafe]]'

/** Whether an id names a safety classifier: Llama Guard, or a policy-following safeguard model. */
const isClassifier = (modelId: string): boolean => /llama-guard|safeguard/i.test(modelId)

/** Whether an id names a model that draws: its name says image (Gemini's and OpenAI's image models, Imagen), DALL·E or FLUX. */
const isImageModel = (modelId: string): boolean => /image|dall-e|flux/i.test(modelId)

/**
 * The picture the mock image model answers with: a valid 2×2 PNG, the same
 * bytes every time, so a test can store it, sniff its type and sign it.
 */
export const TEST_IMAGE_PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGN4Eq4nKy3GAMRAFgAZigNvRWdDygAAAABJRU5ErkJggg=='), char => char.charCodeAt(0))

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
}

/**
 * The mock for a model id: it answers with the prompt it was given, and a
 * fixed cost. A safety classifier's id answers as Llama Guard does: `safe`,
 * or `unsafe` and `S1` for text that carries {@link TEST_UNSAFE_MARKER}. An
 * image model's id adds {@link TEST_IMAGE_PNG} as a generated file.
 */
export function testModel(modelId: string): MeteredModel {
  if (!sdk) throw new Error('[nuxt-backend/test] A model call under test needs the AI SDK: install it with `pnpm add ai`.')
  const answer = isClassifier(modelId)
    ? (prompt: Parameters<MeteredModel['doGenerate']>[0]['prompt']) => lastUserText(prompt).includes(TEST_UNSAFE_MARKER) ? 'unsafe\nS1' : 'safe'
    : (prompt: Parameters<MeteredModel['doGenerate']>[0]['prompt']) => `Test reply to: ${lastUserText(prompt) || 'an empty prompt'}`
  const providerMetadata = { gateway: { cost: String(TEST_MODEL_USD) } }
  const finishReason = { unified: 'stop', raw: 'stop' } as const
  const files = isImageModel(modelId) ? [{ type: 'file' as const, mediaType: 'image/png', data: { type: 'data' as const, data: TEST_IMAGE_PNG } }] : []
  return new sdk.MockLanguageModelV4({
    provider: 'test',
    modelId,
    doGenerate: async ({ prompt }) => ({ content: [...files, { type: 'text', text: answer(prompt) }], finishReason, usage, providerMetadata, warnings: [] }),
    doStream: async ({ prompt }) => ({
      stream: sdk.simulateReadableStream({
        chunks: [
          { type: 'stream-start', warnings: [] },
          ...files,
          { type: 'text-start', id: 'text' },
          ...(answer(prompt).match(/\S+\s*/g) ?? []).map(delta => ({ type: 'text-delta' as const, id: 'text', delta })),
          { type: 'text-end', id: 'text' },
          { type: 'finish', finishReason, usage, providerMetadata },
        ],
        initialDelayInMs: null,
        chunkDelayInMs: null,
      }),
    }),
  }) as unknown as MeteredModel
}

/** What embedding one text through the mock costs, in US dollars. */
export const TEST_EMBEDDING_USD = 0.00001

/**
 * The same text's vector, every time: each word lands in a bucket by its
 * hash, so texts that share words point the same way and a test's search
 * finds the document it added. Unit length, as embedding models answer.
 */
export function testEmbedding(text: string, dimension: number): number[] {
  const vector = Array.from({ length: dimension }, () => 0)
  for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    let hash = 2166136261
    for (const char of word) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619)
    vector[(hash >>> 0) % dimension]! += 1
  }
  const length = Math.hypot(...vector)
  // A text with no words points one fixed way.
  if (length === 0) vector[0] = 1
  return length === 0 ? vector : vector.map(value => value / length)
}

/** The mock embedding model for an id: {@link testEmbedding}'s vectors, at the store's dimension, with a fixed cost. */
export function testEmbeddingModel(modelId: string, dimension = 1536) {
  if (!sdk) throw new Error('[nuxt-backend/test] An embedding under test needs the AI SDK: install it with `pnpm add ai`.')
  return new sdk.MockEmbeddingModelV4({
    provider: 'test',
    modelId,
    doEmbed: async ({ values }) => ({
      embeddings: values.map(value => testEmbedding(value, dimension)),
      usage: { tokens: values.reduce((sum, value) => sum + value.split(/\s+/).length, 0) },
      providerMetadata: { gateway: { cost: String(TEST_EMBEDDING_USD * values.length) } },
      warnings: [],
    }),
  })
}

/**
 * Answer every `provider/model` id with {@link testModel} where no key or
 * gateway does, in this process. Read through the global, so a copy of the
 * package a bundler loaded twice sees it too.
 */
export function installTestModels(): void {
  if (!sdk) return
  ;(globalThis as Record<symbol, unknown>)[TEST_MODELS] = testModel
  ;(globalThis as Record<symbol, unknown>)[TEST_EMBEDDING_MODELS] = testEmbeddingModel
}
