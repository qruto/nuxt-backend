import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { syncBillingCatalog } from '../../src/cli/billing'
import { collectBillingFindings, readBillingOrganizationState } from '../../src/cli/billing/doctor'
import { createPolarFake, type PolarFake } from '../fixtures/polar-fake/server'
import { stableId } from '../fixtures/polar-fake/state'
import type { BillingCatalog } from '../../src/convex/catalog'

// `billing sync` against what the organization already holds, on the fake
// provider through the provider SDK: a plan product found by its key gets
// the catalog's benefits it lacks attached (and the doctor says which ones
// are missing), never a second credit grant on one meter; and a catalog with
// no price in the organization's default currency is refused before
// anything is created (and the doctor says so), while the free plan and a
// plan's pass are priced at nothing in that currency by the sync itself.

const BASE = 'http://127.0.0.1:4749'
const root = join(import.meta.dirname, '../..')

let fake: PolarFake

beforeEach(() => {
  fake = createPolarFake({ baseUrl: BASE, fetcher: async () => new Response('Accepted', { status: 202 }) })
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => fake.handle(new Request(input, init)))
})

afterEach(async () => {
  await fake.idle()
  fake.close()
  vi.unstubAllGlobals()
})

const sync = (catalog: BillingCatalog, extra: { dryRun?: boolean } = {}) =>
  syncBillingCatalog(catalog, { rootDir: root, environment: 'sandbox', accessToken: 'polar_oat_fake', dryRun: extra.dryRun ?? false, adopt: {} })

const benefitOf = (key: string) => Object.values(fake.state.benefits).find(benefit => benefit.metadata.key === key)
const productOf = (key: string, interval = 'month') => Object.values(fake.state.products).find(product => product.metadata.key === key && (product.metadata.interval ?? interval) === interval)!
const currencies = (key: string) => productOf(key).prices.map(price => `${price.priceCurrency} ${price.priceAmount}`).sort()
const findings = async (catalog: BillingCatalog) =>
  collectBillingFindings(catalog, await readBillingOrganizationState({ accessToken: 'polar_oat_fake', environment: 'sandbox' }), { tokenPresent: true })
const findingOf = async (catalog: BillingCatalog, id: string) => (await findings(catalog)).find(found => found.id === id)

const METERED = { meters: { credits: { eventName: 'credits', property: 'amount' } } } satisfies BillingCatalog

describe('billing sync, with a plan product that exists already', () => {
  it('attaches a credit benefit made this run to the product it found, and says so', async () => {
    // Another app's catalog on the organization made `free`, with no credits.
    await sync({ ...METERED, plans: { free: { name: 'Free', prices: { month: 0 } } } })
    expect(productOf('free').benefitIds).toEqual([])
    const before = await findingOf({ ...METERED, plans: { free: { name: 'Free', prices: { month: 0 }, credits: { meter: 'credits', units: 30 } } } }, 'billing-plan-benefits')
    expect(before).toMatchObject({ status: 'warn', message: expect.stringContaining('product free lacks free-credits') })

    const { log } = await sync({ ...METERED, plans: { free: { name: 'Free', prices: { month: 0 }, credits: { meter: 'credits', units: 30 } } } })
    const credits = benefitOf('free-credits')!
    expect(log).toContainEqual(expect.objectContaining({ action: 'created', kind: 'benefit', key: 'free-credits' }))
    expect(log).toContainEqual(expect.objectContaining({ action: 'exists', kind: 'product', key: 'free' }))
    expect(log).toContainEqual({ action: 'attached', kind: 'benefit', key: 'free-credits', id: credits.id, note: 'to product free' })
    expect(productOf('free').benefitIds).toEqual([credits.id])
    expect(await findingOf({ ...METERED, plans: { free: { name: 'Free', prices: { month: 0 }, credits: { meter: 'credits', units: 30 } } } }, 'billing-plan-benefits')).toMatchObject({ status: 'pass' })

    // Attached once: the next run finds it there.
    const again = await sync({ ...METERED, plans: { free: { name: 'Free', prices: { month: 0 }, credits: { meter: 'credits', units: 30 } } } })
    expect(again.log.filter(entry => entry.action === 'attached')).toEqual([])
  })

  it('attaches a feature a plan gained later, beside its quotas, keeping what the product carried', async () => {
    const before: BillingCatalog = { ...METERED, plans: { pro: { name: 'Pro', prices: { month: 2900 }, credits: { meter: 'credits', units: 100 } } } }
    await sync(before)
    const credits = benefitOf('pro-credits')!.id
    const after: BillingCatalog = {
      ...METERED,
      plans: { pro: { name: 'Pro', prices: { month: 2900 }, credits: { meter: 'credits', units: 100 }, features: ['priority'], quotas: { projects: 10 } } },
      features: { priority: { description: 'Priority support' } },
      quotas: { projects: { description: 'Projects' } },
    }
    const preview = await sync(after, { dryRun: true })
    // A feature not made yet has no id to name: the dry run lists it as a benefit it would create.
    expect(preview.log).toContainEqual(expect.objectContaining({ action: 'would-create', kind: 'benefit', key: 'priority' }))
    const { log } = await sync(after)
    expect(log).toContainEqual(expect.objectContaining({ action: 'attached', kind: 'benefit', key: 'priority', note: 'to product pro' }))
    expect(log).toContainEqual(expect.objectContaining({ action: 'updated', kind: 'product', key: 'pro', note: expect.stringContaining('quotas') }))
    expect(productOf('pro').benefitIds.sort()).toEqual([credits, benefitOf('priority')!.id, benefitOf('pro-quotas')!.id].sort())
  })

  it('names a benefit it would attach on a dry run, and attaches nothing', async () => {
    await sync({ ...METERED, plans: { free: { name: 'Free', prices: { month: 0 } } } })
    // The grant exists, and the product lost it in the dashboard since.
    await sync({ ...METERED, plans: { free: { name: 'Free', prices: { month: 0 }, credits: { meter: 'credits', units: 30 } } } })
    productOf('free').benefitIds = []
    const { log } = await sync({ ...METERED, plans: { free: { name: 'Free', prices: { month: 0 }, credits: { meter: 'credits', units: 30 } } } }, { dryRun: true })
    expect(log).toContainEqual(expect.objectContaining({ action: 'would-attach', kind: 'benefit', key: 'free-credits', note: 'to product free' }))
    expect(productOf('free').benefitIds).toEqual([])
  })

  it('never attaches a second credit grant on a meter the product already grants on: that is drift', async () => {
    const catalog: BillingCatalog = { ...METERED, plans: { pro: { name: 'Pro', prices: { month: 2900 }, credits: { meter: 'credits', units: 100 } } } }
    await sync(catalog)
    // The product grants another managed benefit on the same meter instead.
    const grant = benefitOf('pro-credits')!
    const legacy = { ...grant, id: stableId('benefit', 'legacy-credits'), metadata: { ...grant.metadata, key: 'legacy-credits' } }
    fake.state.benefits[legacy.id] = legacy
    productOf('pro').benefitIds = [legacy.id]

    const { log } = await sync(catalog)
    expect(log).toContainEqual(expect.objectContaining({ action: 'drift', kind: 'product', key: 'pro', note: expect.stringContaining('grants legacy-credits on the meter where the catalog says pro-credits') }))
    expect(log.filter(entry => entry.action === 'attached')).toEqual([])
    expect(productOf('pro').benefitIds).toEqual([legacy.id])
  })
})

describe('billing sync, with a pack product that exists already', () => {
  it('reports the credits it lacks as drift, and attaches nothing: the provider would credit everyone who bought it before', async () => {
    await sync({ ...METERED, packs: { credits100: { name: '100 credits', price: 500, credits: { meter: 'credits', units: 100 } } } })
    productOf('credits100').benefitIds = []
    const { log } = await sync({ ...METERED, packs: { credits100: { name: '100 credits', price: 500, credits: { meter: 'credits', units: 100 } } } })
    expect(log).toContainEqual(expect.objectContaining({ action: 'drift', kind: 'product', key: 'credits100', note: expect.stringContaining('lacks benefit credits100-credits: attaching it would grant it to everyone who bought the product before') }))
    expect(log.filter(entry => entry.action === 'attached')).toEqual([])
    expect(productOf('credits100').benefitIds).toEqual([])
  })
})

describe('billing sync, against the organization\'s default currency', () => {
  const PINNED: BillingCatalog = {
    ...METERED,
    currency: 'usd',
    plans: {
      free: { name: 'Free', prices: { month: 0 }, credits: { meter: 'credits', units: 30 } },
      studio: { name: 'Studio', prices: { month: 1200 }, credits: { meter: 'credits', units: 400 }, gift: { months: [1] } },
    },
    packs: { credits100: { name: '100 credits', price: 500, credits: { meter: 'credits', units: 100 } } },
  }

  beforeEach(() => {
    fake.state.organization.defaultPresentmentCurrency = 'eur'
  })

  it('refuses a catalog that prices a plan or a pack in another currency alone, in one line, before it creates anything', async () => {
    const refused = await sync(PINNED).then(() => null, (error: Error) => error.message)
    expect(refused).toBe('[nuxt-backend] billing sync: the organization\'s default currency is eur, and plans.studio, packs.credits100 have no price in it: the provider makes no product without one. Add eur to their prices (`prices: { usd: …, eur: … }`), or change the organization\'s default currency in the provider dashboard.')
    expect(refused).not.toContain('\n')
    expect(Object.keys(fake.state.meters)).toEqual([])
    expect(Object.keys(fake.state.benefits)).toEqual([])
    expect(Object.keys(fake.state.products)).toEqual([])
    expect(await findingOf(PINNED, 'billing-currency')).toMatchObject({ status: 'warn', message: expect.stringContaining('plans.studio, packs.credits100 have no price in it') })
  })

  it('makes every product once the catalog prices it too, the free plan and the pass at nothing in it', async () => {
    const both: BillingCatalog = {
      ...PINNED,
      plans: { ...PINNED.plans, studio: { ...PINNED.plans!.studio!, prices: { usd: { month: 1200 }, eur: { month: 1100 } } } },
      packs: { credits100: { ...PINNED.packs!.credits100!, price: { usd: 500, eur: 450 } } },
    }
    const { ids } = await sync(both)
    expect(currencies('free')).toEqual(['eur 0', 'usd 0'])
    expect(currencies('studio')).toEqual(['eur 1100', 'usd 1200'])
    expect(currencies('studio-pass')).toEqual(['eur 0', 'usd 0'])
    expect(currencies('studio-gift-1')).toEqual(['eur 1100', 'usd 1200'])
    expect(currencies('credits100')).toEqual(['eur 450', 'usd 500'])
    expect(currencies('credits100-gift')).toEqual(['eur 450', 'usd 500'])
    expect(ids).toMatchObject({ free: 'free', currency: 'usd' })
    expect(await findingOf(both, 'billing-currency')).toMatchObject({ status: 'pass' })
  })

  it('adds the organization\'s currency at nothing to a free product made in another one', async () => {
    fake.state.organization.defaultPresentmentCurrency = 'usd'
    const free: BillingCatalog = { ...METERED, currency: 'usd', plans: { free: { name: 'Free', prices: { month: 0 } } } }
    await sync(free)
    expect(currencies('free')).toEqual(['usd 0'])
    fake.state.organization.defaultPresentmentCurrency = 'eur'
    const { log } = await sync(free)
    expect(log).toContainEqual(expect.objectContaining({ action: 'updated', kind: 'product', key: 'free', note: expect.stringContaining('eur') }))
    expect(currencies('free')).toEqual(['eur 0', 'usd 0'])
  })
})
