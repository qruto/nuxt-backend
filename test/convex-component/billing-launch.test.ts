/// <reference types="vite/client" />
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { defineSchema, makeFunctionReference, type FunctionReference } from 'convex/server'
import { getBackendError } from '../../src/convex/errors'
import type { Pricing } from '../../src/convex/integrations/billing/types/records'
import type { Billing } from '../../src/convex/integrations/billing/types/surface'
import { asUser, defineBackendTestApp } from '../../src/convex/test'

// Billing not launched yet: a production deployment with no provider token
// (the provider's account review comes after early access), through the
// scaffold an app gets. The pricing answers `launched: false`, and every
// sale (a checkout, a gift checkout) is refused as `unavailable`, reason
// `not_launched`, before anything reaches the provider.

const SCAFFOLD = '../fixtures/registration/backend/'
const SITE = 'https://app.example.com'

vi.mock('../fixtures/registration/backend/billing.generated', () => ({
  catalog: {
    sandbox: { products: { pro: 'prod_sandbox_pro' }, plans: { pro: { month: 'prod_sandbox_pro' } }, packs: [], meters: {} },
    production: { products: { pro: 'prod_live_pro', credits500: 'prod_live_credits500' }, plans: { pro: { month: 'prod_live_pro' } }, packs: ['credits500'], gifts: { credits500: 'prod_live_credits500_gift' }, meters: {} },
  },
}))

vi.stubEnv('BACKEND_ENVIRONMENT', 'production')
vi.stubEnv('BILLING_ACCESS_TOKEN', '')
vi.stubEnv('SITE_URL', SITE)
vi.stubEnv('AUTH_SECRET', 'billing-launch-suite-secret-0123456789abcdefghij')

const scaffold = import.meta.glob(['../fixtures/registration/backend/*.ts', '!**/convex.config.ts', '!**/auth.config.ts'])
const testApp = defineBackendTestApp(defineSchema({}), {
  ...scaffold,
  [`${SCAFFOLD}_generated/api.js`]: () => Promise.resolve({}),
})

const fn = <Kind extends 'query' | 'mutation' | 'action'>(path: string) => makeFunctionReference<Kind>(path) as FunctionReference<Kind, 'public'>
const refusal = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => getBackendError(error))
const notLaunched = { code: 'unavailable', data: { service: 'billing', reason: 'not_launched' } }

beforeAll(() => {
  for (const level of ['log', 'info', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => {})
  // Nothing may reach the provider while billing is not launched.
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    throw new Error(`fetch while billing is not launched: ${String(input)}`)
  })
})

afterAll(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('billing not launched on production', () => {
  test('the instance names the state and why', async () => {
    // The fixture is typed from the built package; `launch` is new in it.
    const { billing } = await import('../fixtures/registration/backend/billing') as unknown as { billing: Billing }
    expect(billing.launch).toEqual({ launched: false, reason: 'no_access_token' })
  })

  test('the pricing answers launched: false, for anyone', async () => {
    const t = testApp()
    expect(await t.query(fn<'query'>('billing:getPricing'), {}) as Pricing).toMatchObject({ plans: [], packs: [], launched: false })
  })

  test('a checkout is refused as not launched, before the provider is asked', async () => {
    const ada = await asUser(testApp(), { email: 'ada@example.com' })
    expect(await refusal(ada.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: ['prod_live_pro'], origin: SITE, successUrl: `${SITE}/pricing` })))
      .toMatchObject(notLaunched)
  })

  test('a gift checkout is refused as not launched too', async () => {
    const ada = await asUser(testApp(), { email: 'ada@example.com' })
    expect(await refusal(ada.action(fn<'action'>('billing:giftCheckout'), { pack: 'credits500', recipientEmail: 'grace@example.org', origin: SITE, successUrl: `${SITE}/gifts` })))
      .toMatchObject(notLaunched)
  })

  test('a signed-out caller is still asked to sign in first', async () => {
    const t = testApp()
    expect(await refusal(t.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: ['prod_live_pro'], origin: SITE, successUrl: `${SITE}/pricing` })))
      .toMatchObject({ code: 'unauthenticated' })
  })
})
