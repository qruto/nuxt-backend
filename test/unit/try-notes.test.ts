import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createApp, toWebHandler } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { notesMarkdown, parseNotes } from '../../scripts/try/notes.mjs'
import { createNotesHandler, fromOwnPage, NOTES_FILE_LIMIT, notesRefusal, parseReviewNote } from '../../website/modules/try-kit/runtime/notes'
import { NOTES_ROUTE } from '../../website/modules/try-kit/runtime/route'

// The try kit's review notes: the dev server takes them, a production
// server never does, and `pnpm try:notes` turns them into Markdown.

const kit = vi.hoisted(() => ({ addPlugin: vi.fn(), addServerHandler: vi.fn() }))
vi.mock('@nuxt/kit', async original => ({ ...await original(), addPlugin: kit.addPlugin, addServerHandler: kit.addServerHandler }))

let dir: string
let file: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'review-notes-'))
  file = join(dir, '.review/notes.jsonl')
  kit.addPlugin.mockClear()
  kit.addServerHandler.mockClear()
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

const note = { page: '/playground/platform/billing', url: 'https://nuxt-backend.localhost/playground/platform/billing', title: 'Billing', selector: 'main > h1', text: 'Billing', viewport: { width: 1280, height: 800 }, note: 'The plan name is cut off.' }

/** One request to the endpoint, as a page of the site at `origin` sends it to `host`. */
async function post(dev: boolean, body: unknown, origin = 'https://nuxt-backend.localhost', { host = 'nuxt-backend.localhost', served }: { host?: string, served?: string } = {}) {
  const app = createApp().use(NOTES_ROUTE, createNotesHandler({ file: () => file, dev, served: () => served }))
  return await toWebHandler(app)(new Request(`https://${host}${NOTES_ROUTE}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, host },
    body: JSON.stringify(body),
  }))
}

describe('the notes endpoint', () => {
  it('refuses outside a dev server, and in production whatever it was built as', async () => {
    expect(notesRefusal({ dev: false })).toMatch(/dev server only/)
    expect(notesRefusal({ dev: true, nodeEnv: 'production' })).toMatch(/never taken in production/)
    expect(notesRefusal({ dev: true, nodeEnv: 'development' })).toBeNull()

    expect((await post(false, note)).status).toBe(404)
    vi.stubEnv('NODE_ENV', 'production')
    expect((await post(true, note)).status).toBe(404)
    expect(existsSync(file)).toBe(false)
  })

  it('appends a note from a page of the site to the notes file', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect((await post(true, note)).status).toBe(200)
    expect((await post(true, { ...note, note: 'Second' })).status).toBe(200)
    const lines = readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line))
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ page: note.page, selector: 'main > h1', viewport: { width: 1280, height: 800 }, note: note.note })
    expect(lines[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('refuses a page of another site, and a note with no text or no page', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect((await post(true, note, 'https://evil.example')).status).toBe(403)
    expect((await post(true, { ...note, note: '  ' })).status).toBe(422)
    expect((await post(true, { ...note, page: 'https://evil.example/' })).status).toBe(422)
    expect(existsSync(file)).toBe(false)
  })

  it('refuses a page of another site that a DNS rebinding points at this machine', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    // Its own name in the Origin and the Host alike: the same origin, but no name of this machine.
    expect((await post(true, note, 'http://attacker.example:3000', { host: 'attacker.example:3000' })).status).toBe(403)
    expect(existsSync(file)).toBe(false)
    expect(fromOwnPage('http://localhost:3000', 'localhost:3000')).toBe(true)
    expect(fromOwnPage('https://nuxt-backend.local', 'nuxt-backend.local')).toBe(true)
    expect(fromOwnPage('http://127.0.0.1:3000', 'localhost:3000')).toBe(false)
  })

  it('takes notes from the origin the try kit serves at, a tailnet name', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const tailnet = 'https://box.tail1234.ts.net:8443'
    expect((await post(true, note, tailnet, { host: 'box.tail1234.ts.net:8443' })).status).toBe(403)
    expect((await post(true, note, tailnet, { host: 'box.tail1234.ts.net:8443', served: tailnet })).status).toBe(200)
  })

  it('refuses once the notes file is full', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, 'x'.repeat(NOTES_FILE_LIMIT))
    expect((await post(true, note)).status).toBe(413)
    expect(readFileSync(file, 'utf8')).toHaveLength(NOTES_FILE_LIMIT)
  })

  it('caps every field', () => {
    const parsed = parseReviewNote({ ...note, note: 'x'.repeat(10_000), text: 'y'.repeat(1_000), viewport: { width: -5, height: 1e9 } })
    expect(typeof parsed).toBe('object')
    const capped = parsed as Exclude<typeof parsed, string>
    expect(capped.note).toHaveLength(4_000)
    expect(capped.text).toHaveLength(300)
    expect(capped.viewport).toEqual({ width: 0, height: 100_000 })
  })
})

describe('the try-kit module', () => {
  it('registers nothing in a production build, and the endpoint and the overlay in dev', async () => {
    const module = (await import('../../website/modules/try-kit/index')).default as unknown as (options: object, nuxt: unknown) => Promise<unknown>
    const nuxtOf = (dev: boolean) => ({ options: { dev, runtimeConfig: {} as Record<string, unknown> }, hook: vi.fn(), hooks: { addHooks: vi.fn() } })
    const production = nuxtOf(false)
    await module({}, production)
    expect(kit.addServerHandler).not.toHaveBeenCalled()
    expect(kit.addPlugin).not.toHaveBeenCalled()
    expect(production.options.runtimeConfig.tryKit).toBeUndefined()

    const dev = nuxtOf(true)
    await module({}, dev)
    expect(kit.addServerHandler).toHaveBeenCalledWith(expect.objectContaining({ route: NOTES_ROUTE, method: 'post' }))
    expect(kit.addPlugin).toHaveBeenCalledWith(expect.objectContaining({ mode: 'client' }))
    const tryKit = dev.options.runtimeConfig.tryKit as { notesFile: string, origin: string }
    // The module resolves with forward slashes on every platform.
    expect(tryKit.notesFile.replaceAll('\\', '/')).toBe(join(import.meta.dirname, '../../.review/notes.jsonl').replaceAll('\\', '/'))
    expect(tryKit.origin).toBe('')
  })
})

describe('pnpm try:notes', () => {
  it('groups the notes by page, in the order the pages were first noted, and skips a torn line', () => {
    const lines = [
      JSON.stringify({ ...note, at: '2026-10-19T10:00:00.000Z' }),
      '{"page": "/playground", "no',
      JSON.stringify({ page: '/docs/start', note: 'Typo in the intro.', selector: null, at: '2026-10-19T10:05:00.000Z' }),
      JSON.stringify({ ...note, note: 'Second line\nwith more detail', at: '2026-10-19T10:10:00.000Z' }),
    ].join('\n')
    const notes = parseNotes(lines)
    expect(notes).toHaveLength(3)
    const markdown = notesMarkdown(notes)
    expect(markdown).toContain('3 notes on 2 pages.')
    expect(markdown.indexOf('## /playground/platform/billing')).toBeLessThan(markdown.indexOf('## /docs/start'))
    expect(markdown).toContain('- The plan name is cut off.\n  <sub>`main > h1` · “Billing” · 1280×800 · 2026-10-19 10:00</sub>')
    expect(markdown).toContain('- Second line\n  with more detail')
    expect(markdown).toContain('- Typo in the intro.\n  <sub>the whole page · 2026-10-19 10:05</sub>')
  })

  it('says how to leave one when there are none', () => {
    expect(notesMarkdown([])).toContain('press N')
  })
})
