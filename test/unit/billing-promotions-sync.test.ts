import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { syncBillingCatalog } from '../../src/cli/billing'
import { DISCOUNT_LIMIT_API_VERSION } from '../../src/cli/billing/discount-limit'
import type { BillingCatalog, CatalogDiscount } from '../../src/convex/catalog'
import { createPolarFake, type PolarFake } from '../fixtures/polar-fake/server'
import { stableId } from '../fixtures/polar-fake/state'

// More of `billing sync`'s promotions, against the fake provider through the
// provider SDK, as billing-promotions.test.ts runs them: a fixed amount in
// several currencies, a change of months, a discount made by hand and
// adopted under a key, what a dry run says of each change, and a
// per-customer limit the provider will not take.

const BASE = 'http://127.0.0.1:4747'
const ENDS = '2099-12-31T23:59:59.000Z'

/** A catalog priced in two currencies, with the discounts given. */
const catalog = (discounts: Record<string, CatalogDiscount>): BillingCatalog => ({
  currency: 'usd',
  plans: {
    free: { name: 'Free', prices: { month: 0 } },
    pro: { name: 'Pro', prices: { usd: { month: 2900 }, eur: { month: 2700 } } },
  },
  discounts,
})

const welcome: CatalogDiscount = { name: 'Welcome', amountOff: { USD: 500, eur: 450 }, duration: 'once', products: { plans: ['pro'] } }
const quarter: CatalogDiscount = { name: 'Quarter', percentOff: 20, duration: { months: 3 }, products: { plans: ['pro'] } }

let fake: PolarFake
/** Answers the raw per-customer calls with this status instead of the fake, when set. */
let rawStatus: number | null

beforeEach(() => {
  rawStatus = null
  fake = createPolarFake({ baseUrl: BASE, fetcher: async () => new Response('Accepted', { status: 202 }) })
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    if (rawStatus !== null && request.headers.get('polar-version') === DISCOUNT_LIMIT_API_VERSION) return Promise.resolve(new Response('{}', { status: rawStatus }))
    return fake.handle(request)
  })
})
afterEach(async () => {
  await fake.idle()
  fake.close()
  vi.unstubAllGlobals()
})

const sync = (shape: BillingCatalog, options: { dryRun?: boolean, adopt?: Record<string, string> } = {}) =>
  syncBillingCatalog(shape, { rootDir: '.', environment: 'sandbox', accessToken: 'polar_oat_fake', dryRun: options.dryRun ?? false, adopt: options.adopt ?? {} })

const discountOf = (key: string) => Object.values(fake.state.discounts).find(discount => discount.metadata.key === key)
const discountLog = (result: Awaited<ReturnType<typeof sync>>) => result.log.filter(entry => entry.kind === 'discount')

describe('billing sync — fixed amounts and months', () => {
  it('pushes a fixed amount in every currency the plan is priced in, the currency codes lower-cased', async () => {
    const result = await sync(catalog({ welcome }))
    expect(discountOf('welcome')).toMatchObject({ type: 'fixed', amounts: { usd: 500, eur: 450 } })
    expect(result.ids.discounts?.welcome).toMatchObject({ amountOff: { usd: 500, eur: 450 }, duration: 'once' })
  })

  it('changes the amount in place while nobody redeemed it, and reports it as drift once someone did', async () => {
    await sync(catalog({ welcome }))
    const changed = await sync(catalog({ welcome: { ...welcome, amountOff: { usd: 600, eur: 450 } } }))
    expect(discountLog(changed)).toContainEqual(expect.objectContaining({ action: 'updated', key: 'welcome', note: 'amountOff' }))
    expect(discountOf('welcome')!.amounts).toEqual({ usd: 600, eur: 450 })

    discountOf('welcome')!.redemptionsCount = 1
    const redeemed = await sync(catalog({ welcome: { ...welcome, amountOff: { usd: 700, eur: 450 } } }))
    expect(discountLog(redeemed)).toContainEqual(expect.objectContaining({ action: 'drift', note: expect.stringContaining('takes off {"usd":600,"eur":450}, catalog says {"usd":700,"eur":450}') }))
    expect(discountOf('welcome')!.amounts).toEqual({ usd: 600, eur: 450 })
  })

  it('changes the months in place while nobody redeemed it, and reports it as drift once someone did', async () => {
    await sync(catalog({ quarter }))
    const longer = await sync(catalog({ quarter: { ...quarter, duration: { months: 6 } } }))
    expect(discountLog(longer)).toContainEqual(expect.objectContaining({ action: 'updated', key: 'quarter', note: 'months' }))
    expect(discountOf('quarter')!.durationInMonths).toBe(6)

    discountOf('quarter')!.redemptionsCount = 2
    const redeemed = await sync(catalog({ quarter: { ...quarter, duration: { months: 12 } } }))
    expect(discountLog(redeemed)).toContainEqual(expect.objectContaining({ action: 'drift', note: expect.stringContaining('lasts 6 months, catalog says 12') }))
  })
})

describe('billing sync — a dry run of changes', () => {
  it('says what it would patch, retire and limit, and changes nothing at the provider', async () => {
    await sync(catalog({ quarter, welcome: { ...welcome, perCustomer: 1 } }))
    const before = structuredClone(fake.state.discounts)
    const result = await sync(catalog({
      quarter: { ...quarter, name: 'Quarter off', endsAt: ENDS },
      welcome: { ...welcome, perCustomer: 3, retired: true },
    }), { dryRun: true })
    expect(discountLog(result)).toEqual(expect.arrayContaining([
      { action: 'would-archive', kind: 'discount', key: 'welcome', id: stableId('discount', 'welcome'), note: 'would end now and free its code' },
      { action: 'would-update', kind: 'discount', key: 'quarter', id: stableId('discount', 'quarter'), note: 'name, endsAt' },
    ]))
    expect(fake.state.discounts).toEqual(before)

    const limit = await sync(catalog({ quarter, welcome: { ...welcome, perCustomer: 2 } }), { dryRun: true })
    expect(discountLog(limit)).toContainEqual({ action: 'would-update', kind: 'discount', key: 'welcome', id: stableId('discount', 'welcome'), note: 'per-customer limit 1 → 2' })
    expect(discountOf('welcome')!.maxRedemptionsPerCustomer).toBe(1)
  })
})

describe('billing sync — adopted discounts and the per-customer limit', () => {
  it('records an adopted discount\'s terms under its key as the provider holds them, and changes nothing of it', async () => {
    await sync(catalog({ quarter }))
    const made = discountOf('quarter')!
    const result = await sync(catalog({ spring: { ...quarter, name: 'Spring', percentOff: 50 } }), { adopt: { spring: made.id } })
    expect(discountLog(result)).toContainEqual({ action: 'adopted', kind: 'discount', key: 'spring', id: made.id, note: 'left as it is' })
    expect(result.ids.discounts?.spring).toMatchObject({ id: made.id, name: 'Quarter', percentOff: 20, months: 3 })
    expect(discountOf('quarter')).toMatchObject({ name: 'Quarter', basisPoints: 2000 })
  })

  it('warns of an adopted id the provider has no discount for, and records nothing for the key', async () => {
    const result = await sync(catalog({ spring: quarter }), { adopt: { spring: 'disc_missing' } })
    expect(discountLog(result)).toContainEqual({ action: 'warn', kind: 'discount', key: 'spring', id: 'disc_missing', note: 'no discount at the provider has this id: nothing was recorded for the key' })
    expect(result.ids.discounts?.spring).toBeUndefined()
  })

  it('warns, and goes on, when the provider will not read or set the per-customer limit', async () => {
    rawStatus = 403
    const result = await sync(catalog({ quarter: { ...quarter, perCustomer: 1 } }))
    expect(discountLog(result)).toContainEqual(expect.objectContaining({ action: 'warn', key: 'quarter', note: 'the per-customer limit could not be read or set (the provider answered 403): set it in the provider\'s dashboard' }))
    expect(discountOf('quarter')).toBeDefined()
    expect(result.ids.discounts?.quarter).toMatchObject({ percentOff: 20 })
  })
})
