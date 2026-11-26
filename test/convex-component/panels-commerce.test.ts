/// <reference types="vite/client" />
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { makeFunctionReference, type FunctionReference } from 'convex/server'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import schema from '../../templates/panels/backend/schema'

// templates/panels/backend on another merchant of record: the template's own
// billing.ts with `BILLING_PROVIDER=stripe` and the ids a developer puts in
// billing.products.ts. Setting the env var is all it takes, so the template
// sells its own catalog there with no other change. Pricing reads the
// catalog and the free plan is the app's own; only a checkout calls Stripe.

const PANELS = '../../templates/panels/backend/'
const PRICES = { 'studio': 'price_studio_month', 'studio:year': 'price_studio_year', 'credits100': 'price_pack_100', 'credits500': 'price_pack_500' }

vi.mock('../../templates/panels/backend/billing.products', () => ({ products: { sandbox: PRICES } }))

vi.stubEnv('BILLING_PROVIDER', 'stripe')
vi.stubEnv('BILLING_ACCESS_TOKEN', 'sk_test_panels')
vi.stubEnv('BILLING_WEBHOOK_SECRET', 'whsec_panels')
vi.stubEnv('SITE_URL', 'http://localhost:3000')
vi.stubEnv('AUTH_SECRET', 'panels-commerce-secret-0123456789abcdefghijkl')

const modules = import.meta.glob(['../../templates/panels/backend/*.ts', '!**/convex.config.ts', '!**/auth.config.ts', '!**/*.test.ts'])
const testApp = defineBackendTestApp(schema, { ...modules, [`${PANELS}_generated/api.js`]: () => Promise.resolve({}) })

const fn = <Kind extends 'query' | 'mutation' | 'action'>(path: string) => makeFunctionReference<Kind>(path) as FunctionReference<Kind, 'public'>
const checkouts: URLSearchParams[] = []
const internalFn = (path: string) => makeFunctionReference<'action'>(path) as unknown as FunctionReference<'action', 'internal'>

beforeAll(() => {
  for (const level of ['log', 'info', 'warn'] as const) vi.spyOn(console, level).mockImplementation(() => {})
  vi.stubGlobal('fetch', (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input))
    if (url.host === 'api.stripe.com' && url.pathname === '/v1/checkout/sessions') {
      checkouts.push(new URLSearchParams(String(init.body ?? '')))
      return Promise.resolve(Response.json({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }))
    }
    return Promise.resolve(Response.json({ error: 'not reachable from the suite' }, { status: 503 }))
  })
})

afterAll(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('templates/panels/backend on BILLING_PROVIDER=stripe', () => {
  test('prices Studio and the packs by the ids in billing.products.ts, and starts the free plan with its credits', async () => {
    const t = testApp()
    const ada = await asUser(t, { email: 'ada@example.com' })
    expect(await t.action(internalFn('billing:startFreePlan'), { entityId: ada.workspaceId! })).toBe('started')
    const pricing = await ada.query(fn<'query'>('billing:getPricing'), {}) as { plans: Array<{ key: string, prices: Record<string, { productId?: string }> }>, packs: Array<{ productId: string }> }
    const studio = pricing.plans.find(plan => plan.key === 'studio')
    expect([studio?.prices.month?.productId, studio?.prices.year?.productId]).toEqual([PRICES.studio, PRICES['studio:year']])
    expect(pricing.packs.map(pack => pack.productId).sort()).toEqual([PRICES.credits100, PRICES.credits500])
    const credits = await ada.query(fn<'query'>('billing:getCredits'), {}) as { meters: Array<{ name?: string, balance: number }> } | null
    expect(credits?.meters.find(meter => meter.name === 'credits')?.balance).toBe(30)
  })

  test('prices in US dollars only, so a checkout the pricing page opens in its currency reaches Stripe', async () => {
    const t = testApp()
    const ada = await asUser(t, { email: 'ada@example.com' })
    await t.action(internalFn('billing:startFreePlan'), { entityId: ada.workspaceId! })
    const pricing = await ada.query(fn<'query'>('billing:getPricing'), {}) as { currencies: string[], plans: Array<{ key: string, prices: Record<string, { currency?: string }> }> }
    expect(pricing.currencies).toEqual(['usd'])
    expect(pricing.plans.find(plan => plan.key === 'studio')?.prices.month?.currency).toBe('usd')
    const { url } = await ada.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: [PRICES.studio], origin: 'http://localhost:3000', successUrl: 'http://localhost:3000/billing', currency: 'usd' }) as { url: string }
    expect(url).toBe('https://checkout.stripe.com/c/pay/cs_test_1')
    expect(checkouts.at(-1)?.get('line_items[0][price]')).toBe(PRICES.studio)
  })
})
