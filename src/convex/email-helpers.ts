import type { EmailBlock } from './email-blocks.js'
import type { EmailRenderContext, RequestOrigin } from './email-templates.js'

// What the packaged emails share beyond the blocks, public on
// `nuxt-backend/email` so an ejected email (src/convex/emails/) and an
// app's own read the same: where a request came from, the blocks of one
// link, and a name someone typed with its links taken out.

/** Whether a link can be a button: an absolute web or mail address. A deployment that knows no `SITE_URL` has only the path. */
const ABSOLUTE_LINK = /^(?:https?:\/\/|mailto:)/i

/**
 * The blocks of an email's one link: a button, then the link written out
 * for a mail app that shows no button (the `email.link.fallback` label). A
 * link that is not absolute, such as the bare path a deployment with no
 * `SITE_URL` builds, gets no button, only its text; an empty one gets
 * nothing.
 *
 * @example
 * ```ts
 * blocks: [{ paragraph: intro }, ...linkBlocks(context.link(url), t('email.invite.action'), context)]
 * ```
 */
export function linkBlocks(url: string, label: string, { t }: Pick<EmailRenderContext, 't'>): EmailBlock[] {
  const link = url.trim()
  if (!ABSOLUTE_LINK.test(link)) return link ? [{ note: link }] : []
  return [{ button: { label, url: link } }, { note: `${t('email.link.fallback')}\n${link}` }]
}

/**
 * Where a request came from, in the reader's language: `Requested from
 * Chrome on macOS, near Lisbon, Portugal, at 27 Oct 2026, 14:02 WET.` Each
 * part the request did not give is left out; the time is always there, in
 * the requester's time zone when the host named one, else in UTC. The code
 * emails name it, so a person can tell a request that is not theirs.
 */
export function describeOrigin(origin: RequestOrigin, { t, locale }: Pick<EmailRenderContext, 't' | 'locale'>): string {
  const parts: string[] = []
  const { browser, os } = origin.device ?? {}
  if (browser && os) parts.push(t('email.origin.device', { browser, os }))
  else if (browser || os) parts.push((browser ?? os)!)
  const country = origin.place?.country ? regionName(origin.place.country, locale) : undefined
  const place = [origin.place?.city, country].filter(Boolean).join(', ')
  if (place) parts.push(t('email.origin.place', { place }))
  const time = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: origin.timeZone ?? 'UTC', timeZoneName: 'short' }).format(origin.at)
  parts.push(t('email.origin.time', { time }))
  return t('email.origin.summary', { details: parts.join(', ') })
}

/** A country's name in `locale`, from its ISO code; the code itself where the runtime has no name for it. */
function regionName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code
  }
  catch {
    return code
  }
}

/**
 * A link, or a bare domain with a top-level domain people link with: what
 * a name an email shows may not carry. A dot alone is no link, so a name
 * like "St.John" or "J. R. R. Tolkien" stays as it is.
 */
export const LINK = /(?:[a-z][\w+.-]*:\/\/|www\.)\S*|\b[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|io|co|app|dev|ai|me|info|biz|xyz|online|site|store|shop|link|click|top|club|live|pro|tech|cloud|page|ly|gg|tv|uk|de|ru|fr|us|ca|au|in|cn|jp|nl|br|es|it|pl|ch|se|eu|cc)(?![\w-])(?:\/\S*)?/gi
/** The ideographic full stops a domain can hide behind. */
const IDEOGRAPHIC_STOP = /[。｡]/g
/** Format characters (zero-width joiners and the like) that split a domain to slip it past a check. */
const FORMAT_CHARACTERS = /\p{Cf}/gu

/** Text as a reader sees it: compatibility forms folded, full-width and ideographic dots made dots, invisible characters gone. */
export function readable(text: string): string {
  return text.normalize('NFKC').replace(IDEOGRAPHIC_STOP, '.').replace(FORMAT_CHARACTERS, '')
}

/**
 * A name someone typed as an email shows it: every link and bare domain
 * taken out, whitespace collapsed, at most `max` characters; `undefined`
 * when nothing is left. An email from the app's domain never carries a
 * link a person put in their name, a workspace's or a gift sender's.
 *
 * @example
 * ```ts
 * const workspace = plainName(workspaceName, 60) // 'Security alert: verify at evil.com' → 'Security alert: verify at'
 * ```
 */
export function plainName(name: string | undefined, max: number): string | undefined {
  if (name === undefined) return undefined
  const plain = readable(name).replace(LINK, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim()
  return plain || undefined
}
