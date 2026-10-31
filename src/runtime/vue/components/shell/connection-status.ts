import { onBeforeUnmount, onMounted, shallowRef, type InjectionKey } from 'vue'
import { useIntervalFn } from '@vueuse/core'
import type { ConnectionState } from 'nuxt-convex-module/client'
import { useBackendClient } from '../../composables/base-aliases'

/**
 * Where the live connection stands, as `<ConnectionStatus>` reads it:
 * `online` (connected, or connecting for the first time on its first try),
 * `reconnecting` (the connection dropped, or keeps failing to come up,
 * while the browser is online) or `offline` (the browser is offline).
 */
export type ConnectionStatusState = 'online' | 'reconnecting' | 'offline'

/** What `<ConnectionStatus>`'s slot receives. */
export interface ConnectionStatusSlotContext {
  /** Where the connection stands, once a drop has lasted `delay`. */
  status: ConnectionStatusState
  /** Changes made while the connection was down, waiting to be sent. */
  pendingChanges: number
}

/** `<ConnectionStatus>`'s slot. */
export interface ConnectionStatusSlots {
  /** The words in the status region, in every status: `online` included, for an indicator of your own. */
  default: (context: ConnectionStatusSlotContext) => unknown
}

/** What `<ConnectionStatus>` reads off the app's client. */
interface ConnectionSource {
  connectionState: () => ConnectionState
  subscribeToConnectionState: (callback: (state: ConnectionState) => void) => () => void
}

/**
 * Whether the client has opened its connection. It opens it on its first
 * query, mutation or sign-in, and asking it for its state would open it too:
 * a page that runs nothing, such as the sign-in page for a signed-out
 * visitor, would hold a socket for these words alone. `cachedSync` is the
 * base client's lazily created connection (the same field its DevTools
 * bridge watches); an upstream ask in .github/upstream.json names it.
 */
const hasConnection = (client: object): boolean => Boolean((client as { cachedSync?: unknown }).cachedSync)

/** How often a status waits for the client to open its connection, in milliseconds. */
const CONNECTION_CHECK_MS = 1000

/** Set for the frame's own status (see `FrameConnectionStatus.vue`). */
export const IN_FRAME: InjectionKey<boolean> = Symbol('backend-connection-status-frame')

/** How many statuses the app placed itself are mounted: the frame's own says nothing while one is. */
export const placedByApp = shallowRef(0)

/**
 * The client's connection state once it has a connection, read in the
 * browser after mount and never opening one: `undefined` until then, and in
 * an app with no backend URL, which has no client to read.
 *
 * @internal
 */
export function useOpenedConnection() {
  const client = import.meta.client ? useBackendClient() as (ConnectionSource & object) | undefined : undefined
  const connection = shallowRef<ConnectionState>()
  let unsubscribe: (() => void) | undefined
  const attach = (): boolean => {
    if (!client || !hasConnection(client)) return false
    connection.value = client.connectionState()
    unsubscribe = client.subscribeToConnectionState((state) => {
      connection.value = state
    })
    return true
  }
  const waiting = useIntervalFn(() => {
    if (attach()) waiting.pause()
  }, CONNECTION_CHECK_MS, { immediate: false })
  onMounted(() => {
    if (client && !attach()) waiting.resume()
  })
  onBeforeUnmount(() => {
    waiting.pause()
    unsubscribe?.()
  })
  return connection
}
