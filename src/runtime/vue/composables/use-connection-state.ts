import type { ConnectionState } from 'convex/browser'
import { shallowRef, watchEffect, type ShallowRef } from 'vue'
import { useConvex } from '../client'

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
  const state = shallowRef<ConnectionState>(convex.connectionState())

  watchEffect((onCleanup) => {
    const unsubscribe = convex.subscribeToConnectionState((newState) => {
      state.value = newState
    })
    onCleanup(unsubscribe)
  })

  return state
}
