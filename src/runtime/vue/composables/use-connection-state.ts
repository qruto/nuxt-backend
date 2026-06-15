import type { ConnectionState } from 'convex/browser'
import type { ShallowRef } from 'vue'
import { useConvex } from '../client'
import { useSubscription } from './use-subscription'

/**
 * Subscribe reactively to the Convex WebSocket connection state.
 *
 * Returns a shallow ref that updates automatically whenever the connection
 * state changes. Useful for displaying online/offline indicators or request
 * spinners.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const conn = useConvexConnectionState()
 * </script>
 *
 * <template>
 *   <span v-if="!conn.isWebSocketConnected">Offline</span>
 * </template>
 * ```
 *
 * @returns A shallow ref containing the current {@link ConnectionState}.
 *
 * @public
 */
export function useConvexConnectionState(): ShallowRef<ConnectionState> {
  const convex = useConvex()

  // Bridge the client's `{ connectionState, subscribeToConnectionState }` pair
  // into Vue reactivity through the shared `useSubscription` primitive. Mirrors
  // React's `useConvexConnectionState`, which composes `useSubscription` the
  // same way, and lets `useSubscription` re-read the value synchronously when
  // the effect attaches (closing the gap between the initial read and the
  // subscription).
  return useSubscription({
    getCurrentValue: () => convex.connectionState(),
    subscribe: callback => convex.subscribeToConnectionState(() => callback()),
  })
}
