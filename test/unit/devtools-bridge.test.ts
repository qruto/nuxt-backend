import { describe, expect, it, vi } from 'vitest'
import { createBackendDevtoolsBridge } from '../../src/runtime/devtools/bridge'

const nextMicrotask = () => new Promise<void>(resolve => queueMicrotask(resolve))

describe('createBackendDevtoolsBridge', () => {
  it('starts with an empty-but-shaped snapshot', () => {
    const bridge = createBackendDevtoolsBridge()
    expect(bridge.version).toBe(1)
    expect(bridge.getSnapshot()).toEqual({
      identity: { available: false },
      billing: { isLoading: true },
      features: { isLoading: true, keys: [] },
      credits: [],
      workspace: { available: false },
      webhooks: [],
      convexConnected: null,
    })
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

    bridge.patch('convexConnected', true)
    bridge.patch('credits', [{ meterId: 'm', balance: 3, credited: 5, consumed: 2 }])
    expect(handler).not.toHaveBeenCalled()

    await nextMicrotask()
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      convexConnected: true,
      credits: [{ meterId: 'm', balance: 3, credited: 5, consumed: 2 }],
    }))
  })

  it('unsubscribing stops further events', async () => {
    const bridge = createBackendDevtoolsBridge()
    const handler = vi.fn()
    const off = bridge.on('snapshot', handler)

    bridge.patch('convexConnected', false)
    await nextMicrotask()
    expect(handler).toHaveBeenCalledTimes(1)

    off()
    bridge.patch('convexConnected', true)
    await nextMicrotask()
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
