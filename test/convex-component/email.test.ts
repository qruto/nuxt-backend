/// <reference types="vite/client" />

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { convexTest } from 'convex-test'
import resendComponent from '@convex-dev/resend/test'
import { Webhook } from 'standardwebhooks'
import component from '../../src/convex/test'
import schema from '../../src/convex/components/backend/schema'
import { api, components, internal } from '../../src/convex/components/backend/_generated/api'
import { getBackendError } from '../../src/convex/errors'
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
  t = convexTest(schema, component.modules)
  resendComponent.register(t, 'resend')
  process.env.EMAIL_API_KEY = 're_test_key'
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  delete process.env.EMAIL_API_KEY
  delete process.env.EMAIL_FROM
  delete process.env.EMAIL_WEBHOOK_SECRET
  delete process.env.BACKEND_ENVIRONMENT
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

describe('dev inbox', () => {
  const ADDRESS = 'delivered+demo-1@resend.dev'
  const NOW = Date.parse('2026-09-08T10:00:00.000Z')

  /** The provider's list of sent emails and its retrieval of each, as a stubbed `fetch`. */
  function providerLog(sent: Array<{ id: string, to: string[], subject: string, at: string, text?: string, html?: string }>, status = 200) {
    const requests: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      requests.push(url)
      if (status !== 200) return new Response('{}', { status })
      const one = /\/emails\/([^?/]+)$/.exec(url)
      if (one) {
        const email = sent.find(entry => entry.id === one[1])
        return Response.json({ id: email?.id, text: email?.text ?? null, html: email?.html ?? null })
      }
      return Response.json({ object: 'list', has_more: false, data: sent.map(email => ({ id: email.id, to: email.to, from: 'onboarding@resend.dev', subject: email.subject, created_at: email.at })) })
    }))
    return requests
  }

  // The component answers reads of an address from the one before for a few seconds: each test starts after the last one's answers went stale.
  let started = 0
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    vi.setSystemTime(NOW + started++ * 60_000)
    process.env.BACKEND_ENVIRONMENT = 'development'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('reads what the provider logged for a test address, newest first, with the newest body', async () => {
    providerLog([
      { id: 'e2', to: [ADDRESS], subject: 'Second', at: '2026-09-08 09:59:00.000000+00', html: '<p>code <b>222222</b></p>' },
      { id: 'e3', to: ['delivered+other@resend.dev'], subject: 'Someone else', at: '2026-09-08 09:58:30.000000+00', text: 'code 333333' },
      { id: 'e1', to: [ADDRESS], subject: 'First', at: '2026-09-08 09:58:00.000000+00', text: 'code 111111' },
    ])

    // Read back whatever the case or surrounding space of the address.
    const inbox = await t.action(api.email.inbox, { address: ' Delivered+Demo-1@RESEND.dev ' })

    expect(inbox.map(message => message.subject)).toEqual(['Second', 'First'])
    expect(inbox[0]).toMatchObject({ from: 'onboarding@resend.dev', html: '<p>code <b>222222</b></p>', receivedAt: Date.parse('2026-09-08T09:59:00.000Z') })
    // One body a read: the provider is asked for the newest message's only.
    expect(inbox[1]?.text).toBeUndefined()
  })

  test('asks the provider once for a list and once for the newest body, and answers reads within five seconds from the last', async () => {
    const requests = providerLog([{ id: 'e1', to: [ADDRESS], subject: 'First', at: '2026-09-08 09:58:00+00', text: 'code 111111' }])

    const first = await t.action(api.email.inbox, { address: ADDRESS })
    expect(first[0]).toMatchObject({ text: 'code 111111' })
    expect(requests.map(url => new URL(url).pathname + new URL(url).search)).toEqual(['/emails?limit=100', '/emails/e1'])

    vi.setSystemTime(Date.now() + 4000)
    await expect(t.action(api.email.inbox, { address: ADDRESS })).resolves.toEqual(first)
    expect(requests).toHaveLength(2)

    vi.setSystemTime(Date.now() + 1000)
    await t.action(api.email.inbox, { address: ADDRESS })
    expect(requests).toHaveLength(4)
  })

  test('leaves out mail older than the hour', async () => {
    providerLog([
      { id: 'new', to: [ADDRESS], subject: 'Now', at: '2026-09-08 09:30:00+00', text: 'x' },
      { id: 'old', to: [ADDRESS], subject: 'Yesterday', at: '2026-09-08 08:30:00+00', text: 'y' },
    ])
    expect((await t.action(api.email.inbox, { address: ADDRESS })).map(message => message.subject)).toEqual(['Now'])
  })

  test('answers nothing, and asks the provider nothing, once the deployment is production (test mode off), without a key, or for a real address', async () => {
    const requests = providerLog([{ id: 'e1', to: [ADDRESS], subject: 'Hello', at: '2026-09-08 09:59:00+00', text: 'x' }])
    expect(await t.action(api.email.inbox, { address: 'someone@example.com' })).toEqual([])
    delete process.env.EMAIL_API_KEY
    expect(await t.action(api.email.inbox, { address: ADDRESS })).toEqual([])
    process.env.EMAIL_API_KEY = 're_test_key'
    process.env.BACKEND_ENVIRONMENT = 'production'
    expect(await t.action(api.email.inbox, { address: ADDRESS })).toEqual([])
    // A deployment that never said what it is reads nothing either.
    delete process.env.BACKEND_ENVIRONMENT
    expect(await t.action(api.email.inbox, { address: ADDRESS })).toEqual([])
    expect(requests).toEqual([])
  })

  test('keeps no copy of its own: the component has no inbox table', () => {
    expect(Object.keys(schema.tables)).not.toContain('sandboxInbox')
  })

  test('refuses with the provider\'s reason when the key cannot read sent mail', async () => {
    providerLog([], 401)
    const failure = await t.action(api.email.inbox, { address: ADDRESS }).catch((error: unknown) => error)
    expect(getBackendError(failure)).toMatchObject({ code: 'unavailable', data: { service: 'email' } })
    expect(String((failure as Error).message)).toContain('restricted to sending')
  })
})

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
    expect(await t.query(api.email.status, { emailId: finalized })).toBeNull()
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

  test('a repeated idempotency key returns the first email and enqueues no second one', async () => {
    const send = { to: TEST_RECIPIENT, subject: 'Your gift', text: 'hi', idempotencyKey: 'gift:gift-1' }
    const first = await t.mutation(api.email.send, send)
    expect(await t.mutation(api.email.send, send)).toBe(first)
    expect(await t.mutation(api.email.send, { ...send, idempotencyKey: 'gift:gift-2' })).not.toBe(first)
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

describe('handleWebhook (component, the one verifier, nested status tracking)', () => {
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
    // The full record carries the same delivery state beside what was sent,
    // and none of the provider's own identifiers.
    const record = await t.query(api.email.get, { emailId })
    expect(record).toMatchObject({
      to: [TEST_RECIPIENT], status: 'bounced', bounced: true, errorMessage: 'Mailbox full', failed: false,
    })
    expect(record).not.toHaveProperty('resendId')
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
})

describe('secret emails: no record, and the body is gone once the provider answers', () => {
  const SANDBOX = 'delivered+code@resend.dev'
  const CODE = { to: SANDBOX, subject: 'Your sign-in code', text: 'Your code is 482915', html: '<p>Your code is <b>482915</b></p>' }

  /** Stub the provider's send endpoint with these answers, in order (the last one repeats); returns the requests it saw. */
  function providerAnswers(...answers: Array<{ status: number, body?: unknown, headers?: Record<string, string> }>) {
    const requests: Array<{ url: string, init: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      requests.push({ url, init })
      const answer = answers[Math.min(requests.length, answers.length) - 1]!
      return new Response(JSON.stringify(answer.body ?? {}), { status: answer.status, headers: answer.headers })
    }))
    return requests
  }

  const outbox = () => t.run(ctx => ctx.db.query('secretOutbox').collect())
  /** Let `ms` pass, and run what fell due. */
  async function pass(ms: number) {
    vi.advanceTimersByTime(ms)
    await t.finishInProgressScheduledFunctions()
  }
  const keyOf = (request: { init: RequestInit }) => (request.init.headers as Record<string, string>)['Idempotency-Key']

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('posts the message to the provider, keyed by its row, and leaves no record and no row', async () => {
    const requests = providerAnswers({ status: 200, body: { id: 're_1' } })
    expect(await t.mutation(api.email.sendSecret, CODE)).toBeNull()
    const [row] = await outbox()
    await t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(0))
    expect(requests).toHaveLength(1)
    expect(requests[0]!.url).toBe('https://api.resend.com/emails')
    expect(JSON.parse(String(requests[0]!.init.body))).toMatchObject({ to: SANDBOX, subject: CODE.subject, text: CODE.text, html: CODE.html })
    expect(keyOf(requests[0]!)).toBe(row!._id)
    expect(await outbox()).toEqual([])
  })

  test('tries again after a 409, a 429 or a 5xx, with the same key, waiting at least as long as Retry-After asks', async () => {
    const requests = providerAnswers({ status: 409 }, { status: 429, headers: { 'retry-after': '30' } }, { status: 503 }, { status: 200 })
    await t.mutation(api.email.sendSecret, CODE)
    await pass(0)
    expect(requests).toHaveLength(1)
    await pass(2_000)
    expect(requests).toHaveLength(2)
    // The 429 asked for 30 seconds: nothing before them.
    await pass(25_000)
    expect(requests).toHaveLength(2)
    for (let step = 0; step < 6; step++) await pass(10_000)
    expect(requests).toHaveLength(4)
    expect(new Set(requests.map(keyOf)).size).toBe(1)
    expect(await outbox()).toEqual([])
  })

  test('gives up on a refusal the provider will repeat, deletes the row, and logs no address', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const requests = providerAnswers({ status: 422, body: { message: 'Invalid `to` field' } })
    await t.mutation(api.email.sendSecret, CODE)
    await t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(0))
    expect(requests).toHaveLength(1)
    expect(await outbox()).toEqual([])
    const logged = warn.mock.calls.flat().join('\n')
    expect(logged).toContain('email.secret_failed')
    expect(logged).not.toMatch(/resend\.dev|Invalid/)
  })

  test('keeps trying a failing provider only while the code is valid, then deletes the row', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const requests = providerAnswers({ status: 500 })
    await t.mutation(api.email.sendSecret, CODE)
    for (let step = 0; step < 40 && (await outbox()).length > 0; step++) await pass(30_000)
    expect(requests.length).toBeGreaterThan(4)
    expect(await outbox()).toEqual([])
    // Each attempt waited for the one before it: the watchdog started no second chain.
    expect(requests.length).toBeLessThan(15)
  })

  test('deletes the row even when the delivery throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('network down')
    }))
    vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('boom')
    })
    await t.mutation(api.email.sendSecret, CODE)
    await t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(0))
    expect(await outbox()).toEqual([])
  })

  test('a watchdog runs a delivery that never settled, and the row expires on its own', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    providerAnswers({ status: 200 })
    await t.mutation(api.email.sendSecret, CODE)
    const jobs = (await t.run(ctx => ctx.db.system.query('_scheduled_functions').collect())).map(job => job.name)
    expect(jobs).toEqual(expect.arrayContaining([expect.stringContaining('deliverSecret'), expect.stringContaining('watchSecret'), expect.stringContaining('expireSecret')]))
    await pass(0)
    expect(await outbox()).toEqual([])
    // A row whose delivery run was lost: the watchdog brings it back to the provider.
    const lost = await t.run(ctx => ctx.db.insert('secretOutbox', { message: { ...CODE, from: 'a@b.c' }, attempts: 0, generation: 0, nextAttemptAt: Date.now() - 60_000, expiresAt: Date.now() + 600_000 }))
    await t.mutation(internal.email.watchSecret, { id: lost })
    // Its new run is due at the watchdog's own time, which a frozen test clock
    // trails by the deployment's commit tick.
    await pass(1)
    expect(await outbox()).toEqual([])
    // A row nobody delivered expires at the TTL.
    const id = await t.run(ctx => ctx.db.insert('secretOutbox', { message: { ...CODE, from: 'a@b.c' }, attempts: 0, generation: 0, nextAttemptAt: Date.now(), expiresAt: Date.now() + 600_000 }))
    await t.mutation(internal.email.expireSecret, { id })
    expect(await outbox()).toEqual([])
  })

  test('a caller-supplied idempotency key dedupes a send while one waits', async () => {
    providerAnswers({ status: 200 })
    await t.mutation(api.email.sendSecret, { ...CODE, idempotencyKey: 'k1' })
    await t.mutation(api.email.sendSecret, { ...CODE, idempotencyKey: 'k1' })
    expect(await outbox()).toHaveLength(1)
  })

  test('refuses an address that is not a sandbox one in test mode, even another resend.dev one', async () => {
    providerAnswers({ status: 200 })
    await expect(t.mutation(api.email.sendSecret, { ...CODE, to: 'someone@example.com' })).rejects.toThrow('Test mode is enabled')
    await expect(t.mutation(api.email.sendSecret, { ...CODE, to: 'anything@resend.dev' })).rejects.toThrow('Test mode is enabled')
  })

  test('sends nothing without an API key', async () => {
    delete process.env.EMAIL_API_KEY
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const requests = providerAnswers({ status: 200 })
    expect(await t.mutation(api.email.sendSecret, CODE)).toBeNull()
    await t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(0))
    expect(requests).toHaveLength(0)
  })
})

describe('secret emails: one chain at a time, and nothing after the secret expires', () => {
  const SANDBOX = 'delivered+code@resend.dev'
  const CODE = { to: SANDBOX, subject: 'Your sign-in code', text: 'Your code is 482915' }
  const outbox = () => t.run(ctx => ctx.db.query('secretOutbox').collect())

  function provider(status: number) {
    const requests: unknown[] = []
    vi.stubGlobal('fetch', vi.fn(async (...args: unknown[]) => {
      requests.push(args)
      return new Response('{}', { status })
    }))
    return requests
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('a run of a replaced generation stops at once, and its retry is refused', async () => {
    const requests = provider(200)
    const id = await t.run(ctx => ctx.db.insert('secretOutbox', { message: { ...CODE, from: 'a@b.c' }, attempts: 0, generation: 2, nextAttemptAt: Date.now(), expiresAt: Date.now() + 600_000 }))
    await t.action(internal.email.deliverSecret, { id, generation: 1 })
    expect(requests).toHaveLength(0)
    expect(await outbox()).toHaveLength(1)
    expect(await t.mutation(internal.email.retrySecret, { id, generation: 1, delay: 1000 })).toBe('stale')
    // The owning generation sends, and the row is gone.
    await t.action(internal.email.deliverSecret, { id, generation: 2 })
    expect(requests).toHaveLength(1)
    expect(await outbox()).toEqual([])
  })

  test('the watchdog replaces a lost chain with a new generation', async () => {
    provider(200)
    const id = await t.run(ctx => ctx.db.insert('secretOutbox', { message: { ...CODE, from: 'a@b.c' }, attempts: 0, generation: 0, nextAttemptAt: Date.now() - 60_000, expiresAt: Date.now() + 600_000 }))
    await t.mutation(internal.email.watchSecret, { id })
    expect((await outbox())[0]).toMatchObject({ generation: 1 })
  })

  test('stops at the secret\'s own expiry, before the outbox TTL', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const requests = provider(500)
    await t.mutation(api.email.sendSecret, { ...CODE, expiresAt: Date.now() + 10_000 })
    const [row] = await outbox()
    expect(row!.expiresAt).toBeLessThanOrEqual(Date.now() + 10_000)
    vi.advanceTimersByTime(0)
    await t.finishInProgressScheduledFunctions()
    const sent = requests.length
    expect(sent).toBeGreaterThan(0)
    for (let step = 0; step < 4; step++) {
      vi.advanceTimersByTime(5_000)
      await t.finishInProgressScheduledFunctions()
    }
    expect(await outbox()).toEqual([])
    // Nothing is posted once the secret has expired.
    expect(await t.query(internal.email.secretInOutbox, { id: row!._id, now: Date.now() })).toBeNull()
  })

  test('a run that finds the secret expired sends nothing', async () => {
    const requests = provider(200)
    const id = await t.run(ctx => ctx.db.insert('secretOutbox', { message: { ...CODE, from: 'a@b.c' }, attempts: 0, generation: 0, nextAttemptAt: Date.now(), expiresAt: Date.now() - 1 }))
    await t.action(internal.email.deliverSecret, { id, generation: 0 })
    expect(requests).toHaveLength(0)
  })
})

describe('email retention', () => {
  const DAYS_90 = 90 * 24 * 60 * 60 * 1000
  const settings = () => t.run(ctx => ctx.db.query('emailSettings').collect())

  test('a send records the app\'s retention, once, for the maintenance to prune by', async () => {
    await t.mutation(api.email.send, { to: TEST_RECIPIENT, subject: 'Hi', text: 'x', retention: {} })
    expect(await settings()).toEqual([])
    await t.mutation(api.email.send, { to: TEST_RECIPIENT, subject: 'Hi', text: 'x', retention: { finalizedMs: DAYS_90 } })
    await t.mutation(api.email.send, { to: TEST_RECIPIENT, subject: 'Hi', text: 'x', retention: { finalizedMs: DAYS_90 } })
    expect(await settings()).toMatchObject([{ finalizedMs: DAYS_90 }])
    // An explicit {} is the defaults again.
    await t.mutation(api.email.send, { to: TEST_RECIPIENT, subject: 'Hi', text: 'x', retention: {} })
    expect((await settings())[0]).not.toHaveProperty('finalizedMs')
  })

  test('a send with no retention (a workflow step calling the component) leaves the app\'s setting alone', async () => {
    await t.mutation(api.email.send, { to: TEST_RECIPIENT, subject: 'Hi', text: 'x', retention: { finalizedMs: DAYS_90 } })
    await sendOne()
    expect(await settings()).toMatchObject([{ finalizedMs: DAYS_90 }])
  })

  test('setupEmail always sends its retention, {} for the defaults', async () => {
    const runMutation = vi.fn(async () => null)
    const email = setupEmail({ backend: { email: { send: 'send', sendSecret: 'sendSecret' } } } as never)
    await email.send({ runMutation } as never, { to: TEST_RECIPIENT, subject: 'Hi', text: 'x' })
    expect(runMutation).toHaveBeenLastCalledWith('send', expect.objectContaining({ retention: {} }))
    const custom = setupEmail({ backend: { email: { send: 'send', sendSecret: 'sendSecret' } } } as never, { retention: { finalizedMs: DAYS_90 } })
    await custom.sendTemplate({ runMutation } as never, 'otp', { email: TEST_RECIPIENT, otp: '123456', type: 'sign-in' }, { expiresAt: 123 })
    expect(runMutation).toHaveBeenLastCalledWith('sendSecret', expect.objectContaining({ retention: { finalizedMs: DAYS_90 }, expiresAt: 123 }))
  })
})

describe('a send the quiet hours hold', () => {
  test('waits in a row an erasure deletes, and its release is scheduled by the row alone', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    const deliverAt = Date.now() + 60 * 60 * 1000
    expect(await t.mutation(api.email.send, { to: 'Ada@Example.com', subject: 'Strip tips', html: '<p>Hi</p>', deliverAt })).toBeNull()
    const held = await t.run(ctx => ctx.db.query('heldEmails').collect())
    expect(held).toEqual([expect.objectContaining({ email: 'ada@example.com', deliverAt, message: expect.objectContaining({ subject: 'Strip tips' }) })])
    const scheduled = await t.run(ctx => ctx.db.system.query('_scheduled_functions').collect())
    expect(scheduled.map(job => job.args)).toContainEqual([{ id: held[0]!._id }])
    expect(JSON.stringify(scheduled)).not.toContain('example.com')

    await t.mutation(api.account.forget, { email: 'ada@example.com' })
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await t.run(ctx => ctx.db.query('heldEmails').collect())).toEqual([])
  })

  test('goes at the quiet hours\' end, and its row with it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    await t.mutation(api.email.send, { to: TEST_RECIPIENT, subject: 'Later', text: 'hi', deliverAt: Date.now() + 60_000 })
    vi.advanceTimersByTime(61_000)
    await t.finishInProgressScheduledFunctions()
    expect(await t.run(ctx => ctx.db.query('heldEmails').collect())).toEqual([])
  })
})
