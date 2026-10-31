import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick, shallowRef, watch } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

// <ConnectionStatus> beyond the contract (test/nuxt/component-contract.test.ts):
// a blip says nothing, a drop that lasts says so, offline says so at once,
// the waiting changes are counted, nothing renders before hydration, the
// client's connection is read but never opened, and the frame's own status
// steps aside for one the app placed.

type Socket = { isWebSocketConnected: boolean, hasEverConnected: boolean, connectionRetries: number, inflightMutations: number }
const UP: Socket = { isWebSocketConnected: true, hasEverConnected: true, connectionRetries: 0, inflightMutations: 0 }
const socket = shallowRef<Socket>(UP)

/**
 * The app's client as the base module builds it: its connection opens on the
 * first query, mutation or sign-in (`cachedSync`), and asking for its state
 * before then opens it too.
 */
function fakeClient(connected: boolean) {
  const client = {
    cachedSync: connected ? {} as object : undefined,
    opened: 0,
    connectionState: () => {
      if (!client.cachedSync) {
        client.cachedSync = {}
        client.opened++
      }
      return socket.value
    },
    subscribeToConnectionState: (callback: (state: Socket) => void) => {
      client.connectionState()
      return watch(socket, callback, { flush: 'sync' })
    },
  }
  return client
}

const client = shallowRef<ReturnType<typeof fakeClient> | undefined>()
vi.mock('../../src/runtime/vue/composables/base-aliases', () => ({
  useBackendClient: () => client.value,
}))

const { registerComponents } = await import('../helpers/register-components')
await registerComponents('ConnectionStatus', 'FrameConnectionStatus')
const { default: ConnectionStatus } = await import('../../src/runtime/vue/components/shell/ConnectionStatus.vue')
const { default: FrameConnectionStatus } = await import('../../src/runtime/vue/components/shell/FrameConnectionStatus.vue')

/** The browser going offline, or back: what `useOnline` listens to. */
function setOnline(online: boolean): void {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online)
  window.dispatchEvent(new Event(online ? 'online' : 'offline'))
}

let wrapper: VueWrapper | undefined
const status = () => wrapper!.find('[data-connection="status"]')

beforeEach(() => {
  vi.useFakeTimers()
  socket.value = UP
  client.value = fakeClient(true)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('<ConnectionStatus>', () => {
  it('says nothing while the connection is up, or on a first connection\'s first try', async () => {
    wrapper = mount(ConnectionStatus)
    await nextTick()
    expect(status().attributes('data-state')).toBe('online')
    expect(status().text()).toBe('')
    socket.value = { ...UP, isWebSocketConnected: false, hasEverConnected: false }
    await vi.advanceTimersByTimeAsync(5000)
    expect(status().text()).toBe('')
  })

  it('lets a blip pass, and says a drop that lasts the delay, with the changes waiting', async () => {
    wrapper = mount(ConnectionStatus, { props: { delay: 1000 } })
    await nextTick()
    socket.value = { ...UP, isWebSocketConnected: false, inflightMutations: 1 }
    await vi.advanceTimersByTimeAsync(600)
    socket.value = UP
    await vi.advanceTimersByTimeAsync(1000)
    expect(status().text()).toBe('')

    socket.value = { ...UP, isWebSocketConnected: false, inflightMutations: 2 }
    await vi.advanceTimersByTimeAsync(999)
    expect(status().text()).toBe('')
    await vi.advanceTimersByTimeAsync(1)
    expect(status().attributes('data-state')).toBe('reconnecting')
    expect(status().text()).toBe('Reconnecting… 2 changes are waiting to be sent.')

    // Back up: it goes quiet at once.
    socket.value = UP
    await nextTick()
    expect(status().text()).toBe('')
  })

  it('says a first connection that keeps failing', async () => {
    wrapper = mount(ConnectionStatus, { props: { delay: 0 } })
    await nextTick()
    socket.value = { ...UP, isWebSocketConnected: false, hasEverConnected: false, connectionRetries: 3 }
    await nextTick()
    expect(status().text()).toBe('Reconnecting…')
  })

  it('says offline at once, whatever the delay', async () => {
    wrapper = mount(ConnectionStatus, { props: { delay: 60_000 } })
    await nextTick()
    setOnline(false)
    socket.value = { ...UP, isWebSocketConnected: false, inflightMutations: 1 }
    await nextTick()
    expect(status().attributes('data-state')).toBe('offline')
    expect(status().text()).toBe('You\'re offline. 1 change is waiting to be sent.')
    setOnline(true)
    socket.value = UP
    await nextTick()
    expect(status().text()).toBe('')
  })

  it('reads nothing before it is mounted, so a server render and its hydration agree', () => {
    socket.value = { ...UP, isWebSocketConnected: false }
    // The first render, before the mount re-renders it: what a server render shows.
    wrapper = mount(ConnectionStatus, { props: { delay: 0 } })
    expect(wrapper.html()).toContain('data-state="online"')
  })

  it('stays quiet in an app with no backend client to read', async () => {
    client.value = undefined
    wrapper = mount(ConnectionStatus, { props: { delay: 0 } })
    await flushPromises()
    expect(status().attributes('data-state')).toBe('online')
  })

  it('never opens the client\'s connection, and reads it once the client has one', async () => {
    // A signed-out visitor on a page that runs nothing: no socket to read.
    const idle = fakeClient(false)
    client.value = idle
    wrapper = mount(ConnectionStatus, { props: { delay: 0 } })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(idle.opened).toBe(0)
    expect(idle.cachedSync).toBeUndefined()
    expect(status().text()).toBe('')

    // A query opens it; the status follows within a second, and says a drop.
    idle.cachedSync = {}
    await vi.advanceTimersByTimeAsync(1000)
    socket.value = { ...UP, isWebSocketConnected: false }
    await nextTick()
    expect(status().text()).toBe('Reconnecting…')
    expect(idle.opened).toBe(0)
  })

  it('hands its slot the status in every state, for an indicator of the app\'s own', async () => {
    wrapper = mount(ConnectionStatus, {
      props: { delay: 0 },
      slots: { default: ({ status, pendingChanges }: { status: string, pendingChanges: number }) => h('i', `${status}:${pendingChanges}`) },
    })
    await nextTick()
    expect(status().text()).toBe('online:0')
    socket.value = { ...UP, isWebSocketConnected: false, inflightMutations: 3 }
    await nextTick()
    expect(status().text()).toBe('reconnecting:3')
  })
})

describe('the frame\'s own status', () => {
  it('says a drop on a page where the app shows no status of its own', async () => {
    wrapper = mount(FrameConnectionStatus)
    await nextTick()
    socket.value = { ...UP, isWebSocketConnected: false }
    await vi.advanceTimersByTimeAsync(1500)
    expect(status().text()).toBe('Reconnecting…')
  })

  it('steps aside while the app shows one, in a layout around the page, so a drop is said once', async () => {
    const layout = shallowRef(true)
    wrapper = mount({
      render: () => h('div', [h(FrameConnectionStatus), layout.value ? h(ConnectionStatus, { delay: 0 }) : null]),
    })
    await nextTick()
    socket.value = { ...UP, isWebSocketConnected: false }
    await vi.advanceTimersByTimeAsync(1500)
    const [frame, placed] = wrapper.findAll('[data-connection="status"]')
    expect(placed!.text()).toBe('Reconnecting…')
    // The frame's live region stays mounted, and empty.
    expect(frame!.attributes('role')).toBe('status')
    expect(frame!.text()).toBe('')

    // The app's goes (another layout): the frame's speaks again.
    layout.value = false
    await nextTick()
    expect(wrapper.findAll('[data-connection="status"]')).toHaveLength(1)
    expect(status().text()).toBe('Reconnecting…')
  })
})
