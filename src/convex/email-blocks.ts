import { escapeHtml } from './email-html.js'
import type { ResolvedEmailTheme } from './email-theme.js'

// The parts every packaged email is made of, as data: a kicker, a heading,
// paragraphs, a code, a button, a note. The layout renders each one in the
// theme, escaped, with a plain-text version written beside it, so an app's
// own emails look like the package's without hand-written HTML.

/**
 * One part of an email's body. Every value is text: the layout escapes it,
 * so a title a user typed cannot put markup into the email.
 *
 * - `{ kicker }`: a short label above the heading, in the accent color.
 * - `{ heading }`: the email's title.
 * - `{ paragraph }`: a paragraph of text; a line break in it stays one.
 * - `{ code }`: a one-time code on a plate of its own, in large, spaced type.
 * - `{ button: { label, url } }`: one call to action; the URL is `https:`, `http:` or `mailto:`.
 * - `{ note }`: quiet small print under the action; a line break in it stays one.
 */
export type EmailBlock
  = | { kicker: string }
    | { heading: string }
    | { paragraph: string }
    | { code: string }
    | { button: { label: string, url: string } }
    | { note: string }

/** What a list of blocks renders to: the body's markup, its plain text, and the first sentence a mailbox previews. */
export interface RenderedBlocks {
  html: string
  text: string
  /** The first paragraph, else the heading: never a code. Absent for blocks with neither. */
  preheader?: string
}

const KINDS = ['kicker', 'heading', 'paragraph', 'code', 'button', 'note'] as const
type Kind = typeof KINDS[number]

/** A URL a button may open: a web page or a mailbox, never a script. */
const SAFE_URL = /^(?:https?:\/\/|mailto:)/i

function kindOf(block: unknown, index: number): Kind {
  const keys = block !== null && typeof block === 'object' ? Object.keys(block) : []
  const kind = keys[0] as Kind | undefined
  if (keys.length !== 1 || kind === undefined || !KINDS.includes(kind)) {
    throw new TypeError(`[nuxt-backend] email blocks[${index}] must have exactly one of ${KINDS.map(name => `\`${name}\``).join(', ')}, got ${JSON.stringify(block)}.`)
  }
  return kind
}

function textOf(block: unknown, kind: Kind, index: number): string {
  const value = (block as Record<Kind, unknown>)[kind]
  if (typeof value !== 'string') throw new TypeError(`[nuxt-backend] email blocks[${index}].${kind} must be text, got ${JSON.stringify(value)}.`)
  return value
}

function buttonOf(block: unknown, index: number): { label: string, url: string } {
  const value = (block as { button: unknown }).button as { label?: unknown, url?: unknown } | null
  if (value === null || typeof value !== 'object' || typeof value.label !== 'string' || typeof value.url !== 'string') {
    throw new TypeError(`[nuxt-backend] email blocks[${index}].button must be { label, url }, both text.`)
  }
  if (!SAFE_URL.test(value.url.trim())) throw new TypeError(`[nuxt-backend] email blocks[${index}].button.url must start with https://, http:// or mailto:, got ${JSON.stringify(value.url)}.`)
  return { label: value.label, url: value.url.trim() }
}

/** Text as markup, a line break kept. */
const lines = (value: string) => escapeHtml(value).replace(/\r?\n/g, '<br>')

/**
 * Render blocks in a theme: the HTML of the card's body, the plain-text twin
 * and the preview text. Throws a `TypeError` for a block that is none of the
 * six, a value that is not text or a button whose URL is not a web page or a
 * mailbox.
 *
 * @internal
 */
export function renderBlocks(blocks: readonly EmailBlock[], theme: ResolvedEmailTheme): RenderedBlocks {
  const { colors, fonts } = theme
  const body = `font-family:${escapeHtml(fonts.body)}`
  const display = `font-family:${escapeHtml(fonts.heading)}`
  const markup: string[] = []
  const plain: string[] = []
  let heading: string | undefined
  let paragraph: string | undefined

  blocks.forEach((block, index) => {
    const kind = kindOf(block, index)
    if (kind === 'button') {
      const { label, url } = buttonOf(block, index)
      markup.push(`<p style="margin:0 0 20px"><a class="nb-button" href="${escapeHtml(url)}" style="display:inline-block;padding:11px 20px;border-radius:8px;background:${colors.accent};color:${colors.accentText};${body};font-weight:600;text-decoration:none">${escapeHtml(label)}</a></p>`)
      plain.push(`${label}: ${url}`)
      return
    }
    const text = textOf(block, kind, index)
    plain.push(text)
    switch (kind) {
      case 'kicker':
        markup.push(`<p class="nb-accent" style="margin:0 0 8px;${display};font-size:12px;line-height:1.4;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${colors.accent}">${escapeHtml(text)}</p>`)
        break
      case 'heading':
        heading ??= text
        markup.push(`<h1 class="nb-ink" style="margin:0 0 16px;${display};font-size:24px;line-height:1.25;font-weight:700;color:${colors.text}">${escapeHtml(text)}</h1>`)
        break
      case 'paragraph':
        paragraph ??= text
        markup.push(`<p class="nb-ink" style="margin:0 0 16px;color:${colors.text}">${lines(text)}</p>`)
        break
      case 'code':
        markup.push(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px"><tr><td class="nb-plate" align="center" style="padding:14px 22px;border-radius:8px;background:${colors.accent};color:${colors.accentText};${display};font-size:32px;line-height:1.1;font-weight:700;letter-spacing:0.28em;text-indent:0.28em">${escapeHtml(text)}</td></tr></table>`)
        break
      case 'note':
        markup.push(`<p class="nb-muted" style="margin:0 0 16px;font-size:14px;color:${colors.muted};overflow-wrap:anywhere">${lines(text)}</p>`)
        break
    }
  })

  const preheader = paragraph ?? heading
  return { html: markup.join(''), text: plain.join('\n\n'), ...(preheader ? { preheader } : {}) }
}
