import { describe, expect, it, vi } from 'vitest'
import { type BillingComponents, setupBilling, type SetupBillingConfig } from '../../src/convex/integrations/billing'

// `getBillingConsole` serves every billing entity's save offers, withdrawals
// and renewal consent proofs, so it sits behind `refundOrder`'s admin gate,
// which reads the account's role fresh from the user table, never from the
// token. Anyone else reads `null`, never an error: the admin console
// subscribes to it reactively, and a throwing query would be retried on
// every reconnect.

const lifecycleConsole = 'ref:subscriptions.lifecycleConsole'

const components = {
  polar: { lib: { insertCustomer: 'ref:insertCustomer' } },
  backend: {
    // The auth tables' adapter: the fresh member and role reads.
    adapter: { findOne: 'ref:findOne' },
    billing: {},
    gifts: {},
    subscriptions: { lifecycleConsole },
    webhooks: { record: 'ref:webhooks.record', find: 'ref:webhooks.find', listRecent: 'ref:webhooks.listRecent' },
  },
} as unknown as BillingComponents

const empty = { saveOffers: [], withdrawals: [], consents: [] }

const member = { subject: 'u1', email: 'member@example.com' }
const admin = { ...member, role: 'admin' }

/** The account as the user table holds it now: by default, as its token says. */
type Stored = { role?: string, banned?: boolean } | null

function read(claims: Record<string, unknown> | null, config: Partial<SetupBillingConfig> = {}, args: { entityId?: string } = {}, stored: Stored = claims as Stored) {
  const billing = setupBilling(components, { email: { sendTemplate: async () => null }, ...config } as SetupBillingConfig)
  const ctx = {
    auth: { getUserIdentity: vi.fn(async () => claims) },
    runQuery: vi.fn(async (ref: unknown, _args?: unknown) => ref === lifecycleConsole ? empty : ref === 'ref:findOne' ? stored : null),
  }
  const handler = (billing.api.getBillingConsole as unknown as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler
  return { ctx, result: handler(ctx, args) }
}

describe('getBillingConsole — admin-only', () => {
  it('answers a signed-out caller null, without reading the records', async () => {
    const { ctx, result } = read(null)

    await expect(result).resolves.toBeNull()
    expect(ctx.runQuery).not.toHaveBeenCalled()
  })

  it.each([
    ['no role', member, {}],
    ['the plain user role', { ...member, role: 'user' }, { role: 'user' }],
    ['a role that only contains the word', { ...member, role: 'administrator' }, { role: 'administrator' }],
    // A token minted before the demotion or the ban still says admin until it expires.
    ['the admin role in a token, on an account demoted since', admin, { role: 'user' }],
    ['the admin role on a banned account', admin, { role: 'admin', banned: true }],
    ['the admin role in a token, on an account deleted since', admin, null],
  ])('answers a signed-in member with %s null', async (_, claims, stored) => {
    const { ctx, result } = read(claims, {}, {}, stored)

    await expect(result).resolves.toBeNull()
    expect(ctx.runQuery).toHaveBeenCalledWith('ref:findOne', { model: 'user', where: [{ field: '_id', value: 'u1' }] })
    expect(ctx.runQuery).not.toHaveBeenCalledWith(lifecycleConsole, expect.anything())
  })

  it('serves an admin one billing entity\'s records', async () => {
    const { ctx, result } = read(admin, {}, { entityId: 'org_1' })

    await expect(result).resolves.toEqual(empty)
    expect(ctx.runQuery).toHaveBeenCalledWith(lifecycleConsole, { entityId: 'org_1' })
  })

  it('reads a comma-separated role, as the admin plugin stores it', async () => {
    await expect(read(member, {}, {}, { role: 'user, admin' }).result).resolves.toEqual(empty)
  })

  it('serves an admin promoted since their token was minted', async () => {
    await expect(read(member, {}, {}, { role: 'admin' }).result).resolves.toEqual(empty)
  })

  it('serves an admin\'s impersonated session', async () => {
    await expect(read({ ...admin, impersonatedBy: 'admin-2' }).result).resolves.toEqual(empty)
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
    await expect(read(member, { requireAdmin: async () => {} }).result).resolves.toEqual(empty)
  })

  it('never asks a custom gate about a signed-out caller', async () => {
    const admitAll = vi.fn(async () => {})

    await expect(read(null, { requireAdmin: admitAll }).result).resolves.toBeNull()
    expect(admitAll).not.toHaveBeenCalled()
  })
})
