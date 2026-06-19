import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { type Component, defineComponent, h, nextTick, provide } from 'vue'
import { makeFunctionReference } from 'convex/server'
import { ConvexClientKey, ConvexVueClient } from '../../src/runtime/vue/client'
import { silentConnectLogger } from '../helpers/silent-logger'
import { CheckoutLink, CustomerPortalLink } from '../../src/runtime/vue/billing'
import type { BillingApi } from '../../src/runtime/vue/composables/use-billing'
import { PolarEmbedCheckout } from '@polar-sh/checkout/embed'

// The embedded Polar checkout is loaded lazily via `import('@polar-sh/checkout/embed')`;
// mock it so no real SDK/DOM work runs.
vi.mock('@polar-sh/checkout/embed', () => ({
  PolarEmbedCheckout: {
    init: vi.fn(),
    create: vi.fn().mockResolvedValue(undefined),
  },
}))

const address = 'https://127.0.0.1:3001'
const checkoutRef = makeFunctionReference<'action'>('billing:generateCheckoutLink')
const portalRef = makeFunctionReference<'action'>('billing:generateCustomerPortalUrl')

let client: ConvexVueClient

beforeEach(() => {
  client = new ConvexVueClient(address, { logger: silentConnectLogger })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(PolarEmbedCheckout.init).mockClear()
  vi.mocked(PolarEmbedCheckout.create).mockClear()
})

function mountComponent(target: Component, props: Record<string, unknown>) {
  // Wrap the target so the Convex client is provided above it (the components
  // call `useAction` during setup), and give it a default slot.
  const Wrapper = defineComponent({
    setup() {
      provide(ConvexClientKey, client)
      return () => h(target, props, { default: () => 'Go' })
    },
  })
  return mountSuspended(Wrapper)
}

describe('CheckoutLink', () => {
  it('eagerly generates an embedded checkout link on mount', async () => {
    const api = { generateCheckoutLink: checkoutRef } as unknown as BillingApi
    const actionSpy = vi.spyOn(client, 'action').mockResolvedValue({ url: 'https://polar.test/checkout' })
    const wrapper = await mountComponent(CheckoutLink, { products: ['prod_1'], api })
    await flushPromises()
    await nextTick()

    const anchor = wrapper.find('a')
    expect(anchor.attributes('href')).toBe('https://polar.test/checkout')
    expect(anchor.attributes('data-polar-checkout')).toBe('')
    expect(anchor.attributes('data-polar-checkout-theme')).toBe('dark')
    expect(PolarEmbedCheckout.init).toHaveBeenCalled()
    expect(actionSpy).toHaveBeenCalledWith(checkoutRef, expect.objectContaining({ productIds: ['prod_1'] }))
  })

  it('renders a lazy placeholder and creates the embed on click', async () => {
    const api = { generateCheckoutLink: checkoutRef } as unknown as BillingApi
    const actionSpy = vi.spyOn(client, 'action').mockResolvedValue({ url: 'https://polar.test/lazy' })
    const wrapper = await mountComponent(CheckoutLink, { products: ['prod_1'], lazy: true, theme: 'light', api })
    await flushPromises()

    const anchor = wrapper.find('a')
    expect(anchor.attributes('href')).toBe('#')
    // lazy + embed default ⇒ no eager data-polar-checkout attribute
    expect(anchor.attributes('data-polar-checkout')).toBeUndefined()
    expect(actionSpy).not.toHaveBeenCalled() // nothing generated until click

    await anchor.trigger('click')
    await flushPromises()

    expect(actionSpy).toHaveBeenCalledWith(checkoutRef, expect.objectContaining({ productIds: ['prod_1'] }))
    expect(PolarEmbedCheckout.create).toHaveBeenCalledWith('https://polar.test/lazy', { theme: 'light' })
  })

  it('opens a new tab on lazy click when embed is disabled', async () => {
    const api = { generateCheckoutLink: checkoutRef } as unknown as BillingApi
    vi.spyOn(client, 'action').mockResolvedValue({ url: 'https://polar.test/redirect' })
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    const wrapper = await mountComponent(CheckoutLink, { products: ['prod_1'], lazy: true, embed: false, api })
    await flushPromises()

    await wrapper.find('a').trigger('click')
    await flushPromises()

    expect(openSpy).toHaveBeenCalledWith('https://polar.test/redirect', '_blank')
    expect(PolarEmbedCheckout.create).not.toHaveBeenCalled()
  })

  it('is inert when the billing namespace has no checkout action', async () => {
    const actionSpy = vi.spyOn(client, 'action')
    const wrapper = await mountComponent(CheckoutLink, { products: ['prod_1'], lazy: true, api: {} as BillingApi })
    await flushPromises()

    await wrapper.find('a').trigger('click')
    await flushPromises()

    expect(actionSpy).not.toHaveBeenCalled()
  })
})

describe('CustomerPortalLink', () => {
  it('renders nothing until the portal url resolves, then links out', async () => {
    const api = { generateCustomerPortalUrl: portalRef } as unknown as BillingApi
    let resolve!: (value: { url: string }) => void
    const pending = new Promise<{ url: string }>((r) => {
      resolve = r
    })
    vi.spyOn(client, 'action').mockReturnValue(pending)
    const wrapper = await mountComponent(CustomerPortalLink, { api })
    await flushPromises()

    expect(wrapper.find('a').exists()).toBe(false) // still loading

    resolve({ url: 'https://polar.test/portal' })
    await flushPromises()
    await nextTick()

    const anchor = wrapper.find('a')
    expect(anchor.exists()).toBe(true)
    expect(anchor.attributes('href')).toBe('https://polar.test/portal')
    expect(anchor.attributes('target')).toBe('_blank')
  })

  it('renders nothing when the portal action is not configured', async () => {
    const actionSpy = vi.spyOn(client, 'action')
    const wrapper = await mountComponent(CustomerPortalLink, { api: {} as BillingApi })
    await flushPromises()

    expect(wrapper.find('a').exists()).toBe(false)
    expect(actionSpy).not.toHaveBeenCalled()
  })
})
