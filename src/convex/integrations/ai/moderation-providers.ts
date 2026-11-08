import { backendError } from '../../errors.js'
import { type CategoryScore, combineReadings, type ModerationCategory, type ProviderReading } from './moderation-taxonomy.js'

// The moderation providers `setupAi({ moderation })` takes beside its text
// classifier: an image checker (`images`), a second opinion asked only in a
// gray band (`secondOpinion`), and a known-abuse hash match run on every
// image before anything else sees it (`knownAbuse`). Each is a small
// adapter over the provider's own API, called with the app's own account:
// its key is the deployment's, named after what it does, never the
// provider's. Each maps its answer onto the shared categories
// (moderation-taxonomy.ts), saying where it cannot judge one.
//
// `nuxt-backend/test` installs a deterministic fake of every provider
// (test-moderation.ts): no call leaves a test.

/** An image a provider reads: its bytes and media type, read once from storage. */
export interface ModerationImage {
  bytes: Uint8Array
  mediaType: string
}

/** What a provider is asked to read. */
export interface ProviderInput {
  text?: string
  images: ModerationImage[]
}

/** The deployment's env, as a provider reads its keys: `process.env` on a deployment. */
export type ProviderEnv = Readonly<Record<string, string | undefined>>

type Env = ProviderEnv

/** A provider that scores content in the shared categories. */
export interface ModerationProvider {
  readonly kind: 'classifier'
  /** Its id, as a decision records it. */
  readonly id: string
  /** What it reads. */
  readonly reads: readonly ('text' | 'image')[]
  /** The deployment env names it needs: what doctor checks. */
  readonly env: readonly string[]
  /** Where it processes content, as the app declares it: named in the record and checked by doctor. */
  readonly region?: string
  /** Read the content, or refuse `unavailable` when the provider cannot. */
  check: (input: ProviderInput, env: ProviderEnv) => Promise<ProviderReading>
}

/** A known-abuse hash match: whether an image is on a list of known abuse material. */
export interface KnownAbuseProvider {
  readonly kind: 'known-abuse'
  readonly id: string
  readonly env: readonly string[]
  readonly region?: string
  /** Match one image's bytes against the list: its hash, kept as evidence, and whether it matched. */
  match: (image: ModerationImage, env: ProviderEnv) => Promise<{ matched: boolean, code?: string }>
}

/**
 * Where `nuxt-backend/test` leaves its fake of every provider: a function
 * from a provider id and its request to the provider's answer, as JSON. A
 * deployment never sets it.
 */
export const TEST_MODERATION_PROVIDERS = Symbol.for('nuxt-backend.testModerationProviders')

/** A provider's request, as an adapter sends it and the test kit's fake reads it. */
export interface ProviderRequest {
  url: string
  headers: Record<string, string>
  /** JSON, or the image's bytes for a provider that takes them raw. */
  body: unknown
}

/** Send a request to a provider, or to the fake `nuxt-backend/test` installed. Refuses the provider's error as `unavailable`. */
async function send(provider: string, request: ProviderRequest): Promise<unknown> {
  const fake = (globalThis as Record<symbol, unknown>)[TEST_MODERATION_PROVIDERS]
  if (typeof fake === 'function') return (fake as (provider: string, request: ProviderRequest) => unknown)(provider, request)
  const raw = request.body instanceof Uint8Array
  // fallow-ignore-next-line security-sink -- the URL is an adapter's literal, or Azure's built from CONTENT_SAFETY_ENDPOINT, which only the deployment's owner sets; no request input reaches it; verified 2026-11-08
  const response = await fetch(request.url, {
    method: 'POST',
    headers: { ...(raw ? {} : { 'content-type': 'application/json' }), ...request.headers },
    body: raw ? request.body as BodyInit : JSON.stringify(request.body),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw backendError('unavailable', { service: 'ai', reason: 'provider_refused' }, `[nuxt-backend] The moderation provider ${provider} answered ${response.status}: the content is refused as unchecked.`)
  }
  return await response.json()
}

/** How long a check waits for a provider: past it, the content is refused as unchecked. */
const PROVIDER_TIMEOUT_MS = 30_000

/** An env name the provider needs, or the refusal that says to set it. */
function envOf(env: Env, name: string, provider: string): string {
  const value = env[name]?.trim()
  if (!value) throw backendError('unavailable', { service: 'ai', reason: 'not_configured' }, `[nuxt-backend] The moderation provider ${provider} needs ${name} on this deployment: add it to .env.local and run \`npx nuxt-backend env push\`.`)
  return value
}

/** Base64 of bytes, as a provider takes an image in JSON. */
function base64(bytes: Uint8Array): string {
  let binary = ''
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  return btoa(binary)
}

/** An image's width and height, read from its header: PNG and JPEG; `null` for a format it does not read. */
export function imageSize(bytes: Uint8Array): { width: number, height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50) return { width: view.getUint32(16), height: view.getUint32(20) }
  if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null
  let at = 2
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xFF) return null
    const marker = bytes[at + 1]!
    const length = view.getUint16(at + 2)
    // The start-of-frame markers carry the size; the others are stepped over.
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) return { height: view.getUint16(at + 5), width: view.getUint16(at + 7) }
    at += 2 + length
  }
  return null
}

/** A score from a severity on a scale, as the shared categories read it. */
const scaled = (severity: number, top: number): CategoryScore => ({ score: Math.min(1, Math.max(0, severity / top)), supported: true })

const UNSUPPORTED: CategoryScore = { score: 0, supported: false }

// ── Azure AI Content Safety ──────────────────────────────────────────────

/** The most an image Azure AI Content Safety reads may weigh, and its longest side. */
export const AZURE_IMAGE_LIMITS = { bytes: 4 * 1024 * 1024, side: 7200, minSide: 50 } as const

/** The Azure AI Content Safety API version the adapter speaks. */
const AZURE_API_VERSION = '2024-09-01'

/** Options of {@link azureContentSafety}. */
export interface AzureContentSafetyOptions {
  /**
   * The Azure region your Content Safety resource runs in, such as
   * `francecentral`: recorded with each decision, and checked by doctor
   * against an app that keeps its processing in the EU.
   */
  region: string
}

/** Refuse an image Azure AI Content Safety would refuse: too large, too long a side, or too small. */
function requireAzureImage(image: ModerationImage): void {
  const size = imageSize(image.bytes)
  const tooLarge = image.bytes.length > AZURE_IMAGE_LIMITS.bytes || (size !== null && Math.max(size.width, size.height) > AZURE_IMAGE_LIMITS.side)
  if (tooLarge) {
    throw backendError('invalid_input', { field: 'images', reason: 'too_large' }, `[nuxt-backend] The image is too large to check: Azure AI Content Safety reads up to 4 MB and ${AZURE_IMAGE_LIMITS.side} px a side. Downscale it before you check it.`)
  }
  if (size !== null && Math.min(size.width, size.height) < AZURE_IMAGE_LIMITS.minSide) {
    throw backendError('invalid_input', { field: 'images', reason: 'too_small' }, `[nuxt-backend] The image is too small to check: Azure AI Content Safety reads ${AZURE_IMAGE_LIMITS.minSide} px a side at least.`)
  }
}

/** Azure's severities as a reading: text on 0 to 7, images on 0, 2, 4 and 6. */
export function azureReading(analysis: ReadonlyArray<{ category: string, severity?: number }>, input: 'text' | 'image'): ProviderReading {
  const top = input === 'text' ? 7 : 6
  const severity = (name: string) => analysis.find(entry => entry.category === name)?.severity ?? 0
  const sexual = severity('Sexual')
  const scores: Partial<Record<ModerationCategory, CategoryScore>> = {
    // A sexual severity of 4 or more is sexual; 2 and 3 are suggestive.
    sexual: scaled(sexual >= 4 ? sexual : 0, top),
    suggestive: scaled(sexual >= 2 && sexual < 4 ? sexual : 0, top),
    violence: scaled(severity('Violence'), top),
    self_harm: scaled(severity('SelfHarm'), top),
    hate: scaled(severity('Hate'), top),
    // Azure has no category for these: it never judges them, and is never a check for known abuse.
    minors_sexual: UNSUPPORTED,
    weapons: UNSUPPORTED,
    drugs: UNSUPPORTED,
  }
  const codes = analysis.filter(entry => (entry.severity ?? 0) > 0).map(entry => `${entry.category}:${entry.severity}`)
  return { provider: 'azure-content-safety', scores, codes }
}

/**
 * Azure AI Content Safety, on your own Azure resource: text and images, in
 * the region you created it in (processing stays there, and inputs are
 * neither stored nor trained on). It scores Hate, Sexual, Violence and
 * SelfHarm, artwork included, and is no check for child sexual abuse
 * material: pair it with `knownAbuse`. Reads `CONTENT_SAFETY_ENDPOINT`
 * and `CONTENT_SAFETY_KEY`. An image over 4 MB or 7200 px a side is
 * refused `invalid_input` (reason `too_large`): downscale it first.
 */
export function azureContentSafety(options: AzureContentSafetyOptions): ModerationProvider {
  const id = 'azure-content-safety'
  if (typeof options?.region !== 'string' || !options.region.trim()) throw new TypeError('[nuxt-backend] azureContentSafety: name the `region` your Content Safety resource runs in, such as \'francecentral\'.')
  const call = async (env: Env, path: string, body: unknown) => {
    const endpoint = envOf(env, 'CONTENT_SAFETY_ENDPOINT', id).replace(/\/+$/, '')
    const key = envOf(env, 'CONTENT_SAFETY_KEY', id)
    return await send(id, { url: `${endpoint}/contentsafety/${path}?api-version=${AZURE_API_VERSION}`, headers: { 'Ocp-Apim-Subscription-Key': key }, body }) as { categoriesAnalysis?: Array<{ category: string, severity?: number }> }
  }
  return {
    kind: 'classifier',
    id,
    reads: ['text', 'image'],
    env: ['CONTENT_SAFETY_ENDPOINT', 'CONTENT_SAFETY_KEY'],
    region: options.region.trim(),
    check: async ({ text, images }, env) => {
      const readings: ProviderReading[] = []
      if (text) readings.push(azureReading((await call(env, 'text:analyze', { text, outputType: 'EightSeverityLevels' })).categoriesAnalysis ?? [], 'text'))
      for (const image of images) {
        requireAzureImage(image)
        readings.push(azureReading((await call(env, 'image:analyze', { image: { content: base64(image.bytes) }, outputType: 'FourSeverityLevels' })).categoriesAnalysis ?? [], 'image'))
      }
      return mergeReadings(id, readings)
    },
  }
}

/** Several readings of one provider (its text, each image) as one: the highest score per category. */
function mergeReadings(provider: string, readings: readonly ProviderReading[]): ProviderReading {
  return { provider, scores: combineReadings(readings), codes: [...new Set(readings.flatMap(reading => reading.codes))] }
}

// ── OpenAI moderation ────────────────────────────────────────────────────

/** The OpenAI moderation model the adapter asks. */
const OPENAI_MODERATION_MODEL = 'omni-moderation-latest'

/** OpenAI's answer for one input, as the moderations endpoint returns it. */
interface OpenAiResult {
  categories?: Record<string, boolean>
  category_scores?: Record<string, number>
  category_applied_input_types?: Record<string, string[]>
}

/** Where OpenAI's categories land in the shared ones. */
const OPENAI_CATEGORIES: ReadonlyArray<[ModerationCategory, readonly string[]]> = [
  ['sexual', ['sexual']],
  ['minors_sexual', ['sexual/minors']],
  ['violence', ['violence', 'violence/graphic']],
  ['self_harm', ['self-harm', 'self-harm/intent', 'self-harm/instructions']],
  ['hate', ['hate', 'hate/threatening']],
  ['weapons', ['illicit/violent']],
  ['drugs', ['illicit']],
]

/**
 * OpenAI's answer as a reading. A category is judged only for the input
 * types it applied to (`category_applied_input_types`): for an image,
 * OpenAI reads sexual, violence and self-harm alone, and answers 0 for the
 * rest, `sexual/minors` included, which reads as unjudged, never as safe.
 */
export function openAiReading(result: OpenAiResult, input: 'text' | 'image'): ProviderReading {
  const scores: Partial<Record<ModerationCategory, CategoryScore>> = {}
  const applied = result.category_applied_input_types
  for (const [category, names] of OPENAI_CATEGORIES) {
    const judged = names.filter(name => applied?.[name]?.includes(input) ?? input === 'text')
    scores[category] = judged.length === 0
      ? UNSUPPORTED
      : { score: Math.max(...judged.map(name => result.category_scores?.[name] ?? 0)), supported: true }
  }
  const codes = Object.entries(result.categories ?? {}).filter(([, found]) => found).map(([name]) => name)
  return { provider: 'openai-moderation', scores, codes }
}

/**
 * OpenAI's moderation endpoint (`omni-moderation-latest`), free with an
 * OpenAI API key: text and images. For images it scores sexual content,
 * violence and self-harm only. Its usual place is `secondOpinion`, asked
 * when another provider's score sits just under a threshold, never for
 * suspected abuse material. Reads `SECOND_OPINION_KEY`.
 */
export function openaiModeration(): ModerationProvider {
  const id = 'openai-moderation'
  const call = async (env: Env, input: unknown): Promise<OpenAiResult> => {
    const key = envOf(env, 'SECOND_OPINION_KEY', id)
    const answer = await send(id, { url: 'https://api.openai.com/v1/moderations', headers: { authorization: `Bearer ${key}` }, body: { model: OPENAI_MODERATION_MODEL, input } }) as { results?: OpenAiResult[] }
    return answer.results?.[0] ?? {}
  }
  return {
    kind: 'classifier',
    id,
    reads: ['text', 'image'],
    env: ['SECOND_OPINION_KEY'],
    check: async ({ text, images }, env) => {
      const readings: ProviderReading[] = []
      if (text) readings.push(openAiReading(await call(env, text), 'text'))
      for (const image of images) {
        readings.push(openAiReading(await call(env, [{ type: 'image_url', image_url: { url: `data:${image.mediaType};base64,${base64(image.bytes)}` } }]), 'image'))
      }
      return mergeReadings(id, readings)
    },
  }
}

// ── Project Arachnid Shield ──────────────────────────────────────────────

/**
 * Project Arachnid Shield (the Canadian Centre for Child Protection): a
 * match of an image's hashes against known child sexual abuse material,
 * free once your organization is vetted. Run as `knownAbuse`, on every
 * image before any other provider sees it. A match blocks the content,
 * sends the image nowhere else, escalates it with the CSAM playbook, and
 * keeps the image's SHA-256 as evidence, never the image. Reads
 * `KNOWN_ABUSE_KEY`, as `username:password`.
 *
 * Built against Shield's published API: `POST /v1/media/` with the raw
 * bytes and basic auth, answering a `classification` of `no-known-match`,
 * `csam` or `harmful-abusive-material`. Not yet checked against a live
 * account.
 */
export function arachnidShield(): KnownAbuseProvider {
  const id = 'arachnid-shield'
  return {
    kind: 'known-abuse',
    id,
    env: ['KNOWN_ABUSE_KEY'],
    match: async (image, env) => {
      const credentials = envOf(env, 'KNOWN_ABUSE_KEY', id)
      const answer = await send(id, {
        url: 'https://shield.projectarachnid.com/v1/media/',
        headers: { 'authorization': `Basic ${btoa(credentials)}`, 'content-type': image.mediaType },
        body: image.bytes,
      }) as { classification?: string }
      const classification = answer.classification ?? 'no-known-match'
      if (classification === 'no-known-match') return { matched: false }
      return { matched: true, code: classification }
    },
  }
}

// ── Planned providers: the config shape is fixed; each adapter comes later ──

/** A provider whose adapter is planned: named in config now, refused when a check calls it. */
function planned(id: string, env: readonly string[]): ModerationProvider {
  return {
    kind: 'classifier',
    id,
    reads: ['image'],
    env,
    check: async () => {
      throw backendError('unavailable', { service: 'ai', reason: 'not_configured' }, `[nuxt-backend] The moderation provider ${id} is planned, not built yet: use azureContentSafety() or openaiModeration() for images.`)
    },
  }
}

/** Hive (Deploy since 26 Oct 2026; an annual contract). Planned. */
export const hive = (): ModerationProvider => planned('hive', ['IMAGE_CHECK_KEY'])
/** Microsoft PhotoDNA, a known-abuse hash match. Planned. */
export const photodna = (): ModerationProvider => planned('photodna', ['KNOWN_ABUSE_KEY'])
/** Google Cloud's content safety (Vision SafeSearch). Planned. */
export const googleContentSafety = (): ModerationProvider => planned('google-content-safety', ['IMAGE_CHECK_KEY'])
/** Amazon Rekognition's content moderation. Planned. */
export const rekognition = (): ModerationProvider => planned('rekognition', ['IMAGE_CHECK_KEY'])
/** Sightengine. Planned. */
export const sightengine = (): ModerationProvider => planned('sightengine', ['IMAGE_CHECK_KEY'])
