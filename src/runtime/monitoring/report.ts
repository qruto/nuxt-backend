// What an error report says about a failed backend call, on the Nuxt side:
// the same tags the backend's own reports carry (src/convex/monitoring.ts),
// read off what the call threw. Service-neutral: the SDK's plugins (./sdk/)
// and the dev server's local error log both use it.
import { getBackendError } from '../../convex/errors.js'
import { backendCallOf, isReportable, monitoringTags } from '../../convex/monitoring.js'

export { isReportable, monitoringTags }
export { LOCAL_LOG_ROUTE } from '../../convex/constants.js'

/** How many entries the local error log keeps, the oldest dropped first. */
export const LOCAL_LOG_LIMIT = 200

/** Where a report comes from. */
export type ReportSource = 'browser' | 'server'

/**
 * Add a failed backend call's tags to an event about it: the function the
 * call ran and its catalog code. Tags the event already carries win; an
 * event about anything else passes through untouched. An event about a
 * refusal from the error catalog is dropped (`null`): the app working as
 * designed, which a report leaves out wherever it was captured, the SDK's
 * own global handlers included.
 */
export function tagBackendEvent<Event extends { tags?: Record<string, unknown> }>(event: Event, error: unknown, source: ReportSource): Event | null {
  if (!backendCallOf(error) && !getBackendError(error)) return event
  if (!isReportable(error)) return null
  event.tags = { ...monitoringTags(error, { source }), ...event.tags }
  return event
}

/** One captured error, as the dev server's local error log keeps it. */
export interface LocalErrorEntry {
  /** Increasing per dev server start. */
  id: number
  /** When it was captured, ms since epoch. */
  at: number
  source: ReportSource
  /** The function a failed call ran, when it was one. */
  function?: string
  /** Its catalog code, `none` for a crash or an app's own error. */
  code: string
  /** For `unavailable`: the service, and why. */
  reason?: string
  message: string
}

/** A captured error as the local log's entry, before the log numbers it. */
export function localEntry(error: unknown, source: ReportSource, at: number, fn?: string): Omit<LocalErrorEntry, 'id'> {
  const tags = monitoringTags(error, { source, ...fn ? { function: fn } : {} })
  const message = error instanceof Error ? error.message : String(error)
  return {
    at,
    source,
    ...tags['backend.function'] ? { function: tags['backend.function'] } : {},
    code: tags['backend.code']!,
    ...tags['backend.reason'] ? { reason: tags['backend.reason'] } : {},
    message: message.slice(0, 2000),
  }
}
