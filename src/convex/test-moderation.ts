import type { ProviderRequest } from './integrations/ai/moderation-providers.js'
import { TEST_MODERATION_PROVIDERS } from './integrations/ai/moderation-providers.js'

// The moderation providers' fakes `nuxt-backend/test` installs: each answers
// as its provider would, shaped like the provider's own response, so a test
// runs the adapter's mapping and the app's policy with no network and no
// key. What the content holds decides the answer, the same way every time:
//
// - `[[unsafe:<category>]]` in the text, or anywhere in an image's bytes,
//   finds that shared category at full strength (`sexual`, `suggestive`,
//   `violence`, `self_harm`, `hate`, `weapons`, `drugs`, `minors_sexual`);
// - `[[faint:<category>]]` finds it faintly: Azure's lowest severity above
//   none, OpenAI's score of 0.3, a score a threshold may sit just above;
// - `[[known-abuse]]` in an image's bytes matches the known-abuse list.
//
// A category a provider cannot judge stays unjudged, as the real one leaves
// it: OpenAI reads no `sexual/minors` in an image.

/**
 * The marker that finds a category at full strength.
 *
 * @experimental
 */
export const TEST_UNSAFE = (category: string): string => `[[unsafe:${category}]]`
/**
 * The marker that finds a category faintly, just under its threshold.
 *
 * @experimental
 */
export const TEST_FAINT = (category: string): string => `[[faint:${category}]]`
/**
 * The marker the known-abuse fake matches.
 *
 * @experimental
 */
export const TEST_KNOWN_ABUSE = '[[known-abuse]]'

/** What a marker in some content asks for: the categories found, at full strength or faintly. */
function markersIn(content: string): { full: Set<string>, faint: Set<string> } {
  const full = new Set([...content.matchAll(/\[\[unsafe:([a-z_]+)\]\]/g)].map(match => match[1]!))
  const faint = new Set([...content.matchAll(/\[\[faint:([a-z_]+)\]\]/g)].map(match => match[1]!))
  return { full, faint }
}

/** Bytes as text, so a marker inside an image is found. */
const latin1 = (bytes: Uint8Array): string => String.fromCharCode(...bytes)

/** An image a JSON request carries as base64 (Azure) or a data URL (OpenAI). */
const decoded = (base64: string): string => latin1(Uint8Array.from(atob(base64), char => char.charCodeAt(0)))

/** Azure's category for each shared one it judges. */
const AZURE: Readonly<Record<string, string>> = { sexual: 'Sexual', suggestive: 'Sexual', violence: 'Violence', self_harm: 'SelfHarm', hate: 'Hate' }

/** Azure AI Content Safety's answer: a severity per category, text on 0 to 7, images on 0, 2, 4 and 6. */
function azure(request: ProviderRequest) {
  const body = request.body as { text?: string, image?: { content: string } }
  const image = body.image !== undefined
  const { full, faint } = markersIn(image ? decoded(body.image!.content) : body.text ?? '')
  const top = image ? 6 : 7
  const severity = (name: string) => {
    const shared = Object.entries(AZURE).filter(([, azure]) => azure === name).map(([shared]) => shared)
    if (shared.some(category => full.has(category) && category !== 'suggestive')) return top
    if (name === 'Sexual' && full.has('suggestive')) return 2
    return shared.some(category => faint.has(category)) ? 2 : 0
  }
  return { categoriesAnalysis: ['Hate', 'SelfHarm', 'Sexual', 'Violence'].map(category => ({ category, severity: severity(category) })) }
}

/** OpenAI's categories for each shared one, as its moderations endpoint names them. */
const OPENAI: Readonly<Record<string, string>> = { sexual: 'sexual', minors_sexual: 'sexual/minors', violence: 'violence', self_harm: 'self-harm', hate: 'hate', weapons: 'illicit/violent', drugs: 'illicit' }

/** The categories OpenAI reads in an image; the rest it reads in text alone. */
const OPENAI_IMAGE = new Set(['sexual', 'violence', 'violence/graphic', 'self-harm', 'self-harm/intent', 'self-harm/instructions'])

/** OpenAI's moderation answer: a score per category, and the input types each applied to. */
function openai(request: ProviderRequest) {
  const input = (request.body as { input: string | Array<{ image_url: { url: string } }> }).input
  const image = typeof input !== 'string'
  const content = image ? decoded(input[0]!.image_url.url.split(',')[1] ?? '') : input
  const { full, faint } = markersIn(content)
  const names = ['sexual', 'sexual/minors', 'violence', 'violence/graphic', 'self-harm', 'self-harm/intent', 'self-harm/instructions', 'hate', 'hate/threatening', 'harassment', 'illicit', 'illicit/violent']
  const applies = (name: string) => !image || OPENAI_IMAGE.has(name)
  const score = (name: string) => {
    if (!applies(name)) return 0
    const shared = Object.entries(OPENAI).find(([, openai]) => openai === name)?.[0]
    if (shared && full.has(shared)) return 0.98
    return shared && faint.has(shared) ? 0.3 : 0.001
  }
  const scores = Object.fromEntries(names.map(name => [name, score(name)]))
  return {
    results: [{
      flagged: Object.values(scores).some(value => value > 0.5),
      categories: Object.fromEntries(names.map(name => [name, scores[name]! > 0.5])),
      category_scores: scores,
      category_applied_input_types: Object.fromEntries(names.map(name => [name, applies(name) ? [image ? 'image' : 'text'] : []])),
    }],
  }
}

/** Project Arachnid Shield's answer: a known match, or none. */
function arachnid(request: ProviderRequest) {
  const matched = latin1(request.body as Uint8Array).includes(TEST_KNOWN_ABUSE)
  return { classification: matched ? 'csam' : 'no-known-match', sha256_hex: '0'.repeat(64), match_type: matched ? 'exact' : null }
}

const FAKES: Readonly<Record<string, (request: ProviderRequest) => unknown>> = {
  'azure-content-safety': azure,
  'openai-moderation': openai,
  'arachnid-shield': arachnid,
}

/** Answer as the provider would, or refuse a provider with no fake as the real one would refuse a call that cannot reach it. */
export function testModerationProvider(provider: string, request: ProviderRequest): unknown {
  const fake = FAKES[provider]
  if (!fake) throw new Error(`[nuxt-backend/test] No fake answers the moderation provider ${provider}.`)
  return fake(request)
}

/** Answer every moderation provider with its fake, as `defineBackendTestApp` does. */
export function installTestModerationProviders(): void {
  ;(globalThis as Record<symbol, unknown>)[TEST_MODERATION_PROVIDERS] = testModerationProvider
}
