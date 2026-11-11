import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { ConvexError } from 'convex/values'

// useInvite over a stand-in for `checkInvite`: an access link's token leaves
// the address at once, and a check that fails keeps it for the next try.

const checkCall = vi.fn(async (_args: { code: string }): Promise<{ status: string }> => ({ status: 'valid' }))
vi.mock('nuxt-convex-module/client', async original => ({
  ...await original<Record<string, unknown>>(),
  useMutation: () => checkCall,
}))

const { useInvite } = await import('../../src/runtime/vue/composables/use-access')
const { keptInvite, forgetInvite } = await import('../../src/runtime/vue/utils/kept-invite')
const { BackendApiKey } = await import('../../src/runtime/vue/utils/namespace')
const { ConvexAuthStateKey } = await import('nuxt-convex-module/client')

const provide = { [BackendApiKey as symbol]: { access: { checkInvite: 'access:checkInvite' } } }
const mounted: VueWrapper[] = []
function inSetup<T>(runner: () => T, extra: Record<symbol, unknown> = {}): T {
  let result: T
  mounted.push(mount(defineComponent({
    setup() {
      result = runner()
      return () => h('div')
    },
  }), { global: { provide: { ...provide, ...extra } } }) as VueWrapper)
  return result!
}

/** A session that settles when asked to: `isLoading` until `settle(signedIn)`. */
function session() {
  const isLoading = ref(true)
  const isAuthenticated = ref(false)
  return {
    provide: { [ConvexAuthStateKey as symbol]: { isLoading, isAuthenticated } },
    settle: (signedIn: boolean) => {
      isAuthenticated.value = signedIn
      isLoading.value = false
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  forgetInvite()
  window.history.replaceState(null, '', '/invite')
})
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
})

describe('useInvite', () => {
  it('keeps a link\'s token when its check fails, and checks it again on the next try', async () => {
    window.history.replaceState(null, '', '/invite#link-token')
    checkCall.mockRejectedValueOnce(new ConvexError({ code: 'rate_limited', retryAfter: 1000 }))
    const invite = inSetup(() => useInvite())
    expect(await invite.check()).toBeNull()
    // Gone from the address, kept for the tab.
    expect(window.location.hash).toBe('')
    expect(keptInvite()).toBe('link-token')
    expect(invite.isKept.value).toBe(true)

    expect(await invite.check()).toBe('valid')
    expect(checkCall.mock.calls.at(-1)![0]).toEqual({ code: 'link-token' })
    expect(keptInvite()).toBe('link-token')
  })

  it('opens an access link with fromAddress: the token leaves the address at once, and is checked once the session settles', async () => {
    window.history.replaceState(null, '', '/invite#link-token')
    const auth = session()
    const invite = inSetup(() => useInvite({ fromAddress: true }), auth.provide)
    await nextTick()
    expect(window.location.hash).toBe('')
    expect(keptInvite()).toBe('link-token')
    // Nothing is checked while the session is still settling.
    expect(checkCall).not.toHaveBeenCalled()
    expect(invite.linkChecked.value).toBe(false)
    auth.settle(false)
    await vi.waitFor(() => expect(invite.linkChecked.value).toBe(true))
    expect(checkCall).toHaveBeenCalledWith({ code: 'link-token' })
    expect(invite.asked.value).toBe(true)
    expect(invite.status.value).toBe('valid')
  })

  it('forgets a signed-in visitor\'s link without checking it, and asks nothing without a link', async () => {
    window.history.replaceState(null, '', '/invite#link-token')
    const member = session()
    const signedIn = inSetup(() => useInvite({ fromAddress: true }), member.provide)
    await nextTick()
    expect(window.location.hash).toBe('')
    member.settle(true)
    await vi.waitFor(() => expect(signedIn.linkChecked.value).toBe(true))
    expect(checkCall).not.toHaveBeenCalled()
    expect(keptInvite()).toBeNull()
    expect(signedIn.asked.value).toBe(false)

    const visitor = session()
    const blank = inSetup(() => useInvite({ fromAddress: true }), visitor.provide)
    visitor.settle(false)
    await vi.waitFor(() => expect(blank.linkChecked.value).toBe(true))
    expect(checkCall).not.toHaveBeenCalled()
    expect(blank.asked.value).toBe(false)
  })

  it('leaves the address alone without fromAddress, with nothing to open', () => {
    window.history.replaceState(null, '', '/invite#link-token')
    const invite = inSetup(() => useInvite())
    expect(invite.linkChecked.value).toBe(true)
    expect(window.location.hash).toBe('#link-token')
    expect(checkCall).not.toHaveBeenCalled()
  })

  it('drops it on a definite answer that it admits nobody', async () => {
    checkCall.mockResolvedValueOnce({ status: 'revoked' })
    const invite = inSetup(() => useInvite())
    expect(await invite.check('dead-code')).toBe('revoked')
    expect(keptInvite()).toBeNull()
    expect(invite.isKept.value).toBe(false)
  })
})
