import type { EmailBlock } from './email-blocks.js'
import type { EmailRenderContext, RequestOrigin } from './email-templates.js'

// What the packaged emails share beyond the blocks, public on
// `nuxt-backend/email` so an ejected email (src/convex/emails/) and an
// app's own read the same: where a request came from, and the blocks of
// one link.

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
