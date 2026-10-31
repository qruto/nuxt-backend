import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { createBackendMock } from '../../src/runtime/test-utils'
import { usePushSubscription } from '../../src/runtime/vue/composables/use-push-subscription'

// usePushSubscription on the backend mock, with the browser's push and
// service worker APIs stood in for: a device subscribes through the module's
// worker, under its own scope, and hands its endpoint and keys over; it
// unsubscribes on both sides. The app may hold a worker of its own at `/`.

const PUBLIC_KEY = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8'

let backend: ReturnType<typeof createBackendMock>
type Subscription = { endpoint: string, options: { applicationServerKey: ArrayBuffer }, toJSON: () => unknown, unsubscribe: () => Promise<boolean> }

let current: Subscription | null
const register = vi.fn()
/** The app's own worker at `/`, with a push manager the module must never touch. */
const appPushManager = { getSubscription: vi.fn(async () => null), subscribe: vi.fn() }

/** A base64url key as the bytes a subscription's options hold. */
const keyBytes = (key: string): ArrayBuffer => Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)).buffer

function subscription(key: string, endpoint = 'https://fcm.googleapis.com/fcm/send/device-1'): Subscription {
  const made: Subscription = {
    endpoint,
    options: { applicationServerKey: keyBytes(key) },
    toJSON: () => ({ endpoint, keys: { p256dh: 'BKey', auth: 'secret' } }),
    unsubscribe: vi.fn(async () => {
      current = null
      return true
    }),
  }
  return made
}

function stubBrowser(permission: NotificationPermission, { appWorker = false } = {}) {
  current = null
  const pushManager = {
    getSubscription: vi.fn(async () => current),
    subscribe: vi.fn(async ({ applicationServerKey }: { applicationServerKey: string }) => {
      expect(applicationServerKey).toBe(PUBLIC_KEY)
      current = subscription(PUBLIC_KEY)
      return current
    }),
  }
  let registered = false
  register.mockImplementation(async () => {
    registered = true
    return { active: {}, pushManager }
  })
  vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn(async () => permission) })
  vi.stubGlobal('PushManager', function PushManager() {})
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      register,
      // `getRegistration()` would answer the app's worker at `/` for the push scope too: the module never asks it.
      getRegistration: vi.fn(async () => { throw new Error('matched by the longest scope') }),
      getRegistrations: vi.fn(async () => [
        ...appWorker ? [{ scope: `${location.origin}/`, active: {}, pushManager: appPushManager }] : [],
        ...registered ? [{ scope: `${location.origin}/_backend/push/`, active: {}, pushManager }] : [],
      ]),
    },
  })
}

beforeEach(() => {
  backend = createBackendMock({ user: { name: 'Ada' } })
  backend.stub('notifications:getPushConfig', () => ({ publicKey: PUBLIC_KEY }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'serviceWorker')
})

async function mounted() {
  let state: ReturnType<typeof usePushSubscription> | undefined
  await mountSuspended(defineComponent({
    setup() {
      state = usePushSubscription()
      return () => h('div')
    },
  }))
  await flushPromises()
  return state!
}

describe('usePushSubscription', () => {
  it('subscribes this device through the module\'s worker, and hands its endpoint and keys over', async () => {
    stubBrowser('granted')
    const subscribed = vi.fn(() => null)
    backend.stub('notifications:subscribePush', subscribed)
    const push = await mounted()
    expect(push.isSupported.value).toBe(true)
    expect(push.isSubscribed.value).toBe(false)
    expect(await push.subscribe()).toBe(true)
    expect(register).toHaveBeenCalledWith('/_backend/push/worker.js', { scope: '/_backend/push/' })
    expect(subscribed).toHaveBeenCalledWith({ endpoint: 'https://fcm.googleapis.com/fcm/send/device-1', p256dh: 'BKey', auth: 'secret' })
    expect(push.isSubscribed.value).toBe(true)
    expect(push.permission.value).toBe('granted')
  })

  it('stops on a refused permission, and subscribes nothing', async () => {
    stubBrowser('denied')
    const subscribed = vi.fn(() => null)
    backend.stub('notifications:subscribePush', subscribed)
    const push = await mounted()
    expect(await push.subscribe()).toBe(false)
    expect(push.permission.value).toBe('denied')
    expect(subscribed).not.toHaveBeenCalled()
  })

  it('unsubscribes on the deployment and in the browser', async () => {
    stubBrowser('granted')
    backend.stub('notifications:subscribePush', () => null)
    const unsubscribed = vi.fn(() => null)
    backend.stub('notifications:unsubscribePush', unsubscribed)
    const push = await mounted()
    await push.subscribe()
    await push.unsubscribe()
    expect(unsubscribed).toHaveBeenCalledWith({ endpoint: 'https://fcm.googleapis.com/fcm/send/device-1' })
    expect(current).toBeNull()
    expect(push.isSubscribed.value).toBe(false)
  })

  it('registers its own worker beside the app\'s worker at /, and never subscribes through that one', async () => {
    stubBrowser('granted', { appWorker: true })
    backend.stub('notifications:subscribePush', () => null)
    const push = await mounted()
    expect(push.isSubscribed.value).toBe(false)
    expect(await push.subscribe()).toBe(true)
    expect(register).toHaveBeenCalledWith('/_backend/push/worker.js', { scope: '/_backend/push/' })
    expect(appPushManager.subscribe).not.toHaveBeenCalled()
  })

  it('drops a subscription made under another key, and subscribes again under the deployment\'s', async () => {
    stubBrowser('granted')
    const subscribed = vi.fn(() => null)
    backend.stub('notifications:subscribePush', subscribed)
    const push = await mounted()
    await push.subscribe()
    const stale = subscription('BOld' + PUBLIC_KEY.slice(4), 'https://fcm.googleapis.com/fcm/send/stale')
    current = stale
    await push.subscribe()
    expect(stale.unsubscribe).toHaveBeenCalled()
    expect(subscribed).toHaveBeenLastCalledWith({ endpoint: 'https://fcm.googleapis.com/fcm/send/device-1', p256dh: 'BKey', auth: 'secret' })
  })

  it('reads unsupported while the deployment has no key pair', async () => {
    stubBrowser('granted')
    backend.stub('notifications:getPushConfig', () => ({ publicKey: null }))
    const push = await mounted()
    expect(push.isSupported.value).toBe(false)
    expect(push.needsInstall.value).toBe(false)
  })
})
