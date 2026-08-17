import { beforeEach, describe, expect, it, vi } from 'vitest'
import { metersCreate } from '@polar-sh/sdk/funcs/metersCreate.js'
import { metersList } from '@polar-sh/sdk/funcs/metersList.js'
import { benefitsCreate } from '@polar-sh/sdk/funcs/benefitsCreate.js'
import { benefitsList } from '@polar-sh/sdk/funcs/benefitsList.js'
import { productsCreate } from '@polar-sh/sdk/funcs/productsCreate.js'
import { productsList } from '@polar-sh/sdk/funcs/productsList.js'
import { productsUpdateBenefits } from '@polar-sh/sdk/funcs/productsUpdateBenefits.js'
import { webhooksCreateWebhookEndpoint } from '@polar-sh/sdk/funcs/webhooksCreateWebhookEndpoint.js'
import { webhooksListWebhookEndpoints } from '@polar-sh/sdk/funcs/webhooksListWebhookEndpoints.js'
import { syncBillingCatalog } from '../../src/cli/billing'
import { BILLING_WEBHOOK_PROVISION_EVENTS } from '../../src/convex/catalog'
import { BILLING_REFRESH_EVENTS } from '../../src/convex/integrations/billing'
import type { BillingCatalog } from '../../src/convex/catalog'

vi.mock('@polar-sh/sdk/funcs/metersCreate.js', () => ({ metersCreate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/metersList.js', () => ({ metersList: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/benefitsCreate.js', () => ({ benefitsCreate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/benefitsList.js', () => ({ benefitsList: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/productsCreate.js', () => ({ productsCreate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/productsList.js', () => ({ productsList: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/productsUpdateBenefits.js', () => ({ productsUpdateBenefits: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/webhooksCreateWebhookEndpoint.js', () => ({ webhooksCreateWebhookEndpoint: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/webhooksListWebhookEndpoints.js', () => ({ webhooksListWebhookEndpoints: vi.fn() }))

const emptyPage = { ok: true, value: { result: { items: [], pagination: { maxPage: 1 } } } }
const page = (items: unknown[]) => ({ ok: true, value: { result: { items, pagination: { maxPage: 1 } } } })

const catalog: BillingCatalog = {
  meters: { credits: {} },
  plans: {
    pro: { name: 'Pro', interval: 'month', price: 2900, credits: { meter: 'credits', units: 500 }, features: ['priority_support'] },
  },
  packs: {
    credits500: { name: '500 credits', price: 2000, credits: { meter: 'credits', units: 500 } },
  },
  features: { priority_support: { description: 'Priority support' } },
}

const options = { rootDir: '/tmp/x', environment: 'sandbox' as const, accessToken: 'tok', dryRun: false, adopt: {} }
const fakeClient = {} as never

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(metersList).mockResolvedValue(emptyPage as never)
  vi.mocked(benefitsList).mockResolvedValue(emptyPage as never)
  vi.mocked(productsList).mockResolvedValue(emptyPage as never)
  vi.mocked(webhooksListWebhookEndpoints).mockResolvedValue(emptyPage as never)
})

describe('syncBillingCatalog', () => {
  it('creates meters, benefits, and products with managed tags and attaches benefits', async () => {
    vi.mocked(metersCreate).mockResolvedValue({ ok: true, value: { id: 'mtr_1' } } as never)
    let benefitCount = 0
    vi.mocked(benefitsCreate).mockImplementation((async () => ({ ok: true, value: { id: `ben_${++benefitCount}` } })) as never)
    let productCount = 0
    vi.mocked(productsCreate).mockImplementation((async () => ({ ok: true, value: { id: `prod_${++productCount}` } })) as never)
    vi.mocked(productsUpdateBenefits).mockResolvedValue({ ok: true, value: {} } as never)

    const result = await syncBillingCatalog(catalog, options, fakeClient)

    // Sum meter by default, filtering on the event name (= catalog key).
    expect(metersCreate).toHaveBeenCalledWith(fakeClient, expect.objectContaining({
      name: 'credits',
      aggregation: { func: 'sum', property: 'amount' },
      filter: { conjunction: 'and', clauses: [{ property: 'name', operator: 'eq', value: 'credits' }] },
      metadata: { managedBy: 'nuxt-backend', key: 'credits' },
    }))
    // Plan credits: per-cycle grant, no rollover by default; pack: rollover.
    expect(benefitsCreate).toHaveBeenCalledWith(fakeClient, expect.objectContaining({
      type: 'meter_credit',
      properties: { units: 500, rollover: false, meterId: 'mtr_1' },
      metadata: { managedBy: 'nuxt-backend', key: 'pro-credits' },
    }))
    expect(benefitsCreate).toHaveBeenCalledWith(fakeClient, expect.objectContaining({
      properties: { units: 500, rollover: true, meterId: 'mtr_1' },
      metadata: { managedBy: 'nuxt-backend', key: 'credits500-credits' },
    }))
    expect(productsCreate).toHaveBeenCalledWith(fakeClient, expect.objectContaining({
      name: 'Pro',
      recurringInterval: 'month',
      prices: [{ amountType: 'fixed', priceAmount: 2900 }],
    }))
    expect(productsCreate).toHaveBeenCalledWith(fakeClient, expect.objectContaining({
      name: '500 credits',
      recurringInterval: null,
    }))
    // The plan carries its credit benefit + the feature benefit.
    expect(productsUpdateBenefits).toHaveBeenCalledWith(fakeClient, expect.objectContaining({
      id: 'prod_1',
      productBenefitsUpdate: { benefits: expect.arrayContaining(['ben_2']) },
    }))
    expect(result.ids.meters.credits).toEqual({ meterId: 'mtr_1', eventName: 'credits', property: 'amount' })
    expect(Object.keys(result.ids.products)).toEqual(['pro', 'credits500'])
  })

  it('is idempotent: a second run finds everything by tag and creates nothing', async () => {
    vi.mocked(metersList).mockResolvedValue(page([{ id: 'mtr_1', metadata: { managedBy: 'nuxt-backend', key: 'credits' } }]) as never)
    vi.mocked(benefitsList).mockResolvedValue(page([
      { id: 'ben_f', metadata: { managedBy: 'nuxt-backend', key: 'priority_support' } },
      { id: 'ben_p', metadata: { managedBy: 'nuxt-backend', key: 'pro-credits' } },
      { id: 'ben_c', metadata: { managedBy: 'nuxt-backend', key: 'credits500-credits' } },
    ]) as never)
    vi.mocked(productsList).mockResolvedValue(page([
      { id: 'prod_pro', metadata: { managedBy: 'nuxt-backend', key: 'pro' } },
      { id: 'prod_pack', metadata: { managedBy: 'nuxt-backend', key: 'credits500' } },
    ]) as never)

    const result = await syncBillingCatalog(catalog, options, fakeClient)

    expect(metersCreate).not.toHaveBeenCalled()
    expect(benefitsCreate).not.toHaveBeenCalled()
    expect(productsCreate).not.toHaveBeenCalled()
    expect(result.ids.products).toEqual({ pro: 'prod_pro', credits500: 'prod_pack' })
    expect(result.log.every(entry => entry.action === 'exists')).toBe(true)
  })

  it('adopts existing products as-is: recorded, benefits untouched', async () => {
    vi.mocked(metersCreate).mockResolvedValue({ ok: true, value: { id: 'mtr_1' } } as never)
    vi.mocked(benefitsCreate).mockResolvedValue({ ok: true, value: { id: 'ben_x' } } as never)
    vi.mocked(productsCreate).mockResolvedValue({ ok: true, value: { id: 'prod_new' } } as never)
    vi.mocked(productsUpdateBenefits).mockResolvedValue({ ok: true, value: {} } as never)

    const result = await syncBillingCatalog(catalog, { ...options, adopt: { pro: 'prod_existing' } }, fakeClient)

    expect(result.ids.products.pro).toBe('prod_existing')
    // Only the pack was created; the adopted plan got no benefit attachment.
    expect(productsCreate).toHaveBeenCalledTimes(1)
    expect(vi.mocked(productsUpdateBenefits).mock.calls.every(([, args]) => (args as { id: string }).id !== 'prod_existing')).toBe(true)
  })

  it('dry run plans without creating and skips id recording', async () => {
    const result = await syncBillingCatalog(catalog, { ...options, dryRun: true, webhookUrl: 'https://x.convex.site/billing/events' }, fakeClient)

    expect(metersCreate).not.toHaveBeenCalled()
    expect(benefitsCreate).not.toHaveBeenCalled()
    expect(productsCreate).not.toHaveBeenCalled()
    expect(webhooksCreateWebhookEndpoint).not.toHaveBeenCalled()
    expect(result.log.filter(entry => entry.action === 'would-create').length).toBeGreaterThanOrEqual(5)
  })

  it('reports drift for managed remote objects no longer in the catalog', async () => {
    vi.mocked(productsList).mockResolvedValue(page([
      { id: 'prod_old', metadata: { managedBy: 'nuxt-backend', key: 'legacy-plan' } },
    ]) as never)
    vi.mocked(metersCreate).mockResolvedValue({ ok: true, value: { id: 'mtr_1' } } as never)
    vi.mocked(benefitsCreate).mockResolvedValue({ ok: true, value: { id: 'ben_x' } } as never)
    vi.mocked(productsCreate).mockResolvedValue({ ok: true, value: { id: 'prod_new' } } as never)
    vi.mocked(productsUpdateBenefits).mockResolvedValue({ ok: true, value: {} } as never)

    const result = await syncBillingCatalog(catalog, options, fakeClient)

    expect(result.log).toContainEqual(expect.objectContaining({ action: 'drift', key: 'legacy-plan' }))
  })

  it('provisions the webhook endpoint once and returns its secret', async () => {
    vi.mocked(metersCreate).mockResolvedValue({ ok: true, value: { id: 'mtr_1' } } as never)
    vi.mocked(benefitsCreate).mockResolvedValue({ ok: true, value: { id: 'ben_x' } } as never)
    vi.mocked(productsCreate).mockResolvedValue({ ok: true, value: { id: 'prod_x' } } as never)
    vi.mocked(productsUpdateBenefits).mockResolvedValue({ ok: true, value: {} } as never)
    vi.mocked(webhooksCreateWebhookEndpoint).mockResolvedValue({ ok: true, value: { id: 'wh_1', secret: 'whsec_new' } } as never)
    const url = 'https://x.convex.site/billing/events'

    const first = await syncBillingCatalog(catalog, { ...options, webhookUrl: url }, fakeClient)
    expect(webhooksCreateWebhookEndpoint).toHaveBeenCalledWith(fakeClient, expect.objectContaining({
      url,
      format: 'raw',
      events: [...BILLING_WEBHOOK_PROVISION_EVENTS],
    }))
    expect(first.webhookSecret).toBe('whsec_new')

    vi.mocked(webhooksListWebhookEndpoints).mockResolvedValue(page([{ id: 'wh_1', url }]) as never)
    const second = await syncBillingCatalog(catalog, { ...options, webhookUrl: url }, fakeClient)
    expect(second.webhookSecret).toBeUndefined()
    expect(webhooksCreateWebhookEndpoint).toHaveBeenCalledTimes(1)
  })
})

describe('BILLING_WEBHOOK_PROVISION_EVENTS', () => {
  it('covers every event the runtime refresh set consumes', () => {
    for (const event of BILLING_REFRESH_EVENTS) {
      expect(BILLING_WEBHOOK_PROVISION_EVENTS).toContain(event)
    }
  })
})
