import { describe, expect, it, vi } from 'vitest'
import { type BillingComponents, setupBilling, type SetupBillingConfig } from '../../src/convex/integrations/billing'

// `getWebhookDeliveries` serves the deployment-wide delivery log — every
// account's provider delivery ids, event types, outcomes and handler errors —
// so it sits behind `refundOrder`'s admin gate. Anyone else reads `null`,
// never an error: the DevTools panel subscribes to it reactively, and a
// throwing query would be retried on every reconnect.

const listRecent = 'ref:webhooks.listRecent'

const components = {
  polar: { lib: { insertCustomer: 'ref:insertCustomer' } },
  backend: {
    billing: {},
    gifts: {},
    webhooks: { record: 'ref:webhooks.record', find: 'ref:webhooks.find', listRecent },
  },
} as unknown as BillingComponents

const log = [{ service: 'billing', deliveryId: 'wh_1', type: 'order.paid', outcome: 'ok', receivedAt: 1 }]

const member = { subject: 'u1', email: 'member@example.com' }
const admin = { ...member, role: 'admin' }

function read(claims: Record<string, unknown> | null, config: Partial<SetupBillingConfig> = {}, args: { limit?: number } = {}) {
  const billing = setupBilling(components, { email: { sendTemplate: async () => null }, ...config } as SetupBillingConfig)
  const ctx = {
    auth: { getUserIdentity: vi.fn(async () => claims) },
    runQuery: vi.fn(async (ref: unknown, _args?: unknown) => ref === listRecent ? log : null),
  }
  const handler = (billing.functions.getWebhookDeliveries as unknown as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler
  return { ctx, result: handler(ctx, args) }
}

describe('getWebhookDeliveries — admin-only', () => {
  it('answers a signed-out caller null, without reading the log', async () => {
    const { ctx, result } = read(null)

    await expect(result).resolves.toBeNull()
    expect(ctx.runQuery).not.toHaveBeenCalled()
  })

  it.each([
    ['no role', member],
    ['the plain user role', { ...member, role: 'user' }],
    ['a role that only contains the word', { ...member, role: 'administrator' }],
    ['a role claim that is not a string', { ...member, role: ['admin'] }],
    // A token minted before the ban still carries the role until it expires.
    ['the admin role on a banned account', { ...member, role: 'admin', banned: true }],
  ])('answers a signed-in member with %s null', async (_, claims) => {
    const { ctx, result } = read(claims)

    await expect(result).resolves.toBeNull()
    expect(ctx.runQuery).not.toHaveBeenCalled()
  })

  it('serves an admin the log, passing the limit through', async () => {
    const { ctx, result } = read(admin, {}, { limit: 15 })

    await expect(result).resolves.toBe(log)
    expect(ctx.runQuery).toHaveBeenCalledWith(listRecent, { limit: 15 })
  })

  it('reads a comma-separated role claim, as the admin plugin stores it', async () => {
    await expect(read({ ...member, role: 'user, admin' }).result).resolves.toBe(log)
  })

  it('defers to a custom requireAdmin gate, a refusal reading as null', async () => {
    const refuse = vi.fn(async () => {
      throw new Error('not on the finance team')
    })
    const refused = read(admin, { requireAdmin: refuse })
    await expect(refused.result).resolves.toBeNull()
    expect(refuse).toHaveBeenCalledWith(refused.ctx)
    expect(refused.ctx.runQuery).not.toHaveBeenCalled()

    // The gate decides, not the default claim: it may admit a member.
    await expect(read(member, { requireAdmin: async () => {} }).result).resolves.toBe(log)
  })

  it('never asks a custom gate about a signed-out caller', async () => {
    const admitAll = vi.fn(async () => {})

    await expect(read(null, { requireAdmin: admitAll }).result).resolves.toBeNull()
    expect(admitAll).not.toHaveBeenCalled()
  })
})
