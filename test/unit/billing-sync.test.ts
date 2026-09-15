import { beforeEach, describe, expect, it, vi } from 'vitest'
import { metersCreate } from '@polar-sh/sdk/funcs/metersCreate.js'
import { metersList } from '@polar-sh/sdk/funcs/metersList.js'
import { benefitsCreate } from '@polar-sh/sdk/funcs/benefitsCreate.js'
import { benefitsList } from '@polar-sh/sdk/funcs/benefitsList.js'
import { customFieldsCreate } from '@polar-sh/sdk/funcs/customFieldsCreate.js'
import { customFieldsList } from '@polar-sh/sdk/funcs/customFieldsList.js'
import { organizationsListOrganizations } from '@polar-sh/sdk/funcs/organizationsListOrganizations.js'
import { productsCreate } from '@polar-sh/sdk/funcs/productsCreate.js'
import { productsList } from '@polar-sh/sdk/funcs/productsList.js'
import { productsUpdateBenefits } from '@polar-sh/sdk/funcs/productsUpdateBenefits.js'
import { webhooksCreateWebhookEndpoint } from '@polar-sh/sdk/funcs/webhooksCreateWebhookEndpoint.js'
import { webhooksListWebhookEndpoints } from '@polar-sh/sdk/funcs/webhooksListWebhookEndpoints.js'
import { collectBillingFindings, readBillingOrganizationState, syncBillingCatalog, type BillingOrganizationState } from '../../src/cli/billing'
import { BILLING_WEBHOOK_PROVISION_EVENTS } from '../../src/convex/catalog'
import { BILLING_REFRESH_EVENTS } from '../../src/convex/integrations/billing'
import type { BillingCatalog } from '../../src/convex/catalog'

vi.mock('@polar-sh/sdk/funcs/metersCreate.js', () => ({ metersCreate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/metersList.js', () => ({ metersList: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/benefitsCreate.js', () => ({ benefitsCreate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/benefitsList.js', () => ({ benefitsList: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/customFieldsCreate.js', () => ({ customFieldsCreate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/customFieldsList.js', () => ({ customFieldsList: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/organizationsListOrganizations.js', () => ({ organizationsListOrganizations: vi.fn() }))
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
  vi.mocked(organizationsListOrganizations).mockResolvedValue(page([{ defaultPresentmentCurrency: 'usd' }]) as never)
  vi.mocked(metersList).mockResolvedValue(emptyPage as never)
  vi.mocked(benefitsList).mockResolvedValue(emptyPage as never)
  vi.mocked(customFieldsList).mockResolvedValue(emptyPage as never)
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
      prices: [{ amountType: 'fixed', priceAmount: 2900, priceCurrency: 'usd' }],
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

describe('syncBillingCatalog — price currency', () => {
  beforeEach(() => {
    vi.mocked(metersCreate).mockResolvedValue({ ok: true, value: { id: 'mtr_1' } } as never)
    vi.mocked(benefitsCreate).mockResolvedValue({ ok: true, value: { id: 'ben_x' } } as never)
    vi.mocked(productsCreate).mockResolvedValue({ ok: true, value: { id: 'prod_x' } } as never)
    vi.mocked(productsUpdateBenefits).mockResolvedValue({ ok: true, value: {} } as never)
  })

  it('follows the organization default presentment currency when the catalog does not pin one', async () => {
    vi.mocked(organizationsListOrganizations).mockResolvedValue(page([{ defaultPresentmentCurrency: 'eur' }]) as never)

    const result = await syncBillingCatalog(catalog, options, fakeClient)

    expect(productsCreate).toHaveBeenCalledWith(fakeClient, expect.objectContaining({
      name: 'Pro',
      prices: [{ amountType: 'fixed', priceAmount: 2900, priceCurrency: 'eur' }],
    }))
    expect(result.log).toContainEqual(expect.objectContaining({ action: 'exists', kind: 'currency', key: 'eur' }))
  })

  it('pins the catalog currency, lowercased, without reading the organization', async () => {
    await syncBillingCatalog({ ...catalog, currency: 'GBP' }, options, fakeClient)

    expect(organizationsListOrganizations).not.toHaveBeenCalled()
    expect(productsCreate).toHaveBeenCalledWith(fakeClient, expect.objectContaining({
      name: '500 credits',
      prices: [{ amountType: 'fixed', priceAmount: 2000, priceCurrency: 'gbp' }],
    }))
  })

  it('leaves the provider default and warns when the organization cannot be read', async () => {
    vi.mocked(organizationsListOrganizations).mockResolvedValue({ ok: false, error: new Error('403 Forbidden') } as never)

    const result = await syncBillingCatalog(catalog, options, fakeClient)

    expect(productsCreate).toHaveBeenCalledWith(fakeClient, expect.objectContaining({
      name: 'Pro',
      prices: [{ amountType: 'fixed', priceAmount: 2900 }],
    }))
    expect(result.log).toContainEqual(expect.objectContaining({ action: 'warn', kind: 'currency' }))
  })
})

describe('syncBillingCatalog — trials, usage prices, tax behaviour, custom fields', () => {
  const richCatalog: BillingCatalog = {
    meters: { credits: {} },
    plans: {
      pro: {
        name: 'Pro',
        interval: 'month',
        price: 2900,
        trial: { interval: 'day', count: 14 },
        usage: [{ meter: 'credits', unitAmount: '0.05', cap: 5000 }],
        taxBehavior: 'inclusive',
        customFields: ['company'],
      },
    },
    packs: {
      credits500: { name: '500 credits', price: 2000, credits: { meter: 'credits', units: 500 }, taxBehavior: 'exclusive' },
    },
    customFields: {
      company: { type: 'text', name: 'Company', required: true },
    },
  }

  beforeEach(() => {
    vi.mocked(metersCreate).mockResolvedValue({ ok: true, value: { id: 'mtr_1' } } as never)
    vi.mocked(benefitsCreate).mockResolvedValue({ ok: true, value: { id: 'ben_x' } } as never)
    vi.mocked(customFieldsCreate).mockResolvedValue({ ok: true, value: { id: 'cf_1' } } as never)
    vi.mocked(productsCreate).mockResolvedValue({ ok: true, value: { id: 'prod_x' } } as never)
    vi.mocked(productsUpdateBenefits).mockResolvedValue({ ok: true, value: {} } as never)
  })

  it('maps a plan to the provider create payload: trial, metered price, tax behaviour, attached field', async () => {
    await syncBillingCatalog(richCatalog, options, fakeClient)

    expect(customFieldsCreate).toHaveBeenCalledWith(fakeClient, {
      type: 'text',
      slug: 'company',
      name: 'Company',
      properties: {},
      metadata: { managedBy: 'nuxt-backend', key: 'company' },
    })
    expect(productsCreate).toHaveBeenCalledWith(fakeClient, expect.objectContaining({
      name: 'Pro',
      recurringInterval: 'month',
      // The trial rides on the product, the metered price alongside the fixed one.
      trialInterval: 'day',
      trialIntervalCount: 14,
      prices: [
        { amountType: 'fixed', priceAmount: 2900, priceCurrency: 'usd', taxBehavior: 'inclusive' },
        { amountType: 'metered_unit', meterId: 'mtr_1', unitAmount: '0.05', capAmount: 5000, priceCurrency: 'usd', taxBehavior: 'inclusive' },
      ],
      attachedCustomFields: [{ customFieldId: 'cf_1', required: true }],
    }))
  })

  it('leaves one-time packs without trial or metered prices, and carries their tax behaviour', async () => {
    await syncBillingCatalog(richCatalog, options, fakeClient)

    const pack = vi.mocked(productsCreate).mock.calls
      .map(([, args]) => args as { name: string, prices: unknown[], trialInterval?: string })
      .find(args => args.name === '500 credits')!
    expect(pack.prices).toEqual([{ amountType: 'fixed', priceAmount: 2000, priceCurrency: 'usd', taxBehavior: 'exclusive' }])
    expect(pack.trialInterval).toBeUndefined()
  })

  it('defaults the trial count to one interval and omits absent options entirely', async () => {
    await syncBillingCatalog({ plans: { basic: { name: 'Basic', interval: 'month', price: 900, trial: { interval: 'month' } } } }, options, fakeClient)

    expect(productsCreate).toHaveBeenCalledWith(fakeClient, {
      name: 'Basic',
      description: undefined,
      recurringInterval: 'month',
      trialInterval: 'month',
      trialIntervalCount: 1,
      prices: [{ amountType: 'fixed', priceAmount: 900, priceCurrency: 'usd' }],
      metadata: { managedBy: 'nuxt-backend', key: 'basic' },
    })
  })

  it('warns instead of pricing usage against a meter the catalog never declares', async () => {
    const result = await syncBillingCatalog({
      meters: { credits: {} },
      plans: { pro: { name: 'Pro', interval: 'month', price: 2900, usage: [{ meter: 'tokens', unitAmount: 1 }] } },
    }, options, fakeClient)

    expect(result.log).toContainEqual(expect.objectContaining({ action: 'warn', kind: 'product', key: 'pro', note: expect.stringContaining('tokens') }))
    expect(productsCreate).toHaveBeenCalledWith(fakeClient, expect.objectContaining({
      prices: [{ amountType: 'fixed', priceAmount: 2900, priceCurrency: 'usd' }],
    }))
  })

  it('warns instead of attaching a custom field the catalog never declares', async () => {
    const result = await syncBillingCatalog({
      plans: { pro: { name: 'Pro', interval: 'month', price: 2900, customFields: ['vat'] } },
    }, options, fakeClient)

    expect(result.log).toContainEqual(expect.objectContaining({ action: 'warn', kind: 'product', key: 'pro', note: expect.stringContaining('vat') }))
    expect(vi.mocked(productsCreate).mock.calls[0]![1]).not.toHaveProperty('attachedCustomFields')
  })

  it('creates a select field with its options and finds an existing one by tag next run', async () => {
    const selectCatalog: BillingCatalog = {
      customFields: { plan_size: { type: 'select', options: [{ value: 's', label: 'Small' }] } },
    }
    await syncBillingCatalog(selectCatalog, options, fakeClient)
    expect(customFieldsCreate).toHaveBeenCalledWith(fakeClient, expect.objectContaining({
      type: 'select',
      slug: 'plan_size',
      name: 'plan_size',
      properties: { options: [{ value: 's', label: 'Small' }] },
    }))

    vi.mocked(customFieldsCreate).mockClear()
    vi.mocked(customFieldsList).mockResolvedValue(page([{ id: 'cf_9', metadata: { managedBy: 'nuxt-backend', key: 'plan_size' } }]) as never)
    const second = await syncBillingCatalog(selectCatalog, options, fakeClient)
    expect(customFieldsCreate).not.toHaveBeenCalled()
    expect(second.log).toContainEqual(expect.objectContaining({ action: 'exists', kind: 'custom-field', key: 'plan_size', id: 'cf_9' }))
  })

  it('adopts an existing custom field as-is and attaches it by its provider id', async () => {
    const result = await syncBillingCatalog(richCatalog, { ...options, adopt: { company: 'cf_existing' } }, fakeClient)

    expect(customFieldsCreate).not.toHaveBeenCalled()
    expect(result.log).toContainEqual(expect.objectContaining({ action: 'adopted', kind: 'custom-field', key: 'company', id: 'cf_existing' }))
    expect(productsCreate).toHaveBeenCalledWith(fakeClient, expect.objectContaining({
      attachedCustomFields: [{ customFieldId: 'cf_existing', required: true }],
    }))
  })

  it('reports drift for a managed custom field whose key left the catalog', async () => {
    vi.mocked(customFieldsList).mockResolvedValue(page([{ id: 'cf_old', metadata: { managedBy: 'nuxt-backend', key: 'legacy' } }]) as never)

    const result = await syncBillingCatalog(richCatalog, options, fakeClient)

    expect(result.log).toContainEqual(expect.objectContaining({ action: 'drift', kind: 'custom-field', key: 'legacy', id: 'cf_old' }))
  })

  it('skips the custom-field list call entirely when the catalog declares none', async () => {
    await syncBillingCatalog(catalog, options, fakeClient)
    expect(customFieldsList).not.toHaveBeenCalled()
  })
})

describe('syncBillingCatalog — native feature-flag benefits', () => {
  it('creates feature benefits as the provider feature-flag type, keeping the gate key in metadata', async () => {
    vi.mocked(metersCreate).mockResolvedValue({ ok: true, value: { id: 'mtr_1' } } as never)
    vi.mocked(benefitsCreate).mockResolvedValue({ ok: true, value: { id: 'ben_x' } } as never)
    vi.mocked(productsCreate).mockResolvedValue({ ok: true, value: { id: 'prod_x' } } as never)
    vi.mocked(productsUpdateBenefits).mockResolvedValue({ ok: true, value: {} } as never)

    await syncBillingCatalog(catalog, options, fakeClient)

    expect(benefitsCreate).toHaveBeenCalledWith(fakeClient, {
      type: 'feature_flag',
      description: 'Priority support',
      properties: {},
      metadata: { managedBy: 'nuxt-backend', key: 'priority_support' },
    })
  })

  it('falls back to the custom benefit — and says so — when the provider rejects the feature-flag type', async () => {
    vi.mocked(metersCreate).mockResolvedValue({ ok: true, value: { id: 'mtr_1' } } as never)
    vi.mocked(benefitsCreate).mockImplementation((async (_client: unknown, request: { type: string }) => (
      request.type === 'feature_flag'
        ? { ok: false, error: new Error('unknown benefit type') }
        : { ok: true, value: { id: 'ben_custom' } }
    )) as never)
    vi.mocked(productsCreate).mockResolvedValue({ ok: true, value: { id: 'prod_x' } } as never)
    vi.mocked(productsUpdateBenefits).mockResolvedValue({ ok: true, value: {} } as never)

    const result = await syncBillingCatalog({ features: { priority_support: { description: 'Priority support' } } }, options, fakeClient)

    expect(benefitsCreate).toHaveBeenCalledWith(fakeClient, expect.objectContaining({ type: 'custom', properties: { note: null } }))
    expect(result.log).toContainEqual(expect.objectContaining({ action: 'warn', kind: 'benefit', key: 'priority_support', note: expect.stringContaining('feature-flag') }))
    expect(result.log).toContainEqual(expect.objectContaining({ action: 'created', kind: 'benefit', key: 'priority_support', id: 'ben_custom' }))
  })

  it('adopts an existing feature benefit untouched — no create of either type', async () => {
    vi.mocked(benefitsList).mockResolvedValue(page([
      { id: 'ben_legacy', type: 'custom', metadata: { managedBy: 'nuxt-backend', key: 'priority_support' } },
    ]) as never)

    const result = await syncBillingCatalog({ features: { priority_support: { description: 'Priority support' } } }, options, fakeClient)

    expect(benefitsCreate).not.toHaveBeenCalled()
    expect(result.log).toContainEqual(expect.objectContaining({ action: 'exists', kind: 'benefit', key: 'priority_support', id: 'ben_legacy' }))
  })
})

const organizationPayload = {
  id: 'org_1',
  slug: 'acme',
  subscriptionSettings: {
    allowMultipleSubscriptions: false,
    prorationBehavior: 'invoice',
    benefitRevocationGracePeriod: 0,
    preventTrialAbuse: true,
    allowCustomerUpdates: true,
  },
  customerPortalSettings: {
    usage: { show: true },
    subscription: { updateSeats: false, updatePlan: true, pause: false },
  },
}

const healthyState: BillingOrganizationState = {
  slug: 'acme',
  allowMultipleSubscriptions: false,
  prorationBehavior: 'invoice',
  benefitRevocationGracePeriod: 0,
  preventTrialAbuse: true,
  portal: { updatePlan: true, pause: false },
  benefitTypeByKey: { priority_support: 'feature_flag' },
}

const statusOf = (findings: Array<{ id: string, status: string }>, id: string) => findings.find(finding => finding.id === id)?.status

describe('readBillingOrganizationState', () => {
  it('flattens the organization settings and the managed benefit types', async () => {
    vi.mocked(organizationsListOrganizations).mockResolvedValue(page([organizationPayload]) as never)
    vi.mocked(benefitsList).mockResolvedValue(page([
      { id: 'ben_f', type: 'custom', metadata: { managedBy: 'nuxt-backend', key: 'priority_support' } },
      { id: 'ben_other', type: 'custom', metadata: { managedBy: 'someone-else', key: 'ignored' } },
    ]) as never)

    const state = await readBillingOrganizationState({ accessToken: 'tok', environment: 'sandbox' }, fakeClient)

    expect(state).toEqual({
      slug: 'acme',
      allowMultipleSubscriptions: false,
      prorationBehavior: 'invoice',
      benefitRevocationGracePeriod: 0,
      preventTrialAbuse: true,
      portal: { updatePlan: true, pause: false },
      benefitTypeByKey: { priority_support: 'custom' },
    })
  })

  it('returns null when the token is refused (the live 401 path) instead of throwing', async () => {
    vi.mocked(organizationsListOrganizations).mockResolvedValue({ ok: false, error: new Error('401 Unauthorized') } as never)

    expect(await readBillingOrganizationState({ accessToken: 'expired', environment: 'sandbox' }, fakeClient)).toBeNull()
  })

  it('returns null when a later page request throws', async () => {
    vi.mocked(organizationsListOrganizations).mockResolvedValue(page([organizationPayload]) as never)
    vi.mocked(benefitsList).mockRejectedValue(new Error('network down'))

    expect(await readBillingOrganizationState({ accessToken: 'tok', environment: 'sandbox' }, fakeClient)).toBeNull()
  })
})

describe('collectBillingFindings', () => {
  it('warns about a meter nothing grants and nothing prices — no provider needed', () => {
    const findings = collectBillingFindings({
      meters: { credits: {}, tokens: {} },
      plans: { pro: { name: 'Pro', interval: 'month', price: 2900, credits: { meter: 'credits', units: 500 } } },
    }, null, { tokenPresent: false })

    expect(statusOf(findings, 'billing-meter-usage')).toBe('warn')
    expect(findings.find(finding => finding.id === 'billing-meter-usage')?.message).toContain('tokens')
  })

  it('passes the meter check when a usage price is the only thing referencing it', () => {
    const findings = collectBillingFindings({
      meters: { tokens: {} },
      plans: { pro: { name: 'Pro', interval: 'month', price: 2900, usage: [{ meter: 'tokens', unitAmount: 1 }] } },
    }, null, { tokenPresent: false })

    expect(statusOf(findings, 'billing-meter-usage')).toBe('pass')
  })

  it('skips every provider check when no token is visible — not a finding, not a crash', () => {
    const findings = collectBillingFindings(catalog, null, { tokenPresent: false })

    expect(findings.map(finding => finding.id)).toEqual(['billing-meter-usage'])
  })

  it('reports the refused token once and skips the checks behind it', () => {
    const findings = collectBillingFindings(catalog, null, { tokenPresent: true })

    expect(statusOf(findings, 'billing-organization')).toBe('warn')
    expect(findings.some(finding => finding.id === 'billing-proration')).toBe(false)
  })

  it('says nothing at all when the app declares no catalog', () => {
    expect(collectBillingFindings(null, healthyState, { tokenPresent: true })).toEqual([])
  })

  it('passes every cross-check for a healthy organization', () => {
    const findings = collectBillingFindings(catalog, healthyState, { tokenPresent: true })

    expect(findings.every(finding => finding.status === 'pass')).toBe(true)
    expect(findings.map(finding => finding.id)).toEqual([
      'billing-meter-usage',
      'billing-multiple-subscriptions',
      'billing-proration',
      'billing-benefit-grace',
      'billing-trial-abuse',
      'billing-portal',
      'billing-feature-benefits',
    ])
  })

  it('warns when several plans meet an organization that allows stacked subscriptions', () => {
    const twoPlans: BillingCatalog = {
      plans: {
        pro: { name: 'Pro', interval: 'month', price: 2900 },
        ultra: { name: 'Ultra', interval: 'month', price: 4900 },
      },
    }

    expect(statusOf(collectBillingFindings(twoPlans, { ...healthyState, allowMultipleSubscriptions: true }, { tokenPresent: true }), 'billing-multiple-subscriptions')).toBe('warn')
    // One plan cannot be stacked with anything — the same setting is fine.
    expect(statusOf(collectBillingFindings(catalog, { ...healthyState, allowMultipleSubscriptions: true }, { tokenPresent: true }), 'billing-multiple-subscriptions')).toBe('pass')
  })

  it('warns when plan changes are deferred to the next period but the catalog sells upgrades', () => {
    const twoPlans: BillingCatalog = {
      plans: {
        pro: { name: 'Pro', interval: 'month', price: 2900 },
        ultra: { name: 'Ultra', interval: 'month', price: 4900 },
      },
    }

    expect(statusOf(collectBillingFindings(twoPlans, { ...healthyState, prorationBehavior: 'next_period' }, { tokenPresent: true }), 'billing-proration')).toBe('warn')
    expect(statusOf(collectBillingFindings(twoPlans, { ...healthyState, prorationBehavior: 'prorate' }, { tokenPresent: true }), 'billing-proration')).toBe('pass')
  })

  it('warns when a benefit revocation grace period outlives the benefits the catalog grants', () => {
    expect(statusOf(collectBillingFindings(catalog, { ...healthyState, benefitRevocationGracePeriod: 7 }, { tokenPresent: true }), 'billing-benefit-grace')).toBe('warn')
    // Nothing granted, nothing to keep granted.
    expect(statusOf(collectBillingFindings({ meters: {} }, { ...healthyState, benefitRevocationGracePeriod: 7 }, { tokenPresent: true }), 'billing-benefit-grace')).toBe('pass')
  })

  it('warns when a plan offers a trial the organization does not protect', () => {
    const trialCatalog: BillingCatalog = {
      plans: { pro: { name: 'Pro', interval: 'month', price: 2900, trial: { interval: 'day', count: 14 } } },
    }

    expect(statusOf(collectBillingFindings(trialCatalog, { ...healthyState, preventTrialAbuse: false }, { tokenPresent: true }), 'billing-trial-abuse')).toBe('warn')
    expect(statusOf(collectBillingFindings(trialCatalog, healthyState, { tokenPresent: true }), 'billing-trial-abuse')).toBe('pass')
    // No trial declared: the setting cannot bite.
    expect(statusOf(collectBillingFindings(catalog, { ...healthyState, preventTrialAbuse: false }, { tokenPresent: true }), 'billing-trial-abuse')).toBe('pass')
  })

  it('warns when the portal cannot change plan although the catalog sells several, and reports the pause toggle', () => {
    const twoPlans: BillingCatalog = {
      plans: {
        pro: { name: 'Pro', interval: 'month', price: 2900 },
        ultra: { name: 'Ultra', interval: 'month', price: 4900 },
      },
    }
    const findings = collectBillingFindings(twoPlans, { ...healthyState, portal: { updatePlan: false, pause: true } }, { tokenPresent: true })

    expect(statusOf(findings, 'billing-portal')).toBe('warn')
    expect(findings.find(finding => finding.id === 'billing-portal')?.message).toContain('pause: on')
  })

  it('warns while a feature benefit is still the legacy custom type', () => {
    const findings = collectBillingFindings(catalog, { ...healthyState, benefitTypeByKey: { priority_support: 'custom' } }, { tokenPresent: true })

    expect(statusOf(findings, 'billing-feature-benefits')).toBe('warn')
    expect(findings.find(finding => finding.id === 'billing-feature-benefits')?.message).toContain('priority_support')
    // Never synced yet is not legacy — there is nothing to recreate.
    expect(statusOf(collectBillingFindings(catalog, { ...healthyState, benefitTypeByKey: {} }, { tokenPresent: true }), 'billing-feature-benefits')).toBe('pass')
  })
})

describe('BILLING_WEBHOOK_PROVISION_EVENTS', () => {
  it('covers every event the runtime refresh set consumes', () => {
    for (const event of BILLING_REFRESH_EVENTS) {
      expect(BILLING_WEBHOOK_PROVISION_EVENTS).toContain(event)
    }
  })
})
