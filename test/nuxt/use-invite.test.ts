import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
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

const provide = { [BackendApiKey as symbol]: { access: { checkInvite: 'access:checkInvite' } } }
const mounted: VueWrapper[] = []
function inSetup<T>(runner: () => T): T {
  let result: T
  mounted.push(mount(defineComponent({
    setup() {
      result = runner()
      return () => h('div')
    },
  }), { global: { provide } }) as VueWrapper)
  return result!
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

  it('drops it on a definite answer that it admits nobody', async () => {
    checkCall.mockResolvedValueOnce({ status: 'revoked' })
    const invite = inSetup(() => useInvite())
    expect(await invite.check('dead-code')).toBe('revoked')
    expect(keptInvite()).toBeNull()
    expect(invite.isKept.value).toBe(false)
  })
})
