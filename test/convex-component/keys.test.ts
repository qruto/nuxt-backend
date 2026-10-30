/// <reference types="vite/client" />

import { beforeEach, describe, expect, test } from 'vitest'
import { convexTest } from 'convex-test'
import component from '../../src/convex/test'
import schema from '../../src/convex/components/backend/schema'
import { internal } from '../../src/convex/components/backend/_generated/api'

// `keys:rotate` and `keys:retire`, the session signing keys' half of
// `nuxt-backend env rotate AUTH_SECRET`: rotating expires the keys that
// still sign and deletes nothing, retiring removes only the expired ones.

let t: ReturnType<typeof convexTest>

beforeEach(() => {
  t = convexTest(schema, component.modules)
})

const key = (createdAt: number, expiresAt?: number) => ({ publicKey: '{"kty":"OKP"}', privateKey: '"bare-hex"', createdAt, ...(expiresAt === undefined ? {} : { expiresAt }) })

describe('keys:rotate', () => {
  test('expires every key that still signs and keeps them all, so their public halves stay published', async () => {
    const before = Date.now()
    await t.run(async (ctx) => {
      await ctx.db.insert('jwks', key(before - 1000))
      await ctx.db.insert('jwks', key(before - 5000, before - 4000))
    })
    expect(await t.mutation(internal.keys.rotate, {})).toEqual({ expired: 1, kept: 1 })
    const rows = await t.run(ctx => ctx.db.query('jwks').collect())
    expect(rows).toHaveLength(2)
    for (const row of rows) expect(row.expiresAt).toBeLessThanOrEqual(Date.now())
  })
})

describe('keys:retire', () => {
  test('removes the expired keys and keeps the one signing now', async () => {
    const now = Date.now()
    await t.run(async (ctx) => {
      await ctx.db.insert('jwks', key(now - 5000, now - 4000))
      await ctx.db.insert('jwks', key(now - 10))
    })
    expect(await t.mutation(internal.keys.retire, {})).toEqual({ removed: 1, signing: 1 })
    const rows = await t.run(ctx => ctx.db.query('jwks').collect())
    expect(rows).toHaveLength(1)
    expect(rows[0]!.expiresAt).toBeUndefined()
  })
})
