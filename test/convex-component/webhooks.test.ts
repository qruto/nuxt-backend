/// <reference types="vite/client" />

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { convexTest } from 'convex-test'
import { Webhook } from 'svix'
import component from '../../src/convex/test'
import schema from '../../src/convex/components/backend/schema'
import { api } from '../../src/convex/components/backend/_generated/api'

let t: ReturnType<typeof convexTest>

beforeEach(() => {
  t = convexTest(schema, component.modules.backend)
})

afterEach(() => {
  delete process.env.EMAIL_WEBHOOK_SECRET
})

describe('webhook delivery ring buffer (component)', () => {
  test('record + find: only a fully-successful delivery dedupes', async () => {
    await t.mutation(api.webhooks.record, { service: 'billing', deliveryId: 'wh_1', type: 'order.paid', outcome: 'handler_error' })
    expect(await t.query(api.webhooks.find, { service: 'billing', deliveryId: 'wh_1' })).toMatchObject({ outcome: 'handler_error' })

    await t.mutation(api.webhooks.record, { service: 'billing', deliveryId: 'wh_1', type: 'order.paid', outcome: 'ok' })
    expect(await t.query(api.webhooks.find, { service: 'billing', deliveryId: 'wh_1' })).toMatchObject({ outcome: 'ok' })
    // A different service's id space is independent.
    expect(await t.query(api.webhooks.find, { service: 'email', deliveryId: 'wh_1' })).toBeNull()
  })

  test('listRecent serves newest first; the ring trims past its cap', async () => {
    for (let i = 0; i < 210; i++) {
      await t.mutation(api.webhooks.record, { service: 'email', deliveryId: `d_${i}`, outcome: 'ok' })
    }
    const recent = await t.query(api.webhooks.listRecent, { limit: 500 })
    expect(recent.length).toBeLessThanOrEqual(200)
    expect(recent[0]?.deliveryId).toBe('d_209')
    // The oldest rows fell off the ring.
    expect(await t.query(api.webhooks.find, { service: 'email', deliveryId: 'd_0' })).toBeNull()
  })
})

describe('gift notification stamp (component)', () => {
  test('markNotified wins exactly once per gift', async () => {
    const giftId = await t.mutation(api.gifts.create, {
      recipientEmail: 'r@example.com',
      purchaserUserId: 'u1',
      productIds: ['p1'],
      billingCustomerId: 'cus_1',
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
