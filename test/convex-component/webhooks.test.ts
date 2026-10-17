/// <reference types="vite/client" />

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { convexTest } from 'convex-test'
import type { FunctionArgs } from 'convex/server'
import { Webhook } from 'svix'
import component from '../../src/convex/test'
import schema from '../../src/convex/components/backend/schema'
import { record as recordFunction } from '../../src/convex/components/backend/webhooks'
import { api, internal } from '../../src/convex/components/backend/_generated/api'

let t: ReturnType<typeof convexTest>

beforeEach(() => {
  t = convexTest(schema, component.modules)
})

afterEach(() => {
  delete process.env.EMAIL_WEBHOOK_SECRET
})

describe('webhook delivery log (component)', () => {
  // The documented numbers: a ring of 200 verified deliveries, trimmed at
  // most once an hour, leaving the last minute's deliveries to the next trim.
  const HOUR = 60 * 60 * 1000
  const DAY = 24 * HOUR

  type RecordArgs = FunctionArgs<typeof api.webhooks.record>

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-10-01T00:00:00Z') })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /** Record one outcome, a millisecond after the last, so the order is the clock's. */
  async function record(args: RecordArgs): Promise<void> {
    await t.mutation(api.webhooks.record, args)
    vi.advanceTimersByTime(1)
  }

  const rowCount = () => t.run(async ctx => (await ctx.db.query('webhookDeliveries').collect()).length)

  const pendingTrims = () => t.run(async ctx => (await ctx.db.system.query('_scheduled_functions').collect())
    .filter(job => job.name === 'webhooks:trim' && job.state.kind === 'pending').length)

  /** Insert ring rows directly, at fixed times — what a burst leaves before its trim. */
  const seedRing = (count: number, at: (index: number) => number) => t.run(async (ctx) => {
    for (let index = 0; index < count; index++) {
      await ctx.db.insert('webhookDeliveries', { service: 'billing', deliveryId: `r_${index}`, outcome: 'ok', receivedAt: at(index) })
    }
  })

  /** Run `record` on a ctx whose database reports every table it reads. */
  async function tablesReadBy(args: RecordArgs): Promise<string[]> {
    const read: string[] = []
    await t.run(async (ctx) => {
      const db = new Proxy(ctx.db, {
        get(target, key) {
          const value = Reflect.get(target, key) as unknown
          if (typeof value !== 'function') return value
          const method = value.bind(target) as (...args: unknown[]) => unknown
          if (key === 'query' || key === 'get') {
            return (...args: unknown[]) => {
              read.push(key === 'get' ? `get:${String(args[0])}` : String(args[0]))
              return method(...args)
            }
          }
          return method
        },
      })
      const run = (recordFunction as unknown as { _handler: (ctx: unknown, args: RecordArgs) => Promise<null> })._handler
      await run({ ...ctx, db }, args)
    })
    return read
  }

  test('record + find: only a fully-successful delivery dedupes', async () => {
    await record({ service: 'billing', deliveryId: 'wh_1', type: 'order.paid', outcome: 'handler_error' })
    expect(await t.query(api.webhooks.find, { service: 'billing', deliveryId: 'wh_1' })).toMatchObject({ outcome: 'handler_error' })

    await record({ service: 'billing', deliveryId: 'wh_1', type: 'order.paid', outcome: 'ok' })
    expect(await t.query(api.webhooks.find, { service: 'billing', deliveryId: 'wh_1' })).toMatchObject({ outcome: 'ok' })
    // An `ok` row wins over anything recorded for the id after it.
    await record({ service: 'billing', deliveryId: 'wh_1', type: 'order.paid', outcome: 'handler_error' })
    await record({ service: 'billing', deliveryId: 'wh_1', outcome: 'duplicate' })
    expect(await t.query(api.webhooks.find, { service: 'billing', deliveryId: 'wh_1' })).toMatchObject({ outcome: 'ok' })
    // A different service's id space is independent.
    expect(await t.query(api.webhooks.find, { service: 'email', deliveryId: 'wh_1' })).toBeNull()
  })

  test('a verified delivery is an insert and one read of the trim schedule: concurrent deliveries never read the ring', async () => {
    for (let i = 0; i < 20; i++) await record({ service: 'billing', deliveryId: `d_${i}`, outcome: 'ok' })

    expect(await tablesReadBy({ service: 'billing', deliveryId: 'd_new', type: 'order.paid', outcome: 'ok' })).toEqual(['webhookTrims'])
    expect(await tablesReadBy({ service: 'email', deliveryId: 'd_bad', type: 'email.bounced', outcome: 'handler_error', note: 'boom' })).toEqual(['webhookTrims'])
    // A refused request touches only its own tally.
    expect(await tablesReadBy({ service: 'billing', deliveryId: 'junk', outcome: 'invalid_signature' })).toEqual(['webhookTallies'])
    expect(await rowCount()).toBe(22)
  })

  test('the ring is trimmed off the hot path, once for a whole burst, back to its newest 200', async () => {
    for (let i = 0; i < 210; i++) await record({ service: 'email', deliveryId: `d_${i}`, outcome: 'ok' })

    // Recording never trims; the first delivery scheduled the one trim.
    expect(await rowCount()).toBe(210)
    expect(await pendingTrims()).toBe(1)

    await t.finishAllScheduledFunctions(vi.runAllTimers)

    expect(await rowCount()).toBe(200)
    const recent = await t.query(api.webhooks.listRecent, { limit: 500 })
    expect(recent).toHaveLength(200)
    expect(recent[0]?.deliveryId).toBe('d_209')
    expect(recent.at(-1)?.deliveryId).toBe('d_10')
    // The oldest rows fell off the ring.
    expect(await t.query(api.webhooks.find, { service: 'email', deliveryId: 'd_9' })).toBeNull()
  })

  test('a delivery after the trim schedules the next one; deliveries before it schedule nothing', async () => {
    await record({ service: 'billing', deliveryId: 'd_1', outcome: 'ok' })
    vi.advanceTimersByTime(HOUR / 2)
    await record({ service: 'billing', deliveryId: 'd_2', outcome: 'ok' })
    expect(await pendingTrims()).toBe(1)

    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await pendingTrims()).toBe(0)

    await record({ service: 'billing', deliveryId: 'd_3', outcome: 'ok' })
    expect(await pendingTrims()).toBe(1)
  })

  test('the trim leaves the last minute\'s deliveries for the next one: it never reads where deliveries land', async () => {
    for (let i = 0; i < 210; i++) await record({ service: 'billing', deliveryId: `old_${i}`, outcome: 'ok' })
    // Half a minute before the trim is due.
    vi.advanceTimersByTime(HOUR - 30_000 - 210)
    for (let i = 0; i < 5; i++) await record({ service: 'billing', deliveryId: `new_${i}`, outcome: 'ok' })

    await t.finishAllScheduledFunctions(vi.runAllTimers)

    // 200 settled rows, and every young one past the cap.
    expect(await rowCount()).toBe(205)
    const ids = await t.run(async ctx => (await ctx.db.query('webhookDeliveries').collect()).map(row => row.deliveryId))
    expect(ids.filter(id => id.startsWith('new_'))).toHaveLength(5)
    expect(ids).not.toContain('old_9')
    expect(ids).toContain('old_10')
  })

  test('a burst more than a batch over the cap is trimmed across transactions', async () => {
    await seedRing(1300, index => Date.now() - DAY + index)

    await t.mutation(internal.webhooks.trim, {})
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    expect(await rowCount()).toBe(200)
    expect(await t.query(api.webhooks.find, { service: 'billing', deliveryId: 'r_1099' })).toBeNull()
    expect(await t.query(api.webhooks.find, { service: 'billing', deliveryId: 'r_1100' })).toMatchObject({ outcome: 'ok' })
  })

  test('rows sharing the boundary\'s time are cut in creation order', async () => {
    const at = Date.now() - DAY
    await seedRing(202, () => at)

    await t.mutation(internal.webhooks.trim, {})

    expect(await rowCount()).toBe(200)
    expect(await t.query(api.webhooks.find, { service: 'billing', deliveryId: 'r_1' })).toBeNull()
    expect(await t.query(api.webhooks.find, { service: 'billing', deliveryId: 'r_2' })).toMatchObject({ outcome: 'ok' })
    // At the cap, a trim deletes nothing.
    await t.mutation(internal.webhooks.trim, {})
    expect(await rowCount()).toBe(200)
  })

  test('caller-supplied strings are truncated, and find matches a long id the way it was stored', async () => {
    const longId = `msg_${'x'.repeat(5000)}`
    await record({ service: 'billing', deliveryId: longId, type: `t.${'y'.repeat(1000)}`, outcome: 'ok', note: 'n'.repeat(2000) })
    await record({ service: 'billing', deliveryId: longId, outcome: 'invalid_signature', note: 'n'.repeat(2000) })

    const [tally, row] = await t.query(api.webhooks.listRecent, {})
    expect(row).toMatchObject({ deliveryId: longId.slice(0, 128), type: `t.${'y'.repeat(126)}`, note: 'n'.repeat(500) })
    expect(tally).toMatchObject({ outcome: 'invalid_signature', deliveryId: longId.slice(0, 128), note: 'n'.repeat(500) })
    expect(await t.query(api.webhooks.find, { service: 'billing', deliveryId: longId })).toMatchObject({ outcome: 'ok' })
  })

  test('truncation never splits a surrogate pair', async () => {
    await record({ service: 'billing', deliveryId: 'wh_emoji', type: `${'a'.repeat(127)}😀`, outcome: 'ok' })

    const [row] = await t.query(api.webhooks.listRecent, {})
    expect(row?.type).toBe('a'.repeat(127))
  })

  test('a flood of requests answered before verification is tallied: the log keeps only verified rows, and dedupe holds', async () => {
    await record({ service: 'billing', deliveryId: 'wh_paid', type: 'order.paid', outcome: 'ok' })
    for (let i = 0; i < 300; i++) await record({ service: 'billing', deliveryId: `junk_${i}`, outcome: 'invalid_signature' })
    await record({ service: 'email', deliveryId: 'none:1', outcome: 'missing_secret' })
    await record({ service: 'email', deliveryId: 'msg_big', outcome: 'oversized' })
    // The provider redelivers the processed id: answered 200, tallied too.
    await record({ service: 'billing', deliveryId: 'wh_paid', outcome: 'duplicate' })

    expect(await rowCount()).toBe(1)
    expect(await t.query(api.webhooks.find, { service: 'billing', deliveryId: 'wh_paid' })).toMatchObject({ outcome: 'ok' })
    expect((await t.query(api.webhooks.listRecent, {})).map(row => [row.service, row.outcome, row.deliveryId, row.count])).toEqual([
      ['billing', 'duplicate', 'wh_paid', 1],
      ['email', 'oversized', 'msg_big', 1],
      ['email', 'missing_secret', 'none:1', 1],
      ['billing', 'invalid_signature', 'junk_299', 300],
      ['billing', 'ok', 'wh_paid', undefined],
    ])

    // Even past a trim, the flood has pushed nothing out.
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await t.query(api.webhooks.find, { service: 'billing', deliveryId: 'wh_paid' })).toMatchObject({ outcome: 'ok' })
  })

  test('a tally counts afresh after a day without one', async () => {
    for (let i = 0; i < 3; i++) await record({ service: 'billing', deliveryId: `bad_${i}`, outcome: 'invalid_signature', note: 'stale' })
    vi.advanceTimersByTime(DAY + 1)
    await record({ service: 'billing', deliveryId: 'bad_3', outcome: 'invalid_signature' })

    const [tally] = await t.query(api.webhooks.listRecent, {})
    expect(tally).toMatchObject({ deliveryId: 'bad_3', count: 1, receivedAt: Date.now() - 1 })
    // The latest request's details replace the last one's.
    expect(tally).not.toHaveProperty('note')
  })

  test('listRecent: newest first across rows and tallies, a tally first on a tie, and a sane size', async () => {
    // A duplicate answered in the same millisecond as the delivery it repeats.
    await t.mutation(api.webhooks.record, { service: 'email', deliveryId: 'msg_1', type: 'email.delivered', outcome: 'ok' })
    await t.mutation(api.webhooks.record, { service: 'email', deliveryId: 'msg_1', outcome: 'duplicate' })
    expect((await t.query(api.webhooks.listRecent, {})).map(row => row.outcome)).toEqual(['duplicate', 'ok'])

    for (let i = 0; i < 260; i++) await record({ service: 'billing', deliveryId: `d_${i}`, outcome: 'ok' })
    expect(await t.query(api.webhooks.listRecent, {})).toHaveLength(50)
    expect(await t.query(api.webhooks.listRecent, { limit: 1000 })).toHaveLength(200)
    expect(await t.query(api.webhooks.listRecent, { limit: 2.7 })).toHaveLength(2)
    expect(await t.query(api.webhooks.listRecent, { limit: -5 })).toEqual([])
    expect(await t.query(api.webhooks.listRecent, { limit: Number.NaN })).toHaveLength(50)
  })
})

describe('gift notification stamp (component)', () => {
  test('markNotified wins exactly once per gift', async () => {
    const giftId = await t.mutation(api.gifts.create, {
      recipientEmail: 'r@example.com',
      purchaserUserId: 'u1',
      productIds: ['p1'],
    })
    expect(await t.mutation(api.gifts.markNotified, { giftId })).toBe(true)
    expect(await t.mutation(api.gifts.markNotified, { giftId })).toBe(false)
    expect(await t.mutation(api.gifts.markNotified, { giftId: 'missing' })).toBe(false)
  })
})

describe('email webhook verification (component, real svix crypto)', () => {
  // A non-status-tracked type: exercises verification without the nested
  // provider component (which convex-test does not model).
  const payload = JSON.stringify({ type: 'contact.created', data: { id: 'c_1' } })

  function sign(secret: string, body: string, at = new Date()): Record<string, string> {
    const id = 'msg_test_1'
    const signature = new Webhook(secret).sign(id, at, body)
    return {
      'svix-id': id,
      'svix-timestamp': String(Math.floor(at.getTime() / 1000)),
      'svix-signature': signature,
    }
  }

  test('fails closed with 503 while the secret is unset', async () => {
    const result = await t.action(api.email.handleWebhook, { body: payload, headers: {} })
    expect(result.status).toBe(503)
  })

  test('verifies a correctly signed delivery (202 with the parsed type)', async () => {
    process.env.EMAIL_WEBHOOK_SECRET = 'whsec_' + Buffer.from('a'.repeat(24)).toString('base64')
    const headers = sign(process.env.EMAIL_WEBHOOK_SECRET, payload)
    const result = await t.action(api.email.handleWebhook, { body: payload, headers })
    expect(result).toMatchObject({ status: 202, type: 'contact.created' })
  })

  test('rejects a tampered body with 403', async () => {
    process.env.EMAIL_WEBHOOK_SECRET = 'whsec_' + Buffer.from('a'.repeat(24)).toString('base64')
    const headers = sign(process.env.EMAIL_WEBHOOK_SECRET, payload)
    const result = await t.action(api.email.handleWebhook, { body: payload.replace('c_1', 'evil'), headers })
    expect(result.status).toBe(403)
  })

  test('rejects a stale timestamp (replay outside the ±5 minute tolerance)', async () => {
    process.env.EMAIL_WEBHOOK_SECRET = 'whsec_' + Buffer.from('a'.repeat(24)).toString('base64')
    const headers = sign(process.env.EMAIL_WEBHOOK_SECRET, payload, new Date(Date.now() - 10 * 60 * 1000))
    const result = await t.action(api.email.handleWebhook, { body: payload, headers })
    expect(result.status).toBe(403)
  })

  test('accepts a delivery signed with the second secret of a rotation list', async () => {
    const oldSecret = 'whsec_' + Buffer.from('o'.repeat(24)).toString('base64')
    const newSecret = 'whsec_' + Buffer.from('n'.repeat(24)).toString('base64')
    process.env.EMAIL_WEBHOOK_SECRET = `${newSecret},${oldSecret}`
    const headers = sign(oldSecret, payload)
    const result = await t.action(api.email.handleWebhook, { body: payload, headers })
    expect(result.status).toBe(202)
  })
})
