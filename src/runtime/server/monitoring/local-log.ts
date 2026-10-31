import { LOCAL_LOG_LIMIT, localEntry, type LocalErrorEntry } from '../../monitoring/report'
import { addBackendReporter } from './capture'

// The dev server's local error log: what an error-reporting service would
// receive, kept in the dev server's memory and listed by DevTools ›
// Monitoring. Dev only (the module registers this plugin and its route only
// under `nuxt dev`): the stand-in for the monitoring layer while no DSN is
// set, and beside the service while one is.

const entries: LocalErrorEntry[] = []
let lastId = 0

/** Keep one entry, the oldest dropped past the limit. */
export function recordLocalError(entry: Omit<LocalErrorEntry, 'id'>): LocalErrorEntry {
  const kept = { ...entry, id: ++lastId }
  entries.push(kept)
  if (entries.length > LOCAL_LOG_LIMIT) entries.splice(0, entries.length - LOCAL_LOG_LIMIT)
  return kept
}

/** Every entry kept, oldest first. */
export function localErrors(): LocalErrorEntry[] {
  return [...entries]
}

/** Forget every entry. */
export function clearLocalErrors(): void {
  entries.length = 0
}

/**
 * Whether a server error is worth an entry: a crash, never a 4xx the app
 * answered on purpose. h3 1 names the status `statusCode`, h3 2 `status`.
 */
function isServerFailure(error: unknown): boolean {
  const { status, statusCode } = error as { status?: unknown, statusCode?: unknown }
  const code = typeof status === 'number' ? status : statusCode
  return typeof code !== 'number' || code >= 500
}

/** The part of the Nitro app the plugin uses: its error hook, the same on both Nitro majors. */
interface ErrorHookNitroApp {
  hooks: { hook: (name: 'error', run: (error: unknown) => void) => unknown }
}

/** Errors kept already: a failed call rethrown into the error hook is one entry, not two. */
const kept = new WeakSet<object>()

/** Whether this is the first time the log sees an error. */
function firstSighting(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return true
  if (kept.has(error)) return false
  kept.add(error)
  return true
}

/**
 * A Nitro plugin, since `nuxt/server` has no plugin API. It imports no server
 * runtime, so the same file runs on Nitro 2 and Nitro 3.
 */
export default function localErrorLogPlugin(nitroApp: ErrorHookNitroApp): void {
  // Failed backend calls made from the server, tagged at their call site.
  addBackendReporter((error, tags) => {
    if (firstSighting(error)) recordLocalError(localEntry(error, 'server', Date.now(), tags['backend.function']))
  })
  // Whatever else the server's error hook sees: a handler or a render that threw.
  nitroApp.hooks.hook('error', (error) => {
    if (!isServerFailure(error)) return
    // h3 wraps what a handler threw: the entry is about what was thrown.
    const cause = (error as { cause?: unknown }).cause ?? error
    if (firstSighting(cause)) recordLocalError(localEntry(cause, 'server', Date.now()))
  })
}
