import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { computed, defineComponent, h, provide } from 'vue'
import { makeFunctionReference } from 'convex/server'
import { ConvexClientKey, ConvexVueClient } from 'nuxt-convex-module/client'
import { silentConnectLogger } from '../helpers/silent-logger'
import { openProviderUrl } from '../../src/runtime/vue/utils/open-url'
import type { BillingApi } from '../../src/runtime/vue/composables/use-billing'
import { registerComponents } from '../helpers/register-components'

await registerComponents('BillingCheckoutLink', 'BillingPortalLink', 'PricingEmailOptOut')
// After the registration, as the module registers them: the checkout link renders the soft opt-in part by name.
const { default: BillingCheckoutLink } = await import('../../src/runtime/vue/components/billing/BillingCheckoutLink.vue')
const { default: BillingPortalLink } = await import('../../src/runtime/vue/components/billing/BillingPortalLink.vue')

// The billing links are the package's own, bound to its checkout and portal
// actions: a provider session is created when the link is clicked, never
// when it renders, and a refusal comes back as an `error` event.

// Where the provider's page opens: the same tab by default.
vi.mock('../../src/runtime/vue/utils/open-url', () => ({ openProviderUrl: vi.fn() }))
// The soft opt-in part reads its words through the app's labels, which would pull in the app's auth client.
vi.mock('nuxt-convex-module/better-auth/client', async () => ({
  resolveAuthRedirect: (await import('../../node_modules/nuxt-convex-module/dist/runtime/better-auth/vue/redirect.js')).resolveAuthRedirect,
  useBetterAuth: () => ({ session: computed(() => ({ data: null })) }),
}))

const checkoutRef = makeFunctionReference<'action'>('billing:generateCheckoutLink')
const portalRef = makeFunctionReference<'action'>('billing:generateCustomerPortalUrl')
const api = { generateCheckoutLink: checkoutRef, generateCustomerPortalUrl: portalRef } as unknown as BillingApi

let client: ConvexVueClient

beforeEach(() => {
  client = new ConvexVueClient('https://127.0.0.1:3001', { logger: silentConnectLogger })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(openProviderUrl).mockClear()
})

/** Render a link inside a tree that provides the backend client. */
function render(component: typeof BillingCheckoutLink | typeof BillingPortalLink, props: Record<string, unknown>) {
  return mount(defineComponent({
    setup() {
      provide(ConvexClientKey, client)
      return () => h(component as never, { api, ...props }, { default: ({ pending }: { pending: boolean }) => (pending ? 'Opening…' : 'Open') })
    },
  }))
}

describe('<BillingCheckoutLink>', () => {
  it('creates the checkout on click only, with the page to return to, and opens it', async () => {
    const action = vi.spyOn(client, 'action').mockResolvedValue({ url: 'https://checkout.test/1' })
    const wrapper = render(BillingCheckoutLink, { productIds: ['prod_pro'], utm: { source: 'newsletter' } })
    await flushPromises()
    expect(action).not.toHaveBeenCalled()
    expect(wrapper.text()).toBe('Open')

    await wrapper.find('a').trigger('click')
    await flushPromises()

    expect(action).toHaveBeenCalledWith(checkoutRef, expect.objectContaining({
      productIds: ['prod_pro'],
      origin: window.location.origin,
      successUrl: window.location.href,
      utm: { source: 'newsletter' },
    }))
    // The same tab: a tab opened after the wait is what popup blockers stop.
    expect(openProviderUrl).toHaveBeenCalledWith('https://checkout.test/1', true)
  })

  it('opens a new tab only when asked', async () => {
    vi.spyOn(client, 'action').mockResolvedValue({ url: 'https://checkout.test/1' })
    const wrapper = render(BillingCheckoutLink, { productIds: ['prod_pro'], redirect: false })
    await wrapper.find('a').trigger('click')
    await flushPromises()
    expect(openProviderUrl).toHaveBeenCalledWith('https://checkout.test/1', false)
  })

  it('is busy while the session is created, and ignores a second click', async () => {
    let finish!: (value: unknown) => void
    const action = vi.spyOn(client, 'action').mockReturnValue(new Promise((resolve) => {
      finish = resolve
    }) as never)
    const wrapper = render(BillingCheckoutLink, { productIds: 'prod_pro' })

    await wrapper.find('a').trigger('click')
    await wrapper.find('a').trigger('click')
    expect(wrapper.find('a').attributes('aria-busy')).toBe('true')
    expect(wrapper.text()).toBe('Opening…')
    expect(action).toHaveBeenCalledTimes(1)

    finish({ url: 'https://checkout.test/1' })
    await flushPromises()
    expect(wrapper.find('a').attributes('aria-busy')).toBeUndefined()
  })

  it('emits a refusal as error instead of throwing it', async () => {
    const refusal = new Error('refused')
    vi.spyOn(client, 'action').mockRejectedValue(refusal)
    const wrapper = mount(defineComponent({
      setup(_, { expose }) {
        provide(ConvexClientKey, client)
        const errors: unknown[] = []
        expose({ errors })
        return () => h(BillingCheckoutLink, { api, productIds: ['prod_pro'], onError: (error: unknown) => errors.push(error) })
      },
    }))

    await wrapper.find('a').trigger('click')
    await flushPromises()

    expect((wrapper.vm as unknown as { errors: unknown[] }).errors).toEqual([refusal])
  })
})

describe('<BillingPortalLink>', () => {
  it('opens the portal on click only, returning to the given page on the site', async () => {
    const action = vi.spyOn(client, 'action').mockResolvedValue({ url: 'https://portal.test/session' })
    const wrapper = render(BillingPortalLink, { returnUrl: '/app/billing' })
    await flushPromises()
    expect(action).not.toHaveBeenCalled()

    await wrapper.find('a').trigger('click')
    await flushPromises()

    expect(action).toHaveBeenCalledWith(portalRef, { returnUrl: new URL('/app/billing', window.location.href).href })
    expect(openProviderUrl).toHaveBeenCalledWith('https://portal.test/session', true)
  })
})

describe('a caller the server says manages no billing', () => {
  it('sees neither link', async () => {
    const accessRef = makeFunctionReference<'query'>('billing:getBillingAccess')
    // What `getBillingAccess` answers a workspace member who is neither its owner nor an admin.
    void client.mutation(makeFunctionReference<'mutation'>('seed:default'), {}, { optimisticUpdate: store => store.setQuery(accessRef, {}, { canManage: false }) })
    for (const component of [BillingCheckoutLink, BillingPortalLink]) {
      const wrapper = render(component, { productIds: ['prod_pro'], api: { ...api, getBillingAccess: accessRef } })
      await flushPromises()
      expect(wrapper.find('a').exists()).toBe(false)
    }
  })
})
