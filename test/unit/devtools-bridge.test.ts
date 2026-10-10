import { describe, expect, it, vi } from 'vitest'
import { createBackendDevtoolsBridge } from '../../src/runtime/devtools/bridge'

const nextMicrotask = () => new Promise<void>(resolve => queueMicrotask(resolve))

describe('createBackendDevtoolsBridge', () => {
  it('starts with an empty-but-shaped snapshot', () => {
    const bridge = createBackendDevtoolsBridge()
    expect(bridge.version).toBe(3)
    expect(bridge.getSnapshot()).toEqual({
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
    })
  })

  it('activates once, on the panel\'s first visit', async () => {
    const activate = vi.fn()
    const bridge = createBackendDevtoolsBridge({ activate })
    const handler = vi.fn()
    bridge.on('snapshot', handler)

    bridge.activate()
    bridge.activate()
    expect(activate).toHaveBeenCalledTimes(1)
    expect(bridge.getSnapshot().active).toBe(true)
    await nextMicrotask()
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ active: true }))
  })

  it('records changes after a section\'s first value, and tells the listeners', () => {
    const bridge = createBackendDevtoolsBridge()
    const listener = vi.fn()
    bridge.onActivity(listener)

    // The first value is the baseline: a session that existed is not a sign-in.
    bridge.patch('identity', { available: true, isLoading: false, isAuthenticated: true, email: 'ada@example.com', id: 'u1' })
    expect(bridge.getSnapshot().activity).toEqual([])

    bridge.patch('identity', { available: true, isLoading: false, isAuthenticated: false })
    const [event] = bridge.getSnapshot().activity
    expect(event).toMatchObject({ id: 1, kind: 'auth', level: 'info', title: 'Signed out', detail: 'ada@example.com' })
    expect(event!.at).toEqual(expect.any(Number))
    expect(listener).toHaveBeenCalledWith(event)

    // Unsubscribed, a listener hears nothing more.
    const gone = vi.fn()
    const off = bridge.onActivity(gone)
    off()
    bridge.patch('identity', { available: true, isLoading: false, isAuthenticated: true, email: 'ada@example.com', id: 'u1' })
    expect(bridge.getSnapshot().activity).toHaveLength(2)
    expect(gone).toHaveBeenCalledOnce() // the entry kept from before it subscribed
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('replays what it kept to a listener that subscribes late', () => {
    const bridge = createBackendDevtoolsBridge()
    bridge.patch('connection', 'connected')
    bridge.patch('connection', 'reconnecting')
    const late = vi.fn()
    bridge.onActivity(late)
    expect(late).toHaveBeenCalledWith(expect.objectContaining({ title: 'Connection lost, reconnecting' }))
    bridge.patch('connection', 'connected')
    expect(late).toHaveBeenCalledTimes(2)
  })

  it('compares with the last settled value, so a change made through a loading state is told', () => {
    const bridge = createBackendDevtoolsBridge()
    // Loading values are not answers: the first settled one is the baseline.
    bridge.patch('identity', { available: true, isLoading: true })
    bridge.patch('identity', { available: true, isLoading: false, isAuthenticated: false })
    expect(bridge.getSnapshot().activity).toEqual([])

    // Signing in refetches the session.
    bridge.patch('identity', { available: true, isLoading: true, isAuthenticated: false })
    bridge.patch('identity', { available: true, isLoading: false, isAuthenticated: true, email: 'ada@example.com', id: 'u1' })
    expect(bridge.getSnapshot().activity.map(event => event.title)).toEqual(['Signed in'])
  })

  it('keeps the last 200 entries', () => {
    const bridge = createBackendDevtoolsBridge()
    bridge.patch('connection', 'connected')
    for (let i = 0; i < 150; i++) {
      bridge.patch('connection', 'reconnecting')
      bridge.patch('connection', 'connected')
    }
    const { activity } = bridge.getSnapshot()
    expect(activity).toHaveLength(200)
    expect(activity.at(-1)!.id).toBe(300)
    expect(activity[0]!.id).toBe(101)
  })

  it('patch replaces one section immutably', () => {
    const bridge = createBackendDevtoolsBridge()
    const before = bridge.getSnapshot()

    bridge.patch('identity', { available: true, isAuthenticated: true, email: 'a@b.c' })

    const after = bridge.getSnapshot()
    expect(after).not.toBe(before)
    expect(after.identity).toEqual({ available: true, isAuthenticated: true, email: 'a@b.c' })
    // Untouched sections carry over; the pre-patch snapshot stays frozen in time.
    expect(after.billing).toBe(before.billing)
    expect(before.identity).toEqual({ available: false })
  })

  it('coalesces a burst of patches into one snapshot event per microtask', async () => {
    const bridge = createBackendDevtoolsBridge()
    const handler = vi.fn()
    bridge.on('snapshot', handler)

    bridge.patch('connection', 'connected')
    bridge.patch('credits', [{ meterId: 'm', balance: 3, credited: 5, consumed: 2 }])
    expect(handler).not.toHaveBeenCalled()

    await nextMicrotask()
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      connection: 'connected',
      credits: [{ meterId: 'm', balance: 3, credited: 5, consumed: 2 }],
    }))
  })

  it('unsubscribing stops further events', async () => {
    const bridge = createBackendDevtoolsBridge()
    const handler = vi.fn()
    const off = bridge.on('snapshot', handler)

    bridge.patch('connection', 'reconnecting')
    await nextMicrotask()
    expect(handler).toHaveBeenCalledTimes(1)

    off()
    bridge.patch('connection', 'connected')
    await nextMicrotask()
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
