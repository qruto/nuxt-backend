import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref, type EffectScope } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { watchPushSignOut } from '../../src/runtime/vue/utils/push-device'

// The push sign-out watch on a browser that takes Declarative Web Push (a
// push manager on the window), with the session underneath as a stand-in:
// what the auth server last answered (a session id, `null` for signed
// out, `undefined` while the answer is pending), as Better Auth's
// `useSession()` state.

const unsubscribe = vi.fn(async () => true)
const session = ref<string | null | undefined>('session-1')
let scope: EffectScope

/** The Better Auth session state the watch reads. */
const state = () => session.value === undefined
  ? { isPending: true, data: null }
  : { isPending: false, data: session.value === null ? null : { session: { id: session.value }, user: { id: 'user-1' } } }

async function settle(value: string | null | undefined): Promise<void> {
  session.value = value
  await nextTick()
  await flushPromises()
}

beforeEach(() => {
  unsubscribe.mockClear()
  ;(window as Window & { pushManager?: unknown }).pushManager = { getSubscription: async () => ({ unsubscribe }) }
  session.value = 'session-1'
  scope = effectScope()
  scope.run(() => watchPushSignOut(state))
})

afterEach(() => {
  scope.stop()
  delete (window as Window & { pushManager?: unknown }).pushManager
})

describe('watchPushSignOut', () => {
  it('drops this device\'s subscription when the session signs out', async () => {
    await settle(null)
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('keeps it through a pending answer and a new session id: a token refresh, an administrator\'s visit', async () => {
    await settle(undefined)
    await settle('session-1')
    await settle('session-2')
    await settle(undefined)
    await settle('session-2')
    expect(unsubscribe).not.toHaveBeenCalled()
  })

  it('drops nothing for a session that was signed out from the start', async () => {
    scope.stop()
    session.value = null
    scope = effectScope()
    scope.run(() => watchPushSignOut(state))
    await settle(undefined)
    await settle(null)
    expect(unsubscribe).not.toHaveBeenCalled()
  })
})

describe('watchDevicePushSignOut', () => {
  // A fresh module each time: the watch starts once per page.
  async function load() {
    vi.resetModules()
    return (await import('../../src/runtime/vue/utils/push-device')).watchDevicePushSignOut
  }

  it('starts nothing on a device that holds no subscription', async () => {
    ;(window as Window & { pushManager?: unknown }).pushManager = { getSubscription: async () => null }
    const run = vi.fn()
    const client = vi.fn(async () => ({ useBetterAuth: () => ({ session: { value: { isPending: false, data: null } } }) }))
    await (await load())(run, client)
    expect(run).not.toHaveBeenCalled()
    expect(client).not.toHaveBeenCalled()
  })

  it('starts once on a device that holds one, however often it is asked', async () => {
    const watchDevicePushSignOut = await load()
    const run = vi.fn()
    const client = vi.fn(async () => ({ useBetterAuth: () => ({ session: { value: { isPending: false, data: null } } }) }))
    await Promise.all([watchDevicePushSignOut(run, client), watchDevicePushSignOut(run, client)])
    await watchDevicePushSignOut(run, client)
    expect(run).toHaveBeenCalledTimes(1)
    expect(client).toHaveBeenCalledTimes(1)
  })
})
