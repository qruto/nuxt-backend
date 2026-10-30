import { backendError } from '../../errors.js'

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
 * A link, or a bare domain with a top-level domain people link with: what
 * neither the sender name nor the message may carry. A dot alone is no link,
 * so a name like "St.John" or "J. R. R. Tolkien" stays as it is.
 */
const LINK = /(?:[a-z][\w+.-]*:\/\/|www\.)\S*|\b[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|io|co|app|dev|ai|me|info|biz|xyz|online|site|store|shop|link|click|top|club|live|pro|tech|cloud|page|ly|gg|tv|uk|de|ru|fr|us|ca|au|in|cn|jp|nl|br|es|it|pl|ch|se|eu|cc)(?![\w-])(?:\/\S*)?/gi
/** The ideographic full stops a domain can hide behind. */
const IDEOGRAPHIC_STOP = /[\u3002\uFF61]/g
/** Format characters (zero-width joiners and the like) that split a domain to slip it past a check. */
const FORMAT_CHARACTERS = /\p{Cf}/gu

/** Text as a reader sees it: compatibility forms folded, full-width and ideographic dots made dots, invisible characters gone. */
function readable(text: string): string {
  return text.normalize('NFKC').replace(IDEOGRAPHIC_STOP, '.').replace(FORMAT_CHARACTERS, '')
}

/**
 * The sender's name as the gift email shows it: at most 40 characters, with
 * every link and bare domain taken out. A name is the purchaser's own text,
 * and an email from the app's domain must not carry a link someone typed.
 */
export function giftSenderName(name: string | undefined): string | undefined {
  if (name === undefined) return undefined
  const plain = readable(name).replace(LINK, ' ').replace(/\s+/g, ' ').trim().slice(0, SENDER_NAME_LENGTH).trim()
  return plain || undefined
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
