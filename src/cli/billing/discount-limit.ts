import { ServerList } from '@polar-sh/sdk/lib/config.js'
import type { Environment } from './provider'

// The one raw provider call the catalog's promotions make: a discount's
// per-customer redemption limit (`max_redemptions_per_customer`). The live
// API has it on create, update and read; the installed SDK (0.49) has no
// trace of it, and its schemas strip unknown keys both ways, so `billing
// sync` can neither send it nor read it back through the SDK. Every request
// pins an API version that has the field. Moving to the 1.x SDK (UP2)
// deletes this file: the SDK's own discount calls then carry the limit.

/** The API version the raw calls pin: one that has the per-customer limit. */
export const DISCOUNT_LIMIT_API_VERSION = '2026-10'

/** Where `billing sync` sends the raw calls: the provider's environment, with its token. */
export interface DiscountLimitTarget {
  environment: Environment
  accessToken: string
}

/** The discount's own URL at the target: the provider's server for its environment. */
function discountUrl({ environment }: DiscountLimitTarget, id: string): string {
  return `${ServerList[environment]}/v1/discounts/${encodeURIComponent(id)}`
}

/** One raw request, with the token and the pinned version. */
async function request(target: DiscountLimitTarget, id: string, init: { method: 'GET' | 'PATCH', body?: unknown }): Promise<Record<string, unknown>> {
  // fallow-ignore-next-line security-sink -- the billing provider's own API host for the environment (the SDK's ServerList); verified 2026-10-19
  const response = await fetch(discountUrl(target, id), {
    method: init.method,
    headers: {
      'authorization': `Bearer ${target.accessToken}`,
      'accept': 'application/json',
      'polar-version': DISCOUNT_LIMIT_API_VERSION,
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
  if (!response.ok) throw new Error(`the provider answered ${response.status}`)
  return await response.json() as Record<string, unknown>
}

/** The limit in a raw discount: a whole number, or `null` for none (or a version that does not report it). */
function limitOf(discount: Record<string, unknown>): number | null {
  const value = discount.max_redemptions_per_customer
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null
}

/**
 * A discount's per-customer limit as the provider holds it: a whole number,
 * or `null` for none. Throws when the provider can't be read.
 *
 * @internal
 */
export async function readPerCustomerLimit(target: DiscountLimitTarget, id: string): Promise<number | null> {
  // fallow-ignore-next-line security-sink -- the provider's own API host for the environment (the SDK's ServerList), and an id the provider listed; verified 2026-10-19
  return limitOf(await request(target, id, { method: 'GET' }))
}

/**
 * Set a discount's per-customer limit (`null` lifts it), and answer the
 * limit the provider then holds. Throws when the provider refuses.
 *
 * @internal
 */
export async function writePerCustomerLimit(target: DiscountLimitTarget, id: string, limit: number | null): Promise<number | null> {
  // fallow-ignore-next-line security-sink -- the provider's own API host for the environment (the SDK's ServerList), and an id the provider listed; verified 2026-10-19
  return limitOf(await request(target, id, { method: 'PATCH', body: { max_redemptions_per_customer: limit } }))
}
