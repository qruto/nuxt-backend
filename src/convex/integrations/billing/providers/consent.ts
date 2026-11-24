import { sha256Hex } from './http.js'

// The EU consent that lets digital content (a comic issue, an e-book, a
// credit pack) be delivered at once without a 14-day withdrawal window. Under
// the Consumer Rights Directive (2011/83/EU, as amended by 2019/2161), the
// right of withdrawal ends when delivery starts only if the buyer
//
//  1. gave prior express consent to delivery starting within the window,
//  2. acknowledged that they lose the right of withdrawal by it, and
//  3. got a confirmation of the contract on a durable medium that records
//     both (Art. 16(m) with Art. 8(7)).
//
// Without all three the buyer may withdraw within 14 days and owes nothing
// for what they already read (Art. 14(4)(b)). The app asks for (1) and (2)
// with an unticked checkbox beside the buy button, and the checkout carries
// the proof in the order's metadata, where it stays with the provider's
// record of the sale. (3) is the merchant of record's receipt plus the app's
// own order confirmation email (see the docs' "Sell digital content in the
// EU" page). Not legal advice.

/**
 * The version of the wording below: bump it whenever the text changes, so a record names what was shown.
 *
 * @experimental
 */
export const DIGITAL_CONTENT_CONSENT_VERSION = '2026-11-24'

/**
 * The checkbox's text, in English. Translate it with the app's labels; the record keeps the hash of what was shown.
 *
 * @experimental
 */
export const DIGITAL_CONTENT_CONSENT_TEXT
  = 'I want access to start right away, and I understand that I lose my right to withdraw from this purchase once it starts.'

/** The metadata keys the proof travels under: short, as every provider caps key length. */
export const CONSENT_METADATA_KEYS = {
  at: 'dc_consent_at',
  version: 'dc_consent_v',
  text: 'dc_consent_text',
} as const

/** What the buyer agreed to, as a checkout records it. */
export interface DigitalContentConsent {
  /** When they ticked it, in Unix milliseconds. */
  at: number
  version: string
  /** The SHA-256 hex of the exact text shown, in the language shown. */
  textHash: string
}

/**
 * The proof for a checkout of digital content, from what the page sent: it
 * refuses unless `accepted` is the literal `true` (a pre-ticked box or a
 * missing field is no consent), and hashes the text the page showed.
 *
 * @experimental
 */
export async function recordDigitalContentConsent(input: { accepted: unknown, text?: string, version?: string, now?: number }): Promise<DigitalContentConsent> {
  if (input.accepted !== true) {
    throw new Error('[nuxt-backend] This purchase starts delivery at once: the buyer must tick the consent to immediate access and the loss of the withdrawal right first.')
  }
  return {
    at: input.now ?? Date.now(),
    version: input.version ?? DIGITAL_CONTENT_CONSENT_VERSION,
    textHash: await sha256Hex(input.text ?? DIGITAL_CONTENT_CONSENT_TEXT),
  }
}

/**
 * The proof as checkout metadata.
 *
 * @experimental
 */
export function consentMetadata(consent: DigitalContentConsent): Record<string, string> {
  return {
    [CONSENT_METADATA_KEYS.at]: new Date(consent.at).toISOString(),
    [CONSENT_METADATA_KEYS.version]: consent.version,
    [CONSENT_METADATA_KEYS.text]: consent.textHash.slice(0, 64),
  }
}

/**
 * The proof an order's metadata carries back in a webhook, or `null` when the checkout had none.
 *
 * @experimental
 */
export function consentFromMetadata(metadata: Readonly<Record<string, string>>): DigitalContentConsent | null {
  const at = Date.parse(metadata[CONSENT_METADATA_KEYS.at] ?? '')
  const version = metadata[CONSENT_METADATA_KEYS.version]
  const textHash = metadata[CONSENT_METADATA_KEYS.text]
  if (Number.isNaN(at) || !version || !textHash) return null
  return { at, version, textHash }
}
