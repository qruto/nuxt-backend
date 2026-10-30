import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Polar } from '@polar-sh/sdk'
import { PolarCore } from '@polar-sh/sdk/core.js'
import { checkoutsCreate } from '@polar-sh/sdk/funcs/checkoutsCreate.js'
import { subscriptionsUpdate } from '@polar-sh/sdk/funcs/subscriptionsUpdate.js'
import { collectBillingFindings, syncBillingCatalog, type BillingOrganizationState } from '../../src/cli/billing'
import { DISCOUNT_LIMIT_API_VERSION } from '../../src/cli/billing/discount-limit'
import { syncDiscounts } from '../../src/cli/billing/discounts'
import { missingProductionIds } from '../../src/cli/billing/doctor'
import { createPolarFake, type PolarFake } from '../fixtures/polar-fake/server'
import { stableId } from '../fixtures/polar-fake/state'
import { type BillingCatalog, type CatalogDiscount, discountProductKeys } from '../../src/convex/catalog'

// Promotions in the catalog: `billing sync` pushes each discount as the
// provider's own, finds it again by its key, keeps it in line in place
// (its amount only while nobody redeemed it), retires it on request and
// refuses what the provider would refuse or what would give away more than
// the catalog says. All of it against the fake provider, through the
// provider SDK and the raw per-customer call, never a live provider.

const BASE = 'http://127.0.0.1:4747'
const ENDS = '2099-12-31T23:59:59.000Z'

const launch: CatalogDiscount = {
  name: 'Launch offer',
  percentOff: 20,
  duration: { months: 3 },
  code: 'LAUNCH20',
  maxRedemptions: 100,
  perCustomer: 1,
  endsAt: ENDS,
  products: { plans: ['pro'], interval: 'month' },
}

const catalog = (discounts: Record<string, CatalogDiscount>, extra: Partial<BillingCatalog> = {}): BillingCatalog => ({
  currency: 'usd',
  meters: { credits: { eventName: 'credits', property: 'amount' } },
  plans: {
    free: { name: 'Free', prices: { month: 0 } },
    pro: { name: 'Pro', prices: { month: 2900, year: 29000 }, credits: { meter: 'credits', units: 500 } },
    team: { name: 'Team', prices: { month: 9900 } },
  },
  packs: { credits500: { name: '500 credits', price: 2000, credits: { meter: 'credits', units: 500 } } },
  discounts,
  ...extra,
})

let fake: PolarFake
/** Every request the sync sent, as the fake provider received it. */
let requests: Request[]

beforeEach(() => {
  requests = []
  fake = createPolarFake({ baseUrl: BASE, fetcher: async () => new Response('Accepted', { status: 202 }) })
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    requests.push(request.clone())
    return fake.handle(request)
  })
})

afterEach(async () => {
  await fake.idle()
  fake.close()
  vi.unstubAllGlobals()
})

const sync = (shape: BillingCatalog, options: { dryRun?: boolean } = {}) =>
  syncBillingCatalog(shape, { rootDir: '.', environment: 'sandbox', accessToken: 'polar_oat_fake', dryRun: options.dryRun ?? false, adopt: {} })

/** The fake provider's discount by its catalog key. */
const discountOf = (key: string) => Object.values(fake.state.discounts).find(discount => discount.metadata.key === key)

const product = (key: string) => stableId('product', key)

describe('billing sync — promotions', () => {
  it('pushes each discount as the provider\'s own, with its per-customer limit, and writes its terms', async () => {
    const result = await sync(catalog({
      launch,
      founder: { name: 'Founder pricing', percentOff: 30, duration: 'forever', perCustomer: 1, products: { plans: ['pro', 'team'] } },
      packdeal: { name: 'Pack deal', amountOff: 500, duration: 'once', code: 'PACK5', maxRedemptions: 50, perCustomer: 2, endsAt: ENDS, products: { packs: ['credits500'] } },
    }))
    expect(result.ids.discounts).toEqual({
      launch: { id: stableId('discount', 'launch'), name: 'Launch offer', code: 'LAUNCH20', percentOff: 20, duration: 'repeating', months: 3, endsAt: ENDS, productIds: [product('pro')] },
      founder: { id: stableId('discount', 'founder'), name: 'Founder pricing', percentOff: 30, duration: 'forever', productIds: [product('pro'), product('pro:year'), product('team')] },
      packdeal: { id: stableId('discount', 'packdeal'), name: 'Pack deal', code: 'PACK5', amountOff: { usd: 500 }, duration: 'once', endsAt: ENDS, productIds: [product('credits500')] },
    })
    expect(discountOf('launch')).toMatchObject({ basisPoints: 2000, duration: 'repeating', durationInMonths: 3, maxRedemptions: 100, maxRedemptionsPerCustomer: 1, endsAt: Date.parse(ENDS) })
    expect(discountOf('founder')).toMatchObject({ code: null, maxRedemptionsPerCustomer: 1 })
    expect(discountOf('packdeal')).toMatchObject({ type: 'fixed', amounts: { usd: 500 }, maxRedemptionsPerCustomer: 2 })
    expect(result.log.filter(entry => entry.kind === 'discount').map(entry => [entry.action, entry.key])).toEqual([
      ['created', 'launch'], ['updated', 'launch'], ['created', 'founder'], ['updated', 'founder'], ['created', 'packdeal'], ['updated', 'packdeal'],
    ])
    // The per-customer limit is the raw call's, pinned to an API version that has it.
    const raw = requests.filter(request => request.method === 'PATCH' && request.url.includes('/v1/discounts/'))
    expect(raw.map(request => request.headers.get('polar-version'))).toEqual([DISCOUNT_LIMIT_API_VERSION, DISCOUNT_LIMIT_API_VERSION, DISCOUNT_LIMIT_API_VERSION])
  })

  it('finds them by key the next time, and changes nothing that matches', async () => {
    await sync(catalog({ launch }))
    const second = await sync(catalog({ launch }))
    expect(second.log.filter(entry => entry.kind === 'discount')).toEqual([{ action: 'exists', kind: 'discount', key: 'launch', id: stableId('discount', 'launch') }])
    expect(Object.keys(fake.state.discounts)).toHaveLength(1)
  })

  it('patches the name, dates, cap, scope and limit in place, and the amount while nobody redeemed it', async () => {
    await sync(catalog({ launch }))
    const result = await sync(catalog({ launch: { ...launch, name: 'Launch', percentOff: 25, maxRedemptions: 200, perCustomer: 2, endsAt: '2099-06-30T00:00:00Z', products: { plans: ['pro', 'team'], interval: 'month' } } }))
    expect(result.log.filter(entry => entry.kind === 'discount').map(entry => entry.note)).toEqual(['name, endsAt, maxRedemptions, products, percentOff', 'at most 2 per customer'])
    expect(discountOf('launch')).toMatchObject({ name: 'Launch', basisPoints: 2500, maxRedemptions: 200, maxRedemptionsPerCustomer: 2, productIds: [product('pro'), product('team')] })
    expect(result.ids.discounts?.launch).toMatchObject({ percentOff: 25, endsAt: '2099-06-30T00:00:00.000Z' })
  })

  it('reports an amount changed after a redemption, and a changed duration, as drift: retire and re-key', async () => {
    await sync(catalog({ launch }))
    discountOf('launch')!.redemptionsCount = 1
    const amount = await sync(catalog({ launch: { ...launch, percentOff: 50 } }))
    expect(amount.log.find(entry => entry.kind === 'discount')).toMatchObject({ action: 'drift', note: expect.stringMatching(/20% off, catalog says 50%.*retire the key/) })
    expect(discountOf('launch')!.basisPoints).toBe(2000)
    const duration = await sync(catalog({ launch: { ...launch, duration: 'forever' } }))
    expect(duration.log.find(entry => entry.kind === 'discount')).toMatchObject({ action: 'drift', note: expect.stringMatching(/lasts repeating, catalog says forever/) })
  })

  it('retires a discount: ended now, its code freed for a new key, which takes it over in the same run', async () => {
    await sync(catalog({ launch }))
    const result = await sync(catalog({ launch: { ...launch, retired: true }, launch2: { ...launch, percentOff: 30 } }))
    const old = fake.state.discounts[stableId('discount', 'launch')]!
    expect(old).toMatchObject({ code: null, metadata: { managedBy: 'nuxt-backend', key: 'launch', retired: true } })
    expect(old.endsAt).toBeLessThanOrEqual(Date.now())
    expect(discountOf('launch2')).toMatchObject({ code: 'LAUNCH20', basisPoints: 3000 })
    expect(result.log.filter(entry => entry.kind === 'discount').map(entry => [entry.action, entry.key])).toEqual([['archived', 'launch'], ['created', 'launch2'], ['updated', 'launch2']])
    expect(Object.keys(result.ids.discounts ?? {})).toEqual(['launch2'])
    // Retired already: nothing more to do.
    const again = await sync(catalog({ launch: { ...launch, retired: true }, launch2: { ...launch, percentOff: 30 } }))
    expect(again.log.find(entry => entry.key === 'launch')).toMatchObject({ action: 'exists', note: 'retired' })
  })

  it('reports a managed discount whose key left the catalog, and leaves it as it is', async () => {
    await sync(catalog({ launch }))
    const result = await sync(catalog({}))
    expect(result.log).toContainEqual(expect.objectContaining({ action: 'drift', kind: 'discount', key: 'launch', note: expect.stringMatching(/stays redeemable until it is retired/) }))
    expect(discountOf('launch')!.endsAt).toBe(Date.parse(ENDS))
  })

  it('warns about a public code without limits, and a deadline moved later after the start', async () => {
    const open = await sync(catalog({ open: { name: 'Open', percentOff: 10, duration: 'once', code: 'OPEN10', products: { plans: ['team'] } } }))
    expect(open.log).toContainEqual(expect.objectContaining({ action: 'warn', key: 'open', note: expect.stringMatching(/no maxRedemptions, endsAt, perCustomer/) }))
    await sync(catalog({ launch }))
    const later = await sync(catalog({ launch: { ...launch, endsAt: '2100-01-31T00:00:00Z' } }))
    expect(later.log).toContainEqual(expect.objectContaining({ action: 'warn', key: 'launch', note: expect.stringMatching(/a deadline that moves is not a real one/) }))
  })

  it('only says what it would do on a dry run', async () => {
    // Its product is created in the same run: the discount waits for it.
    const fresh = await sync(catalog({ launch }), { dryRun: true })
    expect(fresh.log).toContainEqual({ action: 'would-create', kind: 'discount', key: 'launch', note: 'once pro exist' })
    expect(fake.state.discounts).toEqual({})
    await sync(catalog({}))
    const result = await sync(catalog({ launch }), { dryRun: true })
    expect(result.log).toContainEqual({ action: 'would-create', kind: 'discount', key: 'launch' })
    expect(fake.state.discounts).toEqual({})
  })

  it('never pushes a discount for a product it has no id for: the provider would read none as every product', async () => {
    const ids = { products: {}, meters: {} }
    const client = new PolarCore({ accessToken: 'polar_oat_fake', server: 'sandbox' }) as unknown as Polar
    await expect(syncDiscounts(catalog({ launch }), { client, limitTarget: { environment: 'sandbox', accessToken: 'polar_oat_fake' }, ids, currency: 'usd', dryRun: false, adopt: {}, log: [] }))
      .rejects.toThrow(/applies to pro, which the sync has no product id for/)
    expect(fake.state.discounts).toEqual({})
  })

  it.each([
    ['a 100% forever discount with a code', { ...launch, percentOff: 100, duration: 'forever' as const }, /100% off forever with a code/],
    ['months that are no whole years on a yearly price', { ...launch, products: { plans: ['pro'] } }, /lasts 3 months and applies to a yearly price/],
    ['a plan the catalog does not declare', { ...launch, products: { plans: ['gold'] } }, /names plan 'gold'/],
    ['the free plan', { ...launch, duration: 'once' as const, products: { plans: ['free'] } }, /names the free plan/],
    ['no products', { ...launch, products: {} }, /applies to nothing/],
    ['a code that is no code', { ...launch, code: 'LAUNCH-20' }, /3 to 64 letters and digits/],
    ['both kinds of amount', { ...launch, amountOff: 500 } as unknown as CatalogDiscount, /one of `percentOff` and `amountOff`/],
    ['a percentage with three decimals', { ...launch, percentOff: 12.345 }, /at most two decimals/],
    ['an end before its start', { ...launch, startsAt: '2099-12-31T00:00:00Z', endsAt: '2099-01-01T00:00:00Z' }, /ends before it starts/],
  ])('refuses %s before the provider hears of anything', async (_, discount, message) => {
    await expect(sync(catalog({ launch: discount }))).rejects.toThrow(message)
    expect(fake.state.products).toEqual({})
  })

  it('refuses two discounts with one code, and a fixed amount that misses a currency the products are priced in', async () => {
    await expect(sync(catalog({ launch, again: { ...launch, code: 'launch20' } }))).rejects.toThrow(/has the code of discount 'launch'/)
    const twoCurrencies = catalog({ deal: { name: 'Deal', amountOff: { usd: 500 }, duration: 'once', products: { packs: ['credits500'] } } }, {
      packs: { credits500: { name: '500 credits', price: { usd: 2000, eur: 1800 }, credits: { meter: 'credits', units: 500 } } },
    })
    await expect(sync(twoCurrencies)).rejects.toThrow(/no `amountOff` in eur/)
    expect(fake.state.products).toEqual({})
  })
})

describe('the fake provider\'s discounts, as the provider keeps them', () => {
  const core = () => new PolarCore({ accessToken: 'polar_oat_fake', server: 'sandbox' })

  it('takes a fixed amount in the checkout\'s currency only, and holds a customer to the per-customer limit', async () => {
    await sync(catalog({ packdeal: { name: 'Pack deal', amountOff: 500, duration: 'once', perCustomer: 1, products: { packs: ['credits500'] } } }))
    const discountId = stableId('discount', 'packdeal')
    const first = await checkoutsCreate(core(), { products: [product('credits500')], externalCustomerId: 'org_1', discountId })
    expect(first.ok && first.value.discountAmount).toBe(500)
    await fake.handle(new Request(`${first.ok ? first.value.url : ''}/pay`, { method: 'POST', headers: { 'origin': BASE, 'content-type': 'application/x-www-form-urlencoded' } }))
    // The same customer again: refused at checkout, as the provider does.
    const second = await checkoutsCreate(core(), { products: [product('credits500')], externalCustomerId: 'org_1', discountId })
    expect(second.ok).toBe(false)
    // Another customer, in a currency the discount names no amount in: refused too.
    fake.state.discounts[discountId]!.maxRedemptionsPerCustomer = null
    fake.state.discounts[discountId]!.amounts = { eur: 400 }
    const euro = await checkoutsCreate(core(), { products: [product('credits500')], externalCustomerId: 'org_2', discountId })
    expect(euro.ok).toBe(false)
  })

  it('puts a discount on a subscription from its next payment, takes it off for its months, then lets it lapse', async () => {
    await sync(catalog({ founder: { name: 'Founder', percentOff: 30, duration: { months: 1 }, products: { plans: ['pro'], interval: 'month' } } }))
    const checkout = await checkoutsCreate(core(), { products: [product('pro')], externalCustomerId: 'org_1' })
    await fake.handle(new Request(`${checkout.ok ? checkout.value.url : ''}/pay`, { method: 'POST', headers: { 'origin': BASE, 'content-type': 'application/x-www-form-urlencoded' } }))
    const subscription = Object.values(fake.state.subscriptions)[0]!
    const discountId = stableId('discount', 'founder')
    const applied = await subscriptionsUpdate(core(), { id: subscription.id, subscriptionUpdate: { discountId } })
    expect(applied.ok && applied.value.discountId).toBe(discountId)
    // The redemption counts towards the cap; the per-customer limit is never asked on this path.
    expect(fake.state.discounts[discountId]).toMatchObject({ redemptionsCount: 1 })
    expect((await subscriptionsUpdate(core(), { id: subscription.id, subscriptionUpdate: { discountId } })).ok).toBe(false)
    const renew = () => fake.handle(new Request(`${BASE}/_fake/clock`, { method: 'POST', body: JSON.stringify({ action: 'renew' }) }))
    await renew()
    const cycles = () => Object.values(fake.state.orders).filter(order => order.billingReason === 'subscription_cycle').map(order => [order.subtotalAmount, order.discountAmount])
    expect(cycles()).toEqual([[2900, 870]])
    // A month after its first payment it has run its course: the next one is full price.
    fake.state.subscriptions[subscription.id]!.discountAppliedAt = Date.now() - 32 * 24 * 60 * 60 * 1000
    await renew()
    expect(cycles()).toEqual([[2900, 870], [2900, 0]])
    expect(fake.state.subscriptions[subscription.id]!.discountId).toBeNull()
  })

  it('refuses a changed type or duration always, and a changed amount once redeemed', async () => {
    await sync(catalog({ launch }))
    const id = stableId('discount', 'launch')
    const patch = (body: Record<string, unknown>) => fake.handle(new Request(`${BASE}/v1/discounts/${id}`, { method: 'PATCH', headers: { 'authorization': 'Bearer sandbox', 'content-type': 'application/json' }, body: JSON.stringify(body) }))
    expect((await patch({ duration: 'forever' })).status).toBe(422)
    expect((await patch({ type: 'fixed' })).status).toBe(422)
    expect((await patch({ basis_points: 2500 })).status).toBe(200)
    fake.state.discounts[id]!.redemptionsCount = 1
    expect((await patch({ basis_points: 3000 })).status).toBe(422)
    expect((await patch({ duration_in_months: 6 })).status).toBe(422)
    expect(fake.state.discounts[id]).toMatchObject({ basisPoints: 2500, durationInMonths: 3 })
  })
})

describe('doctor — promotions', () => {
  const state: BillingOrganizationState = {
    slug: 'acme',
    allowMultipleSubscriptions: false,
    prorationBehavior: 'invoice',
    benefitRevocationGracePeriod: 0,
    preventTrialAbuse: true,
    customerEmailsOff: [],
    portal: { updatePlan: true, pause: false },
    benefitTypeByKey: {},
    memberModel: true,
    membersReadable: true,
    productByKey: {},
  }
  const finding = (shape: BillingCatalog, id: string, organization: BillingOrganizationState | null = state) =>
    collectBillingFindings(shape, organization, { tokenPresent: true }).find(entry => entry.id === id)

  it('warns about a public promotion without a per-customer limit, a cap or an end', () => {
    expect(finding(catalog({ launch }), 'billing-promotion-limits')).toMatchObject({ status: 'pass' })
    const open = finding(catalog({ launch: { ...launch, perCustomer: undefined, endsAt: undefined } }), 'billing-promotion-limits', null)
    expect(open).toMatchObject({ status: 'warn', message: expect.stringMatching(/launch \(no perCustomer, endsAt\)/) })
    // A discount only the server applies needs none of them; no discount, no finding.
    expect(finding(catalog({ founder: { name: 'Founder', percentOff: 30, duration: 'forever', products: { plans: ['pro'] } } }), 'billing-promotion-limits')).toMatchObject({ status: 'pass' })
    expect(finding(catalog({}), 'billing-promotion-limits')).toBeUndefined()
  })

  it('warns about a forever discount for some plans while the portal changes plans', () => {
    const scoped = catalog({ founder: { name: 'Founder', percentOff: 30, duration: 'forever', products: { plans: ['pro'] } } })
    expect(finding(scoped, 'billing-promotion-portal')).toMatchObject({ status: 'warn', message: expect.stringMatching(/founder takes money off forever on some plans only/) })
    expect(finding(scoped, 'billing-promotion-portal', { ...state, portal: { updatePlan: false, pause: false } })).toMatchObject({ status: 'pass' })
    expect(finding(catalog({ founder: { name: 'Founder', percentOff: 30, duration: 'forever', products: { plans: ['pro', 'team'] } } }), 'billing-promotion-portal')).toMatchObject({ status: 'pass' })
  })

  it('asks production for every promotion that is not retired', () => {
    const shape = catalog({ launch, old: { ...launch, code: 'OLD20', retired: true } })
    expect(missingProductionIds(shape, { products: {}, meters: {} })).toContain('discount launch')
    expect(missingProductionIds(shape, { products: {}, meters: {} })).not.toContain('discount old')
  })

  it('reads a discount\'s products as the generated map names them', () => {
    expect(discountProductKeys({ products: { plans: ['pro', 'team'], packs: ['credits500'] } }, catalog({}))).toEqual(['pro', 'pro:year', 'team', 'credits500'])
    expect(discountProductKeys({ products: { plans: ['pro'], interval: 'year' } }, catalog({}))).toEqual(['pro:year'])
  })
})
