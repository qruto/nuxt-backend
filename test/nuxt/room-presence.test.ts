import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { enableAutoUnmount, mount } from '@vue/test-utils'

// useRoomPresence over a stand-in for the base module's usePresence: it
// runs only while someone is signed in and a room is named, for the
// signed-in account, and stops (leaving the room) when either goes.

const userId = ref<string | null>('u_ada')
interface Started { roomId: MaybeRefOrGetter<string>, userId: string, interval: unknown, stopped: boolean }
const started: Started[] = []
const rooms = new Map<string, Array<{ userId: string, online: boolean, lastDisconnected: number, name?: string }>>()

vi.mock('../../src/runtime/vue/utils/auth-session', () => ({ useAuthSession: () => ({
  user: computed(() => (userId.value ? { id: userId.value } : null)),
}),
}))
vi.mock('nuxt-convex-module/presence/client', async () => {
  const { computed: derived, onScopeDispose, toValue: read } = await import('vue')
  return {
    usePresence: (_api: unknown, roomId: MaybeRefOrGetter<string>, user: string, interval: unknown) => {
      const entry: Started = { roomId, userId: user, interval, stopped: false }
      started.push(entry)
      onScopeDispose(() => {
        entry.stopped = true
      })
      return derived(() => rooms.get(read(roomId)))
    },
  }
})

const { useRoomPresence } = await import('../../src/runtime/vue/composables/use-room-presence')
const { BackendApiKey } = await import('../../src/runtime/vue/utils/namespace')
const api = { list: 'presence:list', heartbeat: 'presence:heartbeat', disconnect: 'presence:disconnect' }

function host(roomId: MaybeRefOrGetter<string>, options: { withApi?: boolean } = {}) {
  let result!: ReturnType<typeof useRoomPresence>
  const wrapper = mount(defineComponent({
    setup() {
      result = useRoomPresence(roomId, { interval: 5_000 })
      return () => h('p', (result.others.value).map(person => person.name).join(', '))
    },
  }), { global: { provide: { [BackendApiKey as symbol]: options.withApi === false ? {} : { presence: api } } } })
  return { wrapper, result: () => result }
}

enableAutoUnmount(afterEach)

beforeEach(() => {
  userId.value = 'u_ada'
  started.length = 0
  rooms.clear()
})

describe('useRoomPresence', () => {
  it('joins the room as the signed-in account, and lists the others online', async () => {
    rooms.set('doc:1', [
      { userId: 'u_ada', online: true, lastDisconnected: 0, name: 'Ada' },
      { userId: 'u_grace', online: true, lastDisconnected: 0, name: 'Grace' },
      { userId: 'u_alan', online: false, lastDisconnected: 1, name: 'Alan' },
    ])
    const { wrapper, result } = host('doc:1')
    expect(started).toHaveLength(1)
    expect(started[0]).toMatchObject({ userId: 'u_ada', interval: 5_000 })
    expect(toValue(started[0]!.roomId)).toBe('doc:1')
    expect(result().ready.value).toBe(true)
    expect(result().members.value).toHaveLength(3)
    expect(result().others.value.map(person => person.userId)).toEqual(['u_grace'])
    expect(wrapper.text()).toBe('Grace')
  })

  it('sends nothing signed out, joins on sign-in and leaves on sign-out', async () => {
    userId.value = null
    const { result } = host('doc:1')
    expect(started).toHaveLength(0)
    expect(result().members.value).toBeUndefined()
    expect(result().ready.value).toBe(false)
    userId.value = 'u_ada'
    await nextTick()
    expect(started).toHaveLength(1)
    userId.value = null
    await nextTick()
    expect(started[0]!.stopped).toBe(true)
    expect(result().members.value).toBeUndefined()
  })

  it('joins again as the new account when the account changes', async () => {
    host('doc:1')
    userId.value = 'u_grace'
    await nextTick()
    expect(started.map(entry => [entry.userId, entry.stopped])).toEqual([['u_ada', true], ['u_grace', false]])
  })

  it('waits for a room to be named', async () => {
    const room = ref('')
    host(room)
    expect(started).toHaveLength(0)
    room.value = 'doc:2'
    await nextTick()
    expect(started).toHaveLength(1)
  })

  it('leaves the room when the page goes', () => {
    const { wrapper } = host('doc:1')
    wrapper.unmount()
    expect(started[0]!.stopped).toBe(true)
  })

  it('does nothing without backend/presence.ts', () => {
    const { result } = host('doc:1', { withApi: false })
    expect(started).toHaveLength(0)
    expect(result().others.value).toEqual([])
  })
})
