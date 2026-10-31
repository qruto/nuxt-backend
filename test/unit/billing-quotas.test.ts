import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PolarCore } from '@polar-sh/sdk/core.js'
import { checkoutsCreate } from '@polar-sh/sdk/funcs/checkoutsCreate.js'
import { customersGetStateExternal } from '@polar-sh/sdk/funcs/customersGetStateExternal.js'
import { syncBillingCatalog } from '../../src/cli/billing'
import { createPolarFake, type PolarFake } from '../fixtures/polar-fake/server'
import { newWebhookSecret, stableId } from '../fixtures/polar-fake/state'
import { type BillingCatalog, grantedQuotas, isSeatLikeQuota, planQuotasKey, SEAT_WORDS } from '../../src/convex/catalog'

// Plan quotas in `billing sync`, on the fake provider through the
// provider SDK: refused before anything is written when they count people
// or are malformed, carried by one `<plan>-quotas` feature-flag benefit
// with `quota_<key>` metadata, pushed when they change, attached to the
// plan's products that exist already, and granted by the provider to the
// people subscribed then.

const BASE = 'http://127.0.0.1:4747'
const root = join(import.meta.dirname, '../..')

const CATALOG: BillingCatalog = {
  plans: {
    pro: { name: 'Pro', prices: { month: 2900, year: 29000 }, quotas: { projects: 10, exports: 'unlimited' } },
    team: { name: 'Team', prices: { month: 9900 }, quotas: { projects: 'unlimited' } },
    starter: { name: 'Starter', prices: { month: 900 } },
  },
  quotas: { projects: { description: 'Projects' }, exports: { description: 'Exports' } },
}

let fake: PolarFake
/** The events the fake provider posted to the deployment's endpoint, by type. */
let delivered: string[]

beforeEach(() => {
  const sink: string[] = []
  delivered = sink
  fake = createPolarFake({
    baseUrl: BASE,
    fetcher: async (_url, init) => {
      sink.push((JSON.parse(String(init.body)) as { type: string }).type)
      return new Response('Accepted', { status: 202 })
    },
  })
  fake.ensureEndpoint('http://127.0.0.1:3211/billing/events', newWebhookSecret())
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => fake.handle(new Request(input, init)))
})

afterEach(async () => {
  await fake.idle()
  fake.close()
  vi.unstubAllGlobals()
})

const sync = (catalog: BillingCatalog, extra: { dryRun?: boolean, adopt?: Record<string, string> } = {}) =>
  syncBillingCatalog(catalog, { rootDir: root, environment: 'sandbox', accessToken: 'polar_oat_fake', dryRun: extra.dryRun ?? false, adopt: extra.adopt ?? {} })

const benefitOf = (key: string) => Object.values(fake.state.benefits).find(benefit => benefit.metadata.key === key)
const productOf = (key: string) => fake.state.products[stableId('product', key)]!

describe('quota keys', () => {
  it('count people when their last word names them, whatever the case or separator', () => {
    for (const key of ['members', 'seats', 'users', 'user', 'maxUsers', 'team_members', 'extra-seats', 'Collaborators', 'teammates', 'guests', 'people', 'memberships']) expect(isSeatLikeQuota(key), key).toBe(true)
    for (const key of ['projects', 'user_projects', 'seating_charts', 'usersnaps', 'boards', 'guest_passes']) expect(isSeatLikeQuota(key), key).toBe(false)
  })

  it('count people when only words about the count follow them: a limit, a total, a workspace', () => {
    for (const key of ['seat_count', 'seat_limit', 'member_count', 'memberLimit', 'seatCount', 'seatsTotal', 'users_max', 'user_count', 'max_seats_allowed', 'max_members_count', 'team_member_count', 'users_per_workspace', 'collaboratorsPerTeam']) {
      expect(isSeatLikeQuota(key), key).toBe(true)
    }
    for (const key of ['sites_per_workspace', 'max_projects', 'team_projects', 'projectCount', 'max']) expect(isSeatLikeQuota(key), key).toBe(false)
  })

  it('refuses every word the docs list as people', () => {
    for (const word of SEAT_WORDS) expect(isSeatLikeQuota(word), word).toBe(true)
  })

  it('grant the most any benefit allows, unlimited above every number, and nothing for a value no gate can read', () => {
    const limits = grantedQuotas([
      { metadata: { key: 'pro-quotas', quota_projects: 10, quota_exports: 3 } },
      { metadata: { quota_projects: 25, quota_exports: 'unlimited' } },
      { metadata: { quota_sites: -1, quota_pages: 2.5, quota_forms: 'lots', quota_ok: true } },
      { metadata: { 'quota_': 5, 'quota_ bad key': 5, 'projects': 99 } },
      { metadata: null },
    ])
    expect(Object.fromEntries(limits)).toEqual({ projects: 25, exports: Number.POSITIVE_INFINITY, sites: 0, pages: 0, forms: 0, ok: 0 })
  })
})

describe('billing sync, with plan quotas', () => {
  it('refuses quotas that count people, before the provider hears of anything', async () => {
    await expect(sync({ ...CATALOG, quotas: { members: { description: 'Members' } } })).rejects.toThrow(/quotas\.members counts people/)
    await expect(sync({ ...CATALOG, quotas: { ...CATALOG.quotas, maxSeats: { description: 'Seats' } } })).rejects.toThrow(/never priced per seat/)
    expect(fake.state.benefits).toEqual({})
    expect(fake.state.products).toEqual({})
  })

  it('refuses a seat by another name, before the provider hears of anything', async () => {
    await expect(sync({ ...CATALOG, quotas: { ...CATALOG.quotas, seat_limit: { description: 'seats' } } })).rejects.toThrow(/quotas\.seat_limit counts people/)
    expect(fake.state.benefits).toEqual({})
  })

  it('refuses a catalog key that is a plan\'s quotas benefit key, for every plan', async () => {
    await expect(sync({ ...CATALOG, features: { 'pro-quotas': { description: 'Pro extras' } } })).rejects.toThrow(/pro-quotas is the key of a plan's quotas benefit/)
    // A plan that sets no quota today may set some later.
    await expect(sync({ ...CATALOG, features: { 'starter-quotas': { description: 'Starter extras' } } })).rejects.toThrow(/starter-quotas is the key/)
    expect(fake.state.benefits).toEqual({})
  })

  it('refuses more quotas on one plan than the provider\'s metadata holds, before writing anything', async () => {
    const keys = Array.from({ length: 49 }, (_, index) => `q${index}`)
    const catalog: BillingCatalog = {
      quotas: Object.fromEntries(keys.map(key => [key, { description: key }])),
      plans: { pro: { name: 'Pro', prices: { month: 2900 }, quotas: Object.fromEntries(keys.map(key => [key, 1])) } },
    }
    await expect(sync(catalog)).rejects.toThrow(/plans\.pro sets 49 quotas, and its <plan>-quotas benefit holds at most 48/)
    expect(fake.state.meters).toEqual({})
    expect(fake.state.benefits).toEqual({})
  })

  it('refuses a quota a plan sets but the catalog does not declare, a limit that is no whole number, and a key that would not fit', async () => {
    const plan = (quotas: Record<string, number | 'unlimited'>) => ({ ...CATALOG, plans: { pro: { name: 'Pro', prices: { month: 2900 }, quotas } } })
    await expect(sync(plan({ sites: 3 }))).rejects.toThrow(/plans\.pro\.quotas\.sites is not declared/)
    for (const limit of [-1, 2.5, Number.POSITIVE_INFINITY, 'lots' as never]) {
      await expect(sync(plan({ projects: limit }))).rejects.toThrow(/a whole number of at least 0, or 'unlimited'/)
    }
    await expect(sync({ ...CATALOG, quotas: { 'a-key-far-too-long-for-provider-metadata': { description: 'Long' } } })).rejects.toThrow(/is not a quota key/)
    expect(fake.state.benefits).toEqual({})
  })

  it('carries a plan\'s quotas on one feature-flag benefit, attached to each of its products, and maps the catalog\'s quotas to what they count', async () => {
    const { ids, log } = await sync(CATALOG)
    const pro = benefitOf(planQuotasKey('pro'))!
    expect(pro).toMatchObject({ type: 'feature_flag', description: 'Pro limits', metadata: { managedBy: 'nuxt-backend', key: 'pro-quotas', quota_projects: 10, quota_exports: 'unlimited' } })
    expect(benefitOf('team-quotas')!.metadata).toMatchObject({ quota_projects: 'unlimited' })
    // A plan that sets none carries none.
    expect(benefitOf('starter-quotas')).toBeUndefined()
    expect(productOf('pro').benefitIds).toEqual([pro.id])
    expect(productOf('pro:year').benefitIds).toEqual([pro.id])
    expect(ids.quotas).toEqual({ projects: 'Projects', exports: 'Exports' })
    expect(log.filter(entry => entry.kind === 'benefit').map(entry => [entry.action, entry.key])).toEqual([['created', 'pro-quotas'], ['created', 'team-quotas']])
    // A second run finds everything as it is.
    const again = await sync(CATALOG)
    expect(again.log.filter(entry => entry.action !== 'exists')).toEqual([])
  })

  it('pushes a changed quota to the benefit, keeping its other metadata, and says what moved', async () => {
    await sync(CATALOG)
    const changed: BillingCatalog = { ...CATALOG, plans: { ...CATALOG.plans, pro: { ...CATALOG.plans!.pro!, quotas: { projects: 20 } } } }
    const preview = await sync(changed, { dryRun: true })
    expect(preview.log).toContainEqual(expect.objectContaining({ action: 'would-update', kind: 'benefit', key: 'pro-quotas', note: 'exports unlimited → none, projects 10 → 20' }))
    expect(benefitOf('pro-quotas')!.metadata.quota_projects).toBe(10)
    const { log } = await sync(changed)
    expect(log).toContainEqual(expect.objectContaining({ action: 'updated', kind: 'benefit', key: 'pro-quotas', note: expect.stringContaining('projects 10 → 20') }))
    expect(benefitOf('pro-quotas')!.metadata).toEqual({ managedBy: 'nuxt-backend', key: 'pro-quotas', quota_projects: 20 })
    // The provider tells the deployment, which patches the benefit's snapshot at once.
    await fake.idle()
    expect(delivered).toContain('benefit.updated')
  })

  it('attaches quotas a plan gains later to the products that exist, and the provider grants them to the people subscribed then', async () => {
    const before: BillingCatalog = { plans: { pro: { name: 'Pro', prices: { month: 2900 } } } }
    const { ids } = await sync(before)
    const polar = new PolarCore({ accessToken: 'polar_oat_fake', server: 'sandbox' })
    const checkout = await checkoutsCreate(polar, { products: [ids.products.pro!], externalCustomerId: 'org_1' })
    if (!checkout.ok) throw checkout.error
    await fake.handle(new Request(`${checkout.value.url}/pay`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'origin': BASE } }))

    const preview = await sync(CATALOG, { dryRun: true })
    expect(preview.log).toContainEqual(expect.objectContaining({ action: 'would-update', kind: 'product', key: 'pro', note: expect.stringContaining('grants its current subscribers too') }))
    const { log } = await sync({ ...CATALOG, plans: { pro: { ...CATALOG.plans!.pro!, prices: { month: 2900 } } } })
    expect(log).toContainEqual(expect.objectContaining({ action: 'updated', kind: 'product', key: 'pro', id: ids.products.pro }))
    const state = await customersGetStateExternal(polar, { externalId: 'org_1' })
    if (!state.ok) throw state.error
    expect(state.value.grantedBenefits.map(grant => grant.benefitId)).toEqual([benefitOf('pro-quotas')!.id])
    await fake.idle()
    expect(delivered.slice(delivered.lastIndexOf('product.updated'))).toEqual(['product.updated', 'benefit_grant.created', 'customer.state_changed'])
  })

  it('keeps a retired plan\'s quotas on its archived products, for the people still on it', async () => {
    await sync({ plans: { pro: { name: 'Pro', prices: { month: 2900 } } } })
    await sync({ ...CATALOG, plans: { pro: { ...CATALOG.plans!.pro!, prices: { month: 2900 }, retired: true } } })
    expect(productOf('pro')).toMatchObject({ isArchived: true, benefitIds: [benefitOf('pro-quotas')!.id] })
  })

  it('leaves an adopted product\'s benefits as they are, and says where to attach the quotas', async () => {
    const { ids } = await sync({ plans: { pro: { name: 'Pro', prices: { month: 2900 } } } })
    const { log } = await sync({ ...CATALOG, plans: { pro: { ...CATALOG.plans!.pro!, prices: { month: 2900 } } } }, { adopt: { pro: ids.products.pro! } })
    expect(log).toContainEqual(expect.objectContaining({ action: 'warn', kind: 'product', key: 'pro', note: expect.stringContaining('attach pro-quotas in the provider dashboard') }))
    expect(productOf('pro').benefitIds).toEqual([])
  })

  it('clears the limits of a plan that dropped its quotas, as it clears a dropped key\'s, and reports the benefit left in place as drift', async () => {
    await sync(CATALOG)
    const dropped: BillingCatalog = { ...CATALOG, plans: { ...CATALOG.plans, team: { name: 'Team', prices: { month: 9900 } } } }
    const preview = await sync(dropped, { dryRun: true })
    expect(preview.log).toContainEqual(expect.objectContaining({ action: 'would-update', kind: 'benefit', key: 'team-quotas', note: 'projects unlimited → none' }))
    const { log } = await sync(dropped)
    expect(log).toContainEqual(expect.objectContaining({ action: 'updated', kind: 'benefit', key: 'team-quotas', note: expect.stringContaining('projects unlimited → none') }))
    // The drift line says why it is both emptied and left: no contradiction with the update above.
    expect(log).toContainEqual(expect.objectContaining({ action: 'drift', kind: 'benefit', key: 'team-quotas', note: expect.stringContaining('its plan sets no quotas now') }))
    expect(benefitOf('team-quotas')!.metadata).toEqual({ managedBy: 'nuxt-backend', key: 'team-quotas' })
    expect(productOf('team').benefitIds).toEqual([benefitOf('team-quotas')!.id])
    // Nothing left to clear: the next run writes nothing.
    const again = await sync(dropped)
    expect(again.log.filter(entry => entry.kind === 'benefit' && entry.key === 'team-quotas').map(entry => entry.action)).toEqual(['drift'])
  })
})
