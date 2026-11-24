import type { FunctionReference } from 'convex/server'
import { computed, effectScope, getCurrentInstance, onScopeDispose, shallowRef, toValue, watch, type ComputedRef, type EffectScope, type MaybeRefOrGetter } from 'vue'
import { usePresence, type PresenceAPI } from 'nuxt-convex-module/presence/client'
import type { RoomMember } from '../../../convex/integrations/presence'
import { useAuthSession } from '../utils/auth-session'
import { useBackendNamespace } from '../utils/namespace'

/** The functions `backend/presence.ts` exports from `setupPresence`. */
interface PresenceRefs {
  list: FunctionReference<'query', 'public', { roomToken: string }, RoomMember[]>
  heartbeat: FunctionReference<'mutation', 'public', { roomId: string, userId: string, sessionId: string, interval: number }, { roomToken: string, sessionToken: string }>
  disconnect: FunctionReference<'mutation', 'public', { sessionToken: string }>
}

export interface UseRoomPresenceOptions {
  /** Milliseconds between heartbeats. Default 10000: someone who leaves without a word drops off after 2.5 of them. */
  interval?: MaybeRefOrGetter<number | undefined>
  /** Override the injected `api.presence` namespace. */
  api?: PresenceRefs
}

export interface UseRoomPresenceReturn {
  /** Everyone in the room, the signed-in person first, or `undefined` while it loads (and while nobody is signed in). */
  members: ComputedRef<RoomMember[] | undefined>
  /** The others online now, for a face pile or "3 people here". */
  others: ComputedRef<RoomMember[]>
  /** `true` once the room has answered. */
  ready: ComputedRef<boolean>
}

/**
 * Who is here: keep the signed-in person in a room (a page, a document,
 * `workspace:<id>`) while the page is open and visible, and list who else
 * is there, live. The room is whatever string the app names; the backend's
 * `setupPresence({ canJoin })` decides who may join it. Signed out, it
 * sends nothing and lists nobody. Pairs with the base module's
 * `<FacePile :presence-state="members ?? []">`.
 *
 * Needs `backend/presence.ts` exporting `setupPresence(components)`'s
 * `list`, `heartbeat` and `disconnect`, and `@convex-dev/presence` mounted
 * in `convex.config.ts` as `presence`.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const route = useRoute()
 * const { others } = useRoomPresence(() => `doc:${route.params.id}`)
 * </script>
 *
 * <template>
 *   <p v-if="others.length">{{ others.map(person => person.name).join(', ') }} also here</p>
 * </template>
 * ```
 *
 * @experimental
 */
export function useRoomPresence(roomId: MaybeRefOrGetter<string>, options: UseRoomPresenceOptions = {}): UseRoomPresenceReturn {
  const auth = useAuthSession()
  const api = useBackendNamespace<PresenceRefs>('presence', 'useRoomPresence', options.api)
  // The base composable heartbeats from the moment it runs: it runs once
  // someone is signed in, in a scope of its own that ends with the account.
  const app = getCurrentInstance()?.appContext.app
  const state = shallowRef<ComputedRef<RoomMember[] | undefined>>()
  let scope: EffectScope | undefined
  const stop = () => {
    scope?.stop()
    scope = undefined
    state.value = undefined
  }
  watch([() => auth.user.value?.id, () => Boolean(toValue(roomId))], ([userId, named]) => {
    stop()
    if (!userId || !named || !api.heartbeat) return
    scope = effectScope()
    const start = () => scope!.run(() => usePresence(api as unknown as PresenceAPI, roomId, userId, options.interval) as ComputedRef<RoomMember[] | undefined>)
    state.value = app ? app.runWithContext(start) : start()
  }, { immediate: true })
  onScopeDispose(stop)

  const members = computed(() => state.value?.value)
  const self = computed(() => auth.user.value?.id)
  return {
    members,
    others: computed(() => (members.value ?? []).filter(person => person.online && person.userId !== self.value)),
    ready: computed(() => members.value !== undefined),
  }
}
