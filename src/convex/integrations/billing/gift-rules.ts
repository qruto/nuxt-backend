import { backendError } from '../../errors.js'
import { LINK, plainName, readable } from '../../email-helpers.js'

// The text rules of a gift (its sender's name, its message) and its dates:
// pure, so the gift flow and its manage actions read the same rules.

/** How many days ahead a gift may be dated. */
export const DELIVER_AHEAD_DAYS = 366
/** A date this close to now (or past) is no date: the gift is delivered at once. */
const IMMEDIATE_MS = 60 * 1000

/** The longest sender name a gift email shows. */
const SENDER_NAME_LENGTH = 40
/** The longest message a purchaser may write; it shows only inside the app. */
export const MESSAGE_LENGTH = 500
/**
 * The sender's name as the gift email shows it: at most 40 characters, with
 * every link and bare domain taken out. A name is the purchaser's own text,
 * and an email from the app's domain must not carry a link someone typed.
 */
export function giftSenderName(name: string | undefined): string | undefined {
  return plainName(name, SENDER_NAME_LENGTH)
}

/** The purchaser's message, trimmed: plain text of at most 500 characters, refused with a link in it. */
export function giftMessage(message: string | undefined): string | undefined {
  const trimmed = message?.trim()
  if (!trimmed) return undefined
  // `search` ignores the shared expression's global position, where `test` would keep it.
  if (trimmed.length > MESSAGE_LENGTH || readable(trimmed).search(LINK) !== -1) {
    throw backendError('invalid_input', { field: 'message' }, `[nuxt-backend] a gift message is plain text of at most ${MESSAGE_LENGTH} characters, with no links.`)
  }
  return trimmed
}

/**
 * The delivery date a purchaser chose, as the epoch ms to store: `undefined`
 * for none (or one so near it is now), else a date at most a year ahead.
 * Anything else is `invalid_input` on `deliverAt`.
 */
export function giftDeliverAt(deliverAt: number | undefined, now = Date.now()): number | undefined {
  if (deliverAt === undefined) return undefined
  if (!Number.isFinite(deliverAt)) throw backendError('invalid_input', { field: 'deliverAt' }, '[nuxt-backend] a gift delivery date is a point in time (epoch milliseconds).')
  if (deliverAt <= now + IMMEDIATE_MS) return undefined
  if (deliverAt > now + DELIVER_AHEAD_DAYS * 24 * 60 * 60 * 1000) {
    throw backendError('invalid_input', { field: 'deliverAt' }, `[nuxt-backend] a gift can be dated at most ${DELIVER_AHEAD_DAYS} days ahead.`)
  }
  return Math.floor(deliverAt)
}
