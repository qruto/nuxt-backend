import { afterEach, describe, expect, it, vi } from 'vitest'
import { getBackendError } from '../../src/convex/errors'
import { arachnidShield, azureContentSafety, azureReading, imageSize, openAiReading, TEST_MODERATION_PROVIDERS } from '../../src/convex/integrations/ai/moderation-providers'
import { classifierReading, combineReadings, DEFAULT_THRESHOLDS, flaggedCategories, inGrayBand, requireThresholds, thresholdsFor } from '../../src/convex/integrations/ai/moderation-taxonomy'

// The providers' answers in the shared categories: each scale normalised to
// 0–1, and a category a provider cannot judge kept apart from one it judged
// safe, so a blind spot never reads as a pass.

describe('Azure AI Content Safety\'s severities', () => {
  it('reads an image\'s 0, 2, 4, 6 as sixths and text\'s 0 to 7 as sevenths, sexual from 4 and suggestive below it', () => {
    const image = azureReading([{ category: 'Sexual', severity: 6 }, { category: 'Violence', severity: 2 }, { category: 'Hate', severity: 0 }, { category: 'SelfHarm', severity: 0 }], 'image')
    expect(image.scores.sexual).toEqual({ score: 1, supported: true })
    expect(image.scores.suggestive).toEqual({ score: 0, supported: true })
    expect(image.scores.violence?.score).toBeCloseTo(2 / 6)
    expect(image.codes).toEqual(['Sexual:6', 'Violence:2'])
    const text = azureReading([{ category: 'Sexual', severity: 3 }], 'text')
    expect(text.scores.sexual).toEqual({ score: 0, supported: true })
    expect(text.scores.suggestive?.score).toBeCloseTo(3 / 7)
  })

  it('never judges minors, weapons or drugs: it is no check for abuse material', () => {
    const reading = azureReading([], 'image')
    for (const category of ['minors_sexual', 'weapons', 'drugs'] as const) expect(reading.scores[category]).toEqual({ score: 0, supported: false })
  })

  it('names the stage when it refuses an image too large, as a model\'s output must be downscaled first', async () => {
    // A PNG header declaring 8000 px a side, past Azure's 7200.
    const wide = new Uint8Array(24)
    wide.set([0x89, 0x50, 0x4E, 0x47])
    new DataView(wide.buffer).setUint32(16, 8000)
    new DataView(wide.buffer).setUint32(20, 100)
    await expect(azureContentSafety({ region: 'francecentral' }).check({ images: [{ bytes: wide, mediaType: 'image/png' }], stage: 'output' }, {})).rejects.toThrow(/checked at output is too large.*Downscale what the model made/)
  })

  it('takes the region the resource runs in, for the record and doctor', () => {
    expect(() => azureContentSafety({} as never)).toThrow(/name the `region`/)
    expect(azureContentSafety({ region: ' francecentral ' }).region).toBe('francecentral')
  })
})

describe('OpenAI\'s moderation scores', () => {
  it('judges a category only for the input types it applied to: an image\'s sexual/minors is unjudged, never safe', () => {
    const result = {
      categories: { 'sexual': true, 'sexual/minors': false },
      category_scores: { 'sexual': 0.9, 'sexual/minors': 0, 'violence': 0.1, 'hate': 0 },
      category_applied_input_types: { 'sexual': ['image'], 'sexual/minors': [], 'violence': ['image'], 'hate': [] },
    }
    const reading = openAiReading(result, 'image')
    expect(reading.scores.sexual).toEqual({ score: 0.9, supported: true })
    expect(reading.scores.minors_sexual).toEqual({ score: 0, supported: false })
    expect(reading.scores.hate).toEqual({ score: 0, supported: false })
    expect(reading.codes).toEqual(['sexual'])
  })

  it('judges every category in text when the answer names no input types', () => {
    expect(openAiReading({ category_scores: { 'sexual/minors': 0.4 } }, 'text').scores.minors_sexual).toEqual({ score: 0.4, supported: true })
  })
})

describe('combining readings', () => {
  it('takes the highest score among the providers that could judge a category, and keeps one no provider could judge unjudged', () => {
    const azure = azureReading([{ category: 'Sexual', severity: 4 }], 'image')
    const openai = openAiReading({ category_scores: { sexual: 0.2 }, category_applied_input_types: { sexual: ['image'] } }, 'image')
    const combined = combineReadings([azure, openai])
    expect(combined.sexual?.score).toBeCloseTo(4 / 6)
    expect(combined.minors_sexual).toEqual({ score: 0, supported: false })
  })

  it('reads Llama Guard\'s codes as full scores in the categories they name', () => {
    const reading = classifierReading('meta-llama/llama-guard-4-12b', ['S12', 'S7'])
    expect(reading.scores.sexual).toEqual({ score: 1, supported: true })
    expect(reading.scores.violence).toEqual({ score: 0, supported: true })
    expect(reading.codes).toEqual(['S12', 'S7'])
  })

  it('flags a category at its threshold, and finds the gray band just under one', () => {
    const thresholds = thresholdsFor(undefined, 'upload')
    expect(flaggedCategories({ sexual: { score: 0.3, supported: true }, suggestive: { score: 0.5, supported: true } }, thresholds)).toEqual(['sexual'])
    expect(flaggedCategories({ sexual: { score: 0.9, supported: false } }, thresholds)).toEqual([])
    expect(inGrayBand({ violence: { score: 0.4, supported: true } }, thresholds)).toBe(true)
    expect(inGrayBand({ violence: { score: 0.2, supported: true } }, thresholds)).toBe(false)
  })
})

describe('thresholds', () => {
  it('suit an app that takes no sexual content, and take any sexual signal on a prompt or an output by default', () => {
    expect(DEFAULT_THRESHOLDS).toMatchObject({ sexual: 0.3, minors_sexual: 0.05, suggestive: 0.7 })
    expect(thresholdsFor({ sexual: 0.6 }, 'upload')).toMatchObject({ sexual: 0.6, suggestive: 0.7 })
    expect(thresholdsFor(undefined, 'output')).toMatchObject({ sexual: 0.05, suggestive: 0.05, minors_sexual: 0.05 })
  })

  it('let a threshold the app names win on a prompt or an output, but for minors_sexual, which stays at 0.05 at most', () => {
    // An app that takes swimwear and kisses in its generated comics raises suggestive.
    expect(thresholdsFor({ suggestive: 0.7, sexual: 0.6, minors_sexual: 0.5 }, 'output')).toMatchObject({ suggestive: 0.7, sexual: 0.6, minors_sexual: 0.05 })
    expect(thresholdsFor({ minors_sexual: 0.01 }, 'prompt')).toMatchObject({ minors_sexual: 0.01, sexual: 0.05 })
  })

  it('refuse a category they do not know or a score outside 0 to 1, where setupAi is called', () => {
    expect(() => requireThresholds({ nudity: 0.5 })).toThrow(/'nudity' is no category/)
    expect(() => requireThresholds({ sexual: 0 })).toThrow(/above 0 and at most 1/)
    expect(() => requireThresholds(['sexual'])).toThrow(/maps categories/)
    expect(() => requireThresholds({ sexual: 1 })).not.toThrow()
  })
})

describe('an image\'s size, from its header', () => {
  it('reads a PNG\'s and a JPEG\'s, and nothing of a format it does not read', () => {
    const png = new Uint8Array(24)
    png.set([0x89, 0x50, 0x4E, 0x47])
    new DataView(png.buffer).setUint32(16, 640)
    new DataView(png.buffer).setUint32(20, 480)
    expect(imageSize(png)).toEqual({ width: 640, height: 480 })
    // SOI, an APP0 segment to step over, then SOF0 with its height and width.
    const jpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x04, 0x00, 0x00, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x01, 0xE0, 0x02, 0x80, 0x03, 0x00, 0x00, 0x00, 0x00])
    expect(imageSize(jpeg)).toEqual({ width: 640, height: 480 })
    expect(imageSize(new TextEncoder().encode('GIF89a'))).toBeNull()
  })
})

const IMAGE = { bytes: new Uint8Array([0x89, 0x50, 0x4E, 0x47]), mediaType: 'image/png' }
const KEY = { KNOWN_ABUSE_KEY: 'org:secret' }
const fakes = globalThis as Record<symbol, unknown>

/** What a check threw, as the backend's refusal reads it. */
async function refusalOf(check: Promise<unknown>) {
  const error = await check.then(() => null, (thrown: unknown) => thrown)
  return getBackendError(error)
}

describe('Project Arachnid Shield', () => {
  afterEach(() => {
    Reflect.deleteProperty(fakes, TEST_MODERATION_PROVIDERS)
  })

  it('clears an image on an explicit no-match only, and matches csam and harmful-abusive-material', async () => {
    for (const [classification, result] of [['no-known-match', { matched: false }], ['csam', { matched: true, code: 'csam' }], ['harmful-abusive-material', { matched: true, code: 'harmful-abusive-material' }]] as const) {
      fakes[TEST_MODERATION_PROVIDERS] = () => ({ classification })
      expect(await arachnidShield().match(IMAGE, KEY)).toEqual(result)
    }
  })

  it('refuses the content as unchecked on a missing or unknown classification, never as clear', async () => {
    for (const answer of [{}, { classification: 'maybe' }, { data: { classification: 'no-known-match' } }, null]) {
      fakes[TEST_MODERATION_PROVIDERS] = () => answer
      expect(await refusalOf(arachnidShield().match(IMAGE, KEY))).toMatchObject({ code: 'unavailable', data: { reason: 'provider_refused' } })
    }
  })
})

describe('a provider that fails', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('refuses the content as unchecked on a timeout, a network error or a body that is not JSON', async () => {
    const failures = [
      () => Promise.reject(new DOMException('The operation timed out.', 'TimeoutError')),
      () => Promise.reject(new TypeError('fetch failed')),
      () => Promise.resolve(new Response('<html>Bad gateway</html>', { status: 200 })),
    ]
    for (const [at, failure] of failures.entries()) {
      vi.stubGlobal('fetch', vi.fn(failure))
      const refused = await refusalOf(arachnidShield().match(IMAGE, KEY))
      expect(refused).toMatchObject({ code: 'unavailable', data: { reason: 'provider_refused' } })
      if (at === 0) await expect(arachnidShield().match(IMAGE, KEY)).rejects.toThrow(/did not answer within 30 s/)
    }
  })
})
