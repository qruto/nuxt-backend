/// <reference types="vite/client" />

import { beforeEach, describe, expect, test } from 'vitest'
import { convexTest } from 'convex-test'
import component from '../../src/convex/test'
import schema from '../../src/convex/component/schema'
import { api } from '../../src/convex/component/_generated/api'
import { setupAuthorization, type AuthorizationCtx } from '../../src/convex/integrations/authorization'

// Run the backend component as the root app (same pattern as billing.test.ts)
// so the adapter functions operate on the real schema — this validates the
// admin/organization schema additions end-to-end.
let t: ReturnType<typeof convexTest>

beforeEach(() => {
  t = convexTest(schema, component.modules)
})

const adapterApi = { adapter: { findOne: api.adapter.findOne, updateOne: api.adapter.updateOne } }

async function createRow(model: string, data: Record<string, unknown>) {
  return await t.mutation(api.adapter.create, { input: { model, data } }) as Record<string, unknown> & { _id: string, id?: string }
}

const now = () => Date.now()

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Ada',
    email: 'ada@example.com',
    emailVerified: true,
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  }
}

/** A ctx whose runQuery executes against the test backend, with fixed identity claims. */
function identityCtx(claims: Record<string, unknown>): AuthorizationCtx {
  return {
    auth: { getUserIdentity: async () => claims },
    runQuery: (reference: unknown, args: unknown) =>
      (t.query as unknown as (fn: unknown, args: unknown) => Promise<unknown>)(reference, args),
  } as unknown as AuthorizationCtx
}

describe('admin/organization schema through the adapter', () => {
  test('user role and ban fields round-trip', async () => {
    await createRow('user', userRow({ role: 'admin', banned: false }))

    const found = await t.query(api.adapter.findOne, {
      model: 'user',
      where: [{ field: 'email', value: 'ada@example.com' }],
    }) as { role?: string, banned?: boolean }

    expect(found).toMatchObject({ role: 'admin', banned: false })

    await t.mutation(api.adapter.updateOne, {
      input: {
        model: 'user',
        update: { banned: true, banReason: 'spam' },
        where: [{ field: 'email', value: 'ada@example.com' }],
      },
    })
    const banned = await t.query(api.adapter.findOne, {
      model: 'user',
      where: [{ field: 'email', value: 'ada@example.com' }],
    }) as { banned?: boolean, banReason?: string }
    expect(banned).toMatchObject({ banned: true, banReason: 'spam' })
  })

  test('organization, member, and invitation rows round-trip', async () => {
    const organization = await createRow('organization', {
      name: 'Acme', slug: 'acme', createdAt: now(),
    })
    const organizationId = (organization.id ?? organization._id) as string

    await createRow('member', {
      organizationId, userId: 'user-1', role: 'owner', createdAt: now(),
    })
    await createRow('invitation', {
      organizationId, email: 'new@example.com', role: 'member',
      status: 'pending', expiresAt: now() + 86_400_000, createdAt: now(), inviterId: 'user-1',
    })

    const bySlug = await t.query(api.adapter.findOne, {
      model: 'organization',
      where: [{ field: 'slug', value: 'acme' }],
    }) as { name?: string }
    expect(bySlug).toMatchObject({ name: 'Acme' })

    const member = await t.query(api.adapter.findOne, {
      model: 'member',
      where: [{ field: 'userId', value: 'user-1' }, { field: 'organizationId', value: organizationId }],
    }) as { role?: string }
    expect(member).toMatchObject({ role: 'owner' })

    const invitation = await t.query(api.adapter.findOne, {
      model: 'invitation',
      where: [{ field: 'email', value: 'new@example.com' }],
    }) as { status?: string }
    expect(invitation).toMatchObject({ status: 'pending' })
  })

  test('session activeOrganizationId round-trips', async () => {
    await createRow('session', {
      token: 'tok-1', userId: 'user-1', activeOrganizationId: 'org-1',
      expiresAt: now() + 60_000, createdAt: now(), updatedAt: now(),
    })
    const session = await t.query(api.adapter.findOne, {
      model: 'session',
      where: [{ field: 'token', value: 'tok-1' }],
    }) as { activeOrganizationId?: string }
    expect(session?.activeOrganizationId).toBe('org-1')
  })
})

describe('setupAuthorization against the real adapter', () => {
  test('requireMember resolves a real membership', async () => {
    const authorization = setupAuthorization(adapterApi as never)
    const user = await createRow('user', userRow())
    const userId = (user.id ?? user._id) as string
    const organization = await createRow('organization', { name: 'Acme', slug: 'acme', createdAt: now() })
    const organizationId = (organization.id ?? organization._id) as string
    await createRow('member', { organizationId, userId, role: 'admin', createdAt: now() })

    const member = await authorization.requireMember(
      identityCtx({ subject: userId, activeOrganizationId: organizationId }),
      { role: ['admin', 'owner'] },
    )
    expect(member).toMatchObject({ organizationId, role: 'admin' })
  })

  test('requireMember rejects a non-member of the active workspace', async () => {
    const authorization = setupAuthorization(adapterApi as never)
    const organization = await createRow('organization', { name: 'Acme', slug: 'acme', createdAt: now() })
    const organizationId = (organization.id ?? organization._id) as string

    await expect(authorization.requireMember(
      identityCtx({ subject: 'stranger', activeOrganizationId: organizationId }),
    )).rejects.toThrow(/not a member/)
  })

  test('requireRole fresh reads the stored role, not the stale claim', async () => {
    const authorization = setupAuthorization(adapterApi as never)
    const user = await createRow('user', userRow({ role: 'user' }))
    const userId = (user.id ?? user._id) as string

    // Claims still say admin (stale JWT); the database says demoted.
    await expect(authorization.requireRole(
      identityCtx({ subject: userId, role: 'admin' }),
      'admin',
      { fresh: true },
    )).rejects.toThrow(/role/)
  })
})
