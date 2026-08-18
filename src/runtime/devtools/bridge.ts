import type { BackendDevtoolsBridgeHost, BackendDevtoolsSnapshot } from './types'

/**
 * Create the in-page bridge the DevTools panel reads. Unlike the base
 * module's bridge (which instruments client internals), this one is fed by
 * the plugin's `watchEffect`s over the package's own composables — `patch`
 * replaces one section and emits a fresh immutable snapshot, coalesced to
 * one `snapshot` event per microtask no matter how many sections change in
 * a reactive flush.
 */
export function createBackendDevtoolsBridge(): BackendDevtoolsBridgeHost {
  let snapshot: BackendDevtoolsSnapshot = {
    identity: { available: false },
    billing: { isLoading: true },
    features: { isLoading: true, keys: [] },
    credits: [],
    workspace: { available: false },
    webhooks: [],
    convexConnected: null,
  }

  const handlers = new Set<(snapshot: BackendDevtoolsSnapshot) => void>()

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
    version: 1,
    getSnapshot: () => snapshot,
    on(_event, callback) {
      handlers.add(callback)
      return () => {
        handlers.delete(callback)
      }
    },
    patch(key, value) {
      snapshot = { ...snapshot, [key]: value }
      scheduleEmit()
    },
  }
}
