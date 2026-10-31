import { createError, defineEventHandler, getRequestHeader, readBody } from 'nuxt/server'
import type { LocalErrorEntry } from '../../monitoring/report'
import { clearLocalErrors, localErrors, recordLocalError } from './local-log'

// The dev server's local error log over HTTP (dev only): DevTools ›
// Monitoring reads it (GET) and clears it (DELETE), and the browser posts
// what it captured (POST). Same-origin only: a page of another site can
// neither write an entry nor read one.

/** The longest text an entry's field keeps. */
const FIELD_LIMIT = 2000

/** A posted entry's text field, cut to size; `undefined` for anything but a string. */
function text(value: unknown, limit = FIELD_LIMIT): string | undefined {
  return typeof value === 'string' && value ? value.slice(0, limit) : undefined
}

/** A browser's entry, as it posted it: only the fields an entry has, each a string. */
function browserEntry(body: unknown): Omit<LocalErrorEntry, 'id'> | null {
  if (typeof body !== 'object' || body === null) return null
  const record = body as Record<string, unknown>
  const message = text(record.message)
  if (!message) return null
  const fn = text(record.function, 200)
  const reason = text(record.reason, 200)
  return { at: Date.now(), source: 'browser', ...fn ? { function: fn } : {}, code: text(record.code, 64) ?? 'none', ...reason ? { reason } : {}, message }
}

export default defineEventHandler(async (event) => {
  // A browser names a request from another site; a refusal reads nothing and writes nothing.
  const site = getRequestHeader(event, 'sec-fetch-site')
  if (site && site !== 'same-origin') throw createError({ status: 403, message: 'The local error log answers its own dev server only.' })
  event.res.headers.set('Cache-Control', 'no-store')
  const { method } = event.req
  if (method === 'GET') return { entries: localErrors() }
  if (method === 'DELETE') {
    clearLocalErrors()
    return { entries: [] }
  }
  if (method === 'POST') {
    const entry = browserEntry(await readBody(event).catch(() => null))
    if (!entry) throw createError({ status: 400, message: 'An entry needs a message.' })
    return recordLocalError(entry)
  }
  throw createError({ status: 405, message: 'GET, POST or DELETE.' })
})
