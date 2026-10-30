import { appendFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { createError, defineEventHandler, getRequestHeader, readBody } from 'h3'

// The review notes the maintainer leaves while trying the playground and
// the docs (press N on a page): one JSON line each in `.review/notes.jsonl`
// at the repository root, which `pnpm try:notes` turns into Markdown by
// page. The dev server takes them; a production server never does.

/** One note, as it is written to the file. */
export interface ReviewNote {
  /** When it was taken, ISO 8601. */
  at: string
  /** The route it was taken on, with its query: `/playground/platform/billing`. */
  page: string
  url: string
  title: string
  /** The element it is about, as a CSS selector; `null` for the page as a whole. */
  selector: string | null
  /** The start of that element's text. */
  text: string | null
  viewport: { width: number, height: number }
  note: string
}

/** How long each field may be: a note is a sentence or a paragraph, never a page. */
export const NOTE_LIMITS = { note: 4_000, page: 1_000, url: 2_000, title: 300, selector: 600, text: 300 } as const

/** How large the notes file may grow, in bytes: thousands of notes, never a full disk. */
export const NOTES_FILE_LIMIT = 5 * 1024 * 1024

/**
 * Why the endpoint refuses to take notes, or `null` when it may: only a dev
 * server takes them. The module never registers it in a production build;
 * this holds even if a build somehow carried it.
 */
export function notesRefusal({ dev, nodeEnv }: { dev: boolean, nodeEnv?: string }): string | null {
  if (!dev) return 'review notes are taken by the dev server only'
  if (nodeEnv === 'production') return 'review notes are never taken in production'
  return null
}

function text(value: unknown, limit: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, limit) : null
}

function dimension(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(Math.round(value), 100_000) : 0
}

/** A note from a request body, its fields trimmed and capped; a string says why it was refused. */
export function parseReviewNote(body: unknown, now: Date = new Date()): ReviewNote | string {
  if (typeof body !== 'object' || body === null) return 'the body is no JSON object'
  const input = body as Record<string, unknown>
  const note = text(input.note, NOTE_LIMITS.note)
  if (!note) return 'the note is empty'
  const page = text(input.page, NOTE_LIMITS.page)
  if (!page?.startsWith('/')) return 'the page is no path of this site'
  const viewport = (typeof input.viewport === 'object' && input.viewport !== null ? input.viewport : {}) as Record<string, unknown>
  return {
    at: now.toISOString(),
    page,
    url: text(input.url, NOTE_LIMITS.url) ?? page,
    title: text(input.title, NOTE_LIMITS.title) ?? '',
    selector: text(input.selector, NOTE_LIMITS.selector),
    text: text(input.text, NOTE_LIMITS.text),
    viewport: { width: dimension(viewport.width), height: dimension(viewport.height) },
    note,
  }
}

/** A host name of this machine or its network: loopback, or a `.localhost` or `.local` name. */
function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return host === 'localhost' || host === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(host) || host.endsWith('.localhost') || host.endsWith('.local')
}

/**
 * Whether a request comes from a page of this dev server: its Origin names
 * the host it was sent to, and that is a name of this machine or its network,
 * or the origin the try kit serves the app at (`served`: a tailnet name).
 * A page of another site whose name a DNS-rebinding attack points at this
 * machine sends its own name as both, which is neither, and is refused.
 */
export function fromOwnPage(origin: string | undefined, host: string | undefined, served?: string): boolean {
  if (!origin || !host) return false
  try {
    const url = new URL(origin)
    if (url.host !== host) return false
    if (served && url.origin === new URL(served).origin) return true
    return isLocalHostname(url.hostname)
  }
  catch {
    return false
  }
}

/**
 * The endpoint: refused (404) outside a dev server, refused (403) to a
 * page of another site, refused (413) once the file is full, and otherwise
 * one note appended to `file()`. `served` is the origin the try kit serves
 * the app at, when it is no name of this machine (`--tailscale`).
 */
export function createNotesHandler({ file, dev, served = () => undefined }: { file: () => string, dev: boolean, served?: () => string | undefined }) {
  return defineEventHandler(async (event) => {
    if (notesRefusal({ dev, nodeEnv: process.env.NODE_ENV })) throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    if (event.method !== 'POST') throw createError({ statusCode: 405, statusMessage: 'Method Not Allowed' })
    const host = getRequestHeader(event, 'x-forwarded-host') ?? getRequestHeader(event, 'host')
    if (!fromOwnPage(getRequestHeader(event, 'origin'), host, served())) throw createError({ statusCode: 403, statusMessage: 'Notes come from this site\'s own pages.' })
    const note = parseReviewNote(await readBody(event).catch(() => null))
    if (typeof note === 'string') throw createError({ statusCode: 422, statusMessage: note })
    const path = file()
    if (existsSync(path) && statSync(path).size >= NOTES_FILE_LIMIT) {
      throw createError({ statusCode: 413, statusMessage: 'The notes file is full: export it (pnpm try:notes --out notes.md), then remove .review/notes.jsonl.' })
    }
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path, `${JSON.stringify(note)}\n`)
    return { saved: true }
  })
}
