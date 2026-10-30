/// <reference types="vite/client" />

import { Polar } from '@convex-dev/polar'
import { checkoutsClientUpdate } from '@polar-sh/sdk/funcs/checkoutsClientUpdate.js'
import { checkoutsCreate } from '@polar-sh/sdk/funcs/checkoutsCreate.js'
import { customersGet } from '@polar-sh/sdk/funcs/customersGet.js'
import { convexTest, type TestConvex } from 'convex-test'
import type { FunctionReference } from 'convex/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import component from '../../src/convex/test'
import schema from '../../src/convex/components/backend/schema'
import { api } from '../../src/convex/components/backend/_generated/api'
import { setupBilling, type SetupBillingConfig } from '../../src/convex/integrations/billing'

// The checkout's discount-code limit end to end: the billing integration's
// checkout against the real component (run as the root app, see
// billing.test.ts), with only the provider faked. Parallel checkouts with a
// code must not get more codes to the provider than the limit, whatever the
// app's own rate limiter: the attempt is reserved in one component
// transaction before the provider is asked.

vi.mock('@polar-sh/sdk/funcs/checkoutsClientUpdate.js', () => ({ checkoutsClientUpdate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/checkoutsCreate.js', () => ({ checkoutsCreate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/customersGet.js', () => ({ customersGet: vi.fn() }))

const mockCheckoutsClientUpdate = vi.mocked(checkoutsClientUpdate)
const mockCheckoutsCreate = vi.mocked(checkoutsCreate)
const mockCustomersGet = vi.mocked(customersGet)

/** The package's limit: ten refused codes an hour per billing entity. */
const LIMIT = 10

let t: TestConvex<typeof schema>

/** A provider answer one tick later, so parallel checkouts interleave at every call. */
const later = <T>(value: T) => new Promise<T>(resolve => setTimeout(() => resolve(value), 1))
const refused = () => later({ ok: false, error: Object.assign(new Error('refused'), { statusCode: 422 }) })
const down = () => later({ ok: false, error: Object.assign(new Error('down'), { statusCode: 503 }) })

/**
 * Billing for the signed-in user with the component's real billing
 * functions; the provider component's references and the auth adapter's
 * are strings no call here reaches the component with.
 */
function makeBilling() {
  const components = {
    polar: { lib: { insertCustomer: 'ref:insertCustomer' } },
    backend: { adapter: { findOne: 'ref:findOne' }, billing: api.billing, gifts: {} },
  }
  return setupBilling(components as never, {
    email: { sendTemplate: async () => null },
    accessToken: 'oat_test',
    billTo: 'user',
    products: { a: 'prod_a' },
    trustedOrigins: ['https://app'],
  } as unknown as SetupBillingConfig)
}

/** The fresh account read every billing call makes: u1 exists and is not banned. */
const account = (ref: unknown, args: unknown): unknown =>
  ref === 'ref:findOne' && (args as { model?: string }).model === 'user' ? { role: 'user', banned: false } : null

/** An action ctx whose component calls run in the convex-test deployment. */
function makeCtx() {
  return {
    runQuery: async (ref: unknown, args: unknown): Promise<unknown> =>
      typeof ref === 'string' ? account(ref, args) : t.query(ref as FunctionReference<'query'>, args as never),
    runMutation: async (ref: unknown, args: unknown): Promise<unknown> =>
      typeof ref === 'string' ? null : t.mutation(ref as FunctionReference<'mutation'>, args as never),
    auth: { getUserIdentity: async () => ({ subject: 'u1', email: 'u1@example.com' }) },
  }
}

const args = { productIds: ['prod_a'], origin: 'https://app', successUrl: 'https://app/done' }

/** Run a checkout with this code and answer the refusal's code, or `ok`. */
async function checkout(discountCode: string, billing = makeBilling()): Promise<string> {
  const generate = billing.api.generateCheckoutLink as unknown as (ctx: unknown, args: unknown) => Promise<unknown>
  return generate(makeCtx(), { ...args, discountCode })
    .then(() => 'ok', (error: { data?: { code?: string } }) => error.data?.code ?? String(error))
}

const counted = async () => (await t.run(ctx => ctx.db.query('billingDiscountAttempts').collect())).map(row => row.refused)

beforeEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  t = convexTest(schema, component.modules)
  // The billing entity (the user, u1) already pays through its own customer,
  // keyed by its id; it has no trial to spend and the product offers none.
  vi.spyOn(Polar.prototype, 'getCustomerByUserId').mockResolvedValue({ id: 'cus_1', userId: 'u1' } as never)
  mockCustomersGet.mockResolvedValue({ ok: true, value: { id: 'cus_1', externalId: 'u1', metadata: { userId: 'u1' } } } as never)
  vi.spyOn(Polar.prototype, 'getProduct').mockResolvedValue(null as never)
  vi.spyOn(Polar.prototype, 'listAllUserSubscriptions').mockResolvedValue([] as never)
  mockCheckoutsCreate.mockImplementation(() => later({ ok: true, value: { url: 'https://checkout/1', clientSecret: 'cs_1' } }) as never)
})

describe('discount codes across parallel checkouts', () => {
  test('no more codes than the limit reach the provider, however many checkouts run at once', async () => {
    mockCheckoutsClientUpdate.mockImplementation(refused as never)

    const outcomes = await Promise.all(Array.from({ length: 25 }, (_, i) => checkout(`GUESS${i}`)))

    expect(mockCheckoutsClientUpdate).toHaveBeenCalledTimes(LIMIT)
    expect(mockCheckoutsCreate).toHaveBeenCalledTimes(LIMIT)
    expect(outcomes.filter(code => code === 'invalid_input')).toHaveLength(LIMIT)
    expect(outcomes.filter(code => code === 'rate_limited')).toHaveLength(25 - LIMIT)
    expect(await counted()).toEqual([LIMIT])
  })

  test('an accepted code does not count', async () => {
    mockCheckoutsClientUpdate.mockImplementation(() => later({ ok: true, value: {} }) as never)
    for (let i = 0; i < LIMIT + 5; i++) expect(await checkout('LAUNCH20')).toBe('ok')
    expect(await counted()).toEqual([0])

    // The entity still has every refusal of the window left.
    mockCheckoutsClientUpdate.mockImplementation(refused as never)
    const outcomes = await Promise.all(Array.from({ length: LIMIT }, (_, i) => checkout(`GUESS${i}`)))
    expect(outcomes).toEqual(Array.from({ length: LIMIT }, () => 'invalid_input'))
  })

  test('a checkout that fails before the code is tried gives the attempt back', async () => {
    mockCheckoutsCreate.mockImplementation(down as never)
    const outcomes = await Promise.all(Array.from({ length: LIMIT + 5 }, () => checkout('LAUNCH20')))
    // A wave this size may meet the limit while attempts are in flight; none of them stays counted.
    expect(outcomes.filter(code => code === 'unavailable').length).toBeGreaterThanOrEqual(LIMIT)
    expect(outcomes.every(code => code === 'unavailable' || code === 'rate_limited')).toBe(true)
    expect(mockCheckoutsClientUpdate).not.toHaveBeenCalled()
    expect(await counted()).toEqual([0])

    // So does one the provider could not check the code for.
    mockCheckoutsCreate.mockImplementation(() => later({ ok: true, value: { url: 'https://checkout/1', clientSecret: 'cs_1' } }) as never)
    mockCheckoutsClientUpdate.mockImplementation(down as never)
    expect(await checkout('LAUNCH20')).toBe('unavailable')
    expect(await counted()).toEqual([0])
  })
})
