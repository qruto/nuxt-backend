import { diffSection } from './events'
import type {
  BackendDevtoolsBridgeHost,
  BackendDevtoolsSnapshot,
  DevtoolsActivityEvent,
  DevtoolsBridgeRequests,
  DevtoolsPatchableSection,
} from './types'

/** How many activity entries the bridge keeps, oldest dropped first. */
const ACTIVITY_LIMIT = 200

/** Whether a section's value is a loading placeholder rather than an answer. */
function isLoading(value: unknown): boolean {
  return typeof value === 'object' && value !== null && (value as { isLoading?: unknown }).isLoading === true
}

/**
 * Create the in-page bridge the DevTools panel reads. Unlike the base
 * module's bridge (which instruments client internals), this one is fed by
 * the plugin's `watchEffect`s over the package's own composables — `patch`
 * replaces one section and emits a fresh immutable snapshot, coalesced to
 * one `snapshot` event per microtask no matter how many sections change in
 * a reactive flush. Each settled value (not a loading one) after a section's
 * first is also compared with the section's last settled value, and what
 * changed is appended to `activity`.
 */
export function createBackendDevtoolsBridge(requests: Partial<DevtoolsBridgeRequests> = {}): BackendDevtoolsBridgeHost {
  let snapshot: BackendDevtoolsSnapshot = {
    identity: { available: false },
    billing: { isLoading: true, cancelAtPeriodEnd: false, isPaused: false },
    entitlements: { isLoading: true, features: [], plans: [] },
    credits: [],
    workspace: { available: false },
    webhooks: [],
    config: { brand: {}, plans: [], packs: [] },
    missingNamespaces: [],
    connection: null,
    active: false,
    activity: [],
  }

  const handlers = new Set<(snapshot: BackendDevtoolsSnapshot) => void>()
  const activityHandlers = new Set<(event: DevtoolsActivityEvent) => void>()
  // Each section's last settled value, the snapshot it arrived in. A sign-in
  // or a plan change passes through a loading state, and compared with that
  // it would never be told. The first settled value is the baseline.
  const settled = new Map<DevtoolsPatchableSection, BackendDevtoolsSnapshot>()
  let lastId = 0

  let emitScheduled = false
  const scheduleEmit = () => {
    if (emitScheduled) return
    emitScheduled = true
    queueMicrotask(() => {
      emitScheduled = false
      for (const handler of handlers) handler(snapshot)
    })
  }

  return {
    version: 3,
    getSnapshot: () => snapshot,
    activate() {
      if (snapshot.active) return
      snapshot = { ...snapshot, active: true }
      requests.activate?.()
      scheduleEmit()
    },
    request: section => requests.request?.(section),
    lookupEmail: emailId => requests.lookupEmail?.(emailId),
    on(_event, callback) {
      handlers.add(callback)
      return () => {
        handlers.delete(callback)
      }
    },
    onActivity(callback) {
      activityHandlers.add(callback)
      // A listener that attaches late (the timeline waits on a dynamic
      // import) still gets what happened before it did.
      for (const event of snapshot.activity) callback(event)
      return () => {
        activityHandlers.delete(callback)
      }
    },
    patch(key, value) {
      const next = { ...snapshot, [key]: value } as BackendDevtoolsSnapshot
      const previous = isLoading(value) ? undefined : settled.get(key)
      if (!isLoading(value)) settled.set(key, next)
      const events: DevtoolsActivityEvent[] = previous
        ? diffSection(key, previous, next).map(draft => ({ id: ++lastId, at: Date.now(), ...draft }))
        : []
      snapshot = events.length > 0 ? { ...next, activity: [...next.activity, ...events].slice(-ACTIVITY_LIMIT) } : next
      for (const event of events) {
        for (const handler of activityHandlers) handler(event)
      }
      scheduleEmit()
    },
  }
}
