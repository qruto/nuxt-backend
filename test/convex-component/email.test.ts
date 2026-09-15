/// <reference types="vite/client" />

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { convexTest } from 'convex-test'
import resendComponent from '@convex-dev/resend/test'
import { Webhook } from 'svix'
import component from '../../src/convex/test'
import schema from '../../src/convex/components/backend/schema'
import { api, components } from '../../src/convex/components/backend/_generated/api'
import { setupEmail, type EmailComponents, type EmailWebhookEvent } from '../../src/convex/integrations/email'
import { WEBHOOK_BODY_LIMIT } from '../../src/convex/integrations/webhook-guard'

// The backend component runs as the root app (see billing.test.ts) with the
// nested Resend child registered at its real mount path (`resend`), so
// `send` → `status` → `cancel` and the status-tracked webhook path run against
// the provider component's own tables through real function calls.
//
// The provider's grandchildren (its send/callback workpools and API rate
// limiter) are NOT registered: they only run from the batch job `send`
// schedules, and `setTimeout` is faked here so that job never fires — emails
// stay `waiting`, which is exactly the state `cancel` needs. The provider id
// the batch sender would stamp after a successful API call is set directly
// via the child's own `updateManualEmail` mutation instead.
let t: ReturnType<typeof convexTest>

const SECRET = `whsec_${btoa('e'.repeat(24))}`
const OTHER_SECRET = `whsec_${btoa('o'.repeat(24))}`
const TEST_RECIPIENT = 'delivered@resend.dev'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout'] })
  t = convexTest(schema, component.modules.backend)
  resendComponent.register(t, 'resend')
  process.env.EMAIL_API_KEY = 're_test_key'
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  delete process.env.EMAIL_API_KEY
  delete process.env.EMAIL_FROM
  delete process.env.EMAIL_WEBHOOK_SECRET
})

/** Sign a delivery the way the provider does (svix headers, ±5 min tolerance). */
function sign(secret: string, body: string, options: { id?: string, at?: Date } = {}): Record<string, string> {
  const id = options.id ?? 'msg_1'
  const at = options.at ?? new Date()
  return {
    'svix-id': id,
    'svix-timestamp': String(Math.floor(at.getTime() / 1000)),
    'svix-signature': new Webhook(secret).sign(id, at, body),
  }
}

/** A provider `email.*` event in the shape the nested component's validator accepts. */
function providerEvent(type: string, resendId: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    type,
    created_at: '2026-09-08T10:00:00.000Z',
    data: {
      email_id: resendId,
      created_at: '2026-09-08T10:00:00.000Z',
      from: 'onboarding@resend.dev',
      to: [TEST_RECIPIENT],
      subject: 'Hello',
      ...extra,
    },
  })
}

async function sendOne(): Promise<string> {
  const emailId = await t.mutation(api.email.send, { to: TEST_RECIPIENT, subject: 'Hello', text: 'hi' })
  expect(emailId).toEqual(expect.any(String))
  return emailId as string
}

/** What the batch sender does after the provider accepted the email. */
async function markSent(emailId: string, resendId: string) {
  await t.mutation(components.resend.lib.updateManualEmail, { emailId, status: 'sent', resendId })
}

describe('retention cleanup (scheduled into the nested provider component)', () => {
  // The provider ages records by wall clock, so the clock is faked too and
  // advanced past the retention window between the writes and the cleanup.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
  })

  test('cleanup prunes finalized emails older than olderThanMs and keeps the rest', async () => {
    const finalized = await sendOne()
    await t.mutation(api.email.cancel, { emailId: finalized })
    const waiting = await sendOne()
    vi.setSystemTime(Date.now() + 60_000)

    expect(await t.mutation(api.email.cleanup, { olderThanMs: 30_000 })).toBeNull()
    await t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(0))

    expect(await t.query(api.email.get, { emailId: finalized })).toBeNull()
    expect(await t.query(api.email.get, { emailId: waiting })).toMatchObject({ status: 'waiting' })
  })

  test('cleanup leaves finalized emails inside the window alone', async () => {
    const finalized = await sendOne()
    await t.mutation(api.email.cancel, { emailId: finalized })
    vi.setSystemTime(Date.now() + 60_000)

    await t.mutation(api.email.cleanup, { olderThanMs: 120_000 })
    await t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(0))

    expect(await t.query(api.email.get, { emailId: finalized })).toMatchObject({ status: 'cancelled' })
  })

  test('cleanupAbandoned prunes never-finalized emails older than olderThanMs', async () => {
    const abandoned = await sendOne()
    vi.setSystemTime(Date.now() + 60_000)
    const fresh = await sendOne()

    expect(await t.mutation(api.email.cleanupAbandoned, { olderThanMs: 30_000 })).toBeNull()
    await t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(0))

    expect(await t.query(api.email.get, { emailId: abandoned })).toBeNull()
    expect(await t.query(api.email.get, { emailId: fresh })).toMatchObject({ status: 'waiting' })
  })
})

describe('transactional send → status → cancel (nested provider component)', () => {
  test('send stores the email with the provider component and reports it as waiting', async () => {
    const emailId = await sendOne()

    expect(await t.query(api.email.status, { emailId })).toStrictEqual({
      status: 'waiting',
      errorMessage: null,
      bounced: false,
      complained: false,
      failed: false,
      deliveryDelayed: false,
      opened: false,
      clicked: false,
    })
    expect(await t.query(api.email.get, { emailId })).toMatchObject({
      from: 'onboarding@resend.dev',
      to: [TEST_RECIPIENT],
      subject: 'Hello',
      text: 'hi',
      status: 'waiting',
    })
  })

  test('from defaults to EMAIL_FROM; an explicit from wins', async () => {
    process.env.EMAIL_FROM = 'Team <team@example.com>'
    const defaulted = await sendOne()
    const explicit = await t.mutation(api.email.send, {
      to: TEST_RECIPIENT, subject: 'Hello', text: 'hi', from: 'Ada <ada@example.com>',
    })

    expect(await t.query(api.email.get, { emailId: defaulted })).toMatchObject({ from: 'Team <team@example.com>' })
    expect(await t.query(api.email.get, { emailId: explicit! })).toMatchObject({ from: 'Ada <ada@example.com>' })
  })

  test('template sends carry the template instead of a body', async () => {
    const emailId = await t.mutation(api.email.send, {
      to: TEST_RECIPIENT, template: { id: 'tmpl_welcome', variables: { name: 'Ada' } },
    })

    const record = await t.query(api.email.get, { emailId: emailId! })
    expect(record).toMatchObject({ template: { id: 'tmpl_welcome', variables: { name: 'Ada' } } })
    expect(record?.html).toBeUndefined()
    expect(record?.text).toBeUndefined()
  })

  test('cancel marks a not-yet-sent email cancelled', async () => {
    const emailId = await sendOne()

    expect(await t.mutation(api.email.cancel, { emailId })).toBeNull()
    expect(await t.query(api.email.status, { emailId })).toMatchObject({ status: 'cancelled' })
  })

  test('cancel refuses once the provider already has the email', async () => {
    const emailId = await sendOne()
    await markSent(emailId, 're_sent')

    await expect(t.mutation(api.email.cancel, { emailId })).rejects.toThrow(/already been sent/)
    expect(await t.query(api.email.status, { emailId })).toMatchObject({ status: 'sent' })
  })

  test('send is a designed no-op while EMAIL_API_KEY is missing (warns, returns null)', async () => {
    delete process.env.EMAIL_API_KEY
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(await t.mutation(api.email.send, { to: TEST_RECIPIENT, subject: 'Hello', text: 'hi' })).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('EMAIL_API_KEY'))
  })

  test('test mode is on by default: only provider test addresses are accepted', async () => {
    await expect(t.mutation(api.email.send, { to: 'someone@example.com', subject: 'Hello', text: 'hi' }))
      .rejects.toThrow(/Test mode/)
  })
})

describe('handleWebhook (component, real svix crypto, nested status tracking)', () => {
  test('fails closed with 503 while EMAIL_WEBHOOK_SECRET is unset — even for a well-signed delivery', async () => {
    const body = providerEvent('email.delivered', 're_1')

    expect(await t.action(api.email.handleWebhook, { body, headers: sign(SECRET, body) }))
      .toStrictEqual({ status: 503, body: 'Webhook secret not configured' })
  })

  test('rejects a foreign or tampered signature with 403 and leaves delivery state untouched', async () => {
    process.env.EMAIL_WEBHOOK_SECRET = SECRET
    const emailId = await sendOne()
    await markSent(emailId, 're_1')
    const body = providerEvent('email.delivered', 're_1')

    // Signed with a secret the deployment does not accept.
    expect(await t.action(api.email.handleWebhook, { body, headers: sign(OTHER_SECRET, body) }))
      .toStrictEqual({ status: 403, body: 'Invalid signature' })
    // Body edited in flight under a genuine signature.
    expect(await t.action(api.email.handleWebhook, { body: body.replace('re_1', 're_2'), headers: sign(SECRET, body) }))
      .toStrictEqual({ status: 403, body: 'Invalid signature' })
    expect(await t.query(api.email.status, { emailId })).toMatchObject({ status: 'sent' })
  })

  test('a verified email.delivered event updates the stored delivery status', async () => {
    process.env.EMAIL_WEBHOOK_SECRET = SECRET
    const emailId = await sendOne()
    await markSent(emailId, 're_1')
    const body = providerEvent('email.delivered', 're_1')

    expect(await t.action(api.email.handleWebhook, { body, headers: sign(SECRET, body) }))
      .toStrictEqual({ status: 202, body: '', type: 'email.delivered' })
    expect(await t.query(api.email.status, { emailId })).toMatchObject({ status: 'delivered' })
  })

  test('a verified email.bounced event records the bounce and the provider message', async () => {
    process.env.EMAIL_WEBHOOK_SECRET = SECRET
    const emailId = await sendOne()
    await markSent(emailId, 're_1')
    const body = providerEvent('email.bounced', 're_1', {
      bounce: { message: 'Mailbox full', subType: 'General', type: 'Permanent' },
    })

    expect(await t.action(api.email.handleWebhook, { body, headers: sign(SECRET, body) }))
      .toMatchObject({ status: 202, type: 'email.bounced' })
    expect(await t.query(api.email.status, { emailId })).toMatchObject({
      status: 'bounced', bounced: true, errorMessage: 'Mailbox full',
    })
  })

  test('a verified event for a provider id this deployment never sent is acknowledged without side effects', async () => {
    process.env.EMAIL_WEBHOOK_SECRET = SECRET
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const body = providerEvent('email.delivered', 're_unknown')

    expect(await t.action(api.email.handleWebhook, { body, headers: sign(SECRET, body) }))
      .toMatchObject({ status: 202, type: 'email.delivered' })
    expect(info).toHaveBeenCalledWith(expect.stringContaining('re_unknown'))
  })

  test('verified email.* types outside the status-tracked set are acknowledged but not forwarded', async () => {
    process.env.EMAIL_WEBHOOK_SECRET = SECRET
    const emailId = await sendOne()
    await markSent(emailId, 're_1')
    const body = providerEvent('email.scheduled', 're_1')

    expect(await t.action(api.email.handleWebhook, { body, headers: sign(SECRET, body) }))
      .toStrictEqual({ status: 202, body: '', type: 'email.scheduled' })
    expect(await t.query(api.email.status, { emailId })).toMatchObject({ status: 'sent' })
  })
})

describe('/email/events route: guard → component → delivery log (end to end)', () => {
  // In these tests the backend component IS the root app, so its public `api`
  // refs stand in for the app-side `components.backend.*` handles. The route
  // runs inside a convex-test action so its `run*` calls are real.
  function route(options: Parameters<typeof setupEmail>[1] = {}) {
    const email = setupEmail(
      { backend: { email: api.email, webhooks: api.webhooks } } as unknown as EmailComponents,
      options,
    )
    // Inline action results must be Convex values, so the Response is
    // flattened to what the assertions read.
    return (body: string, headers: Record<string, string> = {}) =>
      t.action(async (ctx) => {
        const response = await email.webhookHandler(
          ctx,
          new Request('https://site.test/email/events', { method: 'POST', body, headers }),
        )
        return { status: response.status, text: await response.text() }
      })
  }

  const outcomes = async () =>
    (await t.query(api.webhooks.listRecent, {})).map(row => [row.outcome, row.type] as const)

  test('missing secret → 503, logged as missing_secret, the component never runs', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const body = providerEvent('email.delivered', 're_1')

    const response = await route()(body, sign(SECRET, body))

    expect(response.status).toBe(503)
    expect(await outcomes()).toStrictEqual([['missing_secret', undefined]])
  })

  test('oversized body → 413 before any verification, logged as oversized', async () => {
    process.env.EMAIL_WEBHOOK_SECRET = SECRET
    const body = 'x'.repeat(WEBHOOK_BODY_LIMIT + 1)

    const response = await route()(body, { 'svix-id': 'msg_big' })

    expect(response.status).toBe(413)
    expect(await outcomes()).toStrictEqual([['oversized', undefined]])
  })

  test('tampered signature → 403, logged as invalid_signature', async () => {
    process.env.EMAIL_WEBHOOK_SECRET = SECRET
    const body = providerEvent('email.delivered', 're_1')

    const response = await route()(body.replace('re_1', 're_2'), sign(SECRET, body))

    expect(response.status).toBe(403)
    expect(await outcomes()).toStrictEqual([['invalid_signature', undefined]])
  })

  test('verified delivery → status updated, typed handler dispatched, logged ok; redelivery → 200 duplicate', async () => {
    process.env.EMAIL_WEBHOOK_SECRET = SECRET
    const emailId = await sendOne()
    await markSent(emailId, 're_1')
    const delivered = vi.fn(async (_ctx: unknown, _event: EmailWebhookEvent<'email.delivered'>) => {})
    const post = route({ events: { 'email.delivered': delivered } })
    const body = providerEvent('email.delivered', 're_1')
    const headers = sign(SECRET, body, { id: 'msg_once' })

    const first = await post(body, headers)
    expect(first.status).toBe(202)
    expect(await t.query(api.email.status, { emailId })).toMatchObject({ status: 'delivered' })
    expect(delivered).toHaveBeenCalledTimes(1)
    expect(delivered.mock.calls[0]![1]).toMatchObject({ type: 'email.delivered', data: { email_id: 're_1' } })

    // The provider redelivers the same `svix-id`: answered without re-running anything.
    const second = await post(body, headers)
    expect(second.status).toBe(200)
    expect(second.text).toBe('Already processed')
    expect(delivered).toHaveBeenCalledTimes(1)
    expect(await outcomes()).toStrictEqual([['duplicate', undefined], ['ok', 'email.delivered']])
  })

  test('authentic but unknown type → 202, onUnknownEvent hook, logged as unknown_type', async () => {
    process.env.EMAIL_WEBHOOK_SECRET = SECRET
    const onUnknownEvent = vi.fn(async () => {})
    const body = JSON.stringify({ type: 'mystery.event', data: { id: 'x_1' } })

    const response = await route({ onUnknownEvent })(body, sign(SECRET, body))

    expect(response.status).toBe(202)
    expect(response.text).toBe('Accepted (unknown event type)')
    expect(onUnknownEvent).toHaveBeenCalledWith(expect.anything(), { type: 'mystery.event', payload: { type: 'mystery.event', data: { id: 'x_1' } } })
    expect(await outcomes()).toStrictEqual([['unknown_type', 'mystery.event']])
  })

  test('handler throw → propagates (the runtime answers 500), logged as handler_error, and the redelivery is NOT deduped', async () => {
    process.env.EMAIL_WEBHOOK_SECRET = SECRET
    const emailId = await sendOne()
    await markSent(emailId, 're_1')
    let attempts = 0
    const post = route({
      events: {
        'email.delivered': async () => {
          attempts += 1
          if (attempts === 1) throw new Error('boom')
        },
      },
    })
    const body = providerEvent('email.delivered', 're_1')
    const headers = sign(SECRET, body, { id: 'msg_retry' })

    await expect(post(body, headers)).rejects.toThrow('boom')
    expect(await outcomes()).toStrictEqual([['handler_error', 'email.delivered']])

    // Only a fully successful (`ok`) outcome short-circuits — the retry runs.
    const retry = await post(body, headers)
    expect(retry.status).toBe(202)
    expect(attempts).toBe(2)
    expect(await outcomes()).toStrictEqual([['ok', 'email.delivered'], ['handler_error', 'email.delivered']])
  })

  test('deliveryLog: false keeps the fail-closed statuses but writes no log rows', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const post = route({ deliveryLog: false })
    expect((await post('{}', { 'svix-id': 'msg_1' })).status).toBe(503)
    process.env.EMAIL_WEBHOOK_SECRET = SECRET
    expect((await post('x'.repeat(WEBHOOK_BODY_LIMIT + 1), { 'svix-id': 'msg_2' })).status).toBe(413)
    expect(await outcomes()).toStrictEqual([])
  })
})
