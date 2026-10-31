import { Webhook } from 'standardwebhooks'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { type Billing, type BillingComponents, setupBilling, type SetupBillingConfig } from '../../src/convex/integrations/billing'
import { WEBHOOK_BODY_LIMIT, type WebhookLogRefs, type WebhookOutcome } from '../../src/convex/integrations/webhook-guard'
import { fakeCredential, signingSecret } from '../helpers/secrets'

// The `/billing/events` edge, end to end with nothing of the route mocked: the
// one verifier (Standard Webhooks, plus Polar's legacy key for a secret
// created before 2026-09-08) checks every secret of the rotation list, the
// provider SDK parses the event, the provider component's subscriptions and
// products are written as its own route would, and the event map runs. The
// status table the guard and the route produce between them is pinned here.
//
// Only the delivery log is faked, as an in-memory table with the component's
// own dedupe rule: an `ok` row wins, otherwise the latest row answers.

const refs = {
  record: 'ref:webhooks.record',
  find: 'ref:webhooks.find',
  listRecent: 'ref:webhooks.listRecent',
} as unknown as WebhookLogRefs

const components = {
  polar: { lib: { insertCustomer: 'ref:insertCustomer', createSubscription: 'ref:createSubscription', updateSubscription: 'ref:updateSubscription', createProduct: 'ref:createProduct', updateProduct: 'ref:updateProduct' } },
  backend: {
    // The auth tables' adapter: the fresh member and role reads.
    adapter: { findOne: 'ref:findOne' },
    billing: { userByCustomer: 'ref:userByCustomer', upsert: 'ref:upsert', upsertBenefitMetadata: 'ref:upsertBenefitMetadata' },
    gifts: {},
    webhooks: refs,
  },
} as unknown as BillingComponents

type Row = { service: string, deliveryId: string, type?: string, outcome: WebhookOutcome, note?: string }
type RunCall = (ref: unknown, args: unknown) => Promise<unknown>

/** An action ctx whose only state is the delivery log. */
function makeCtx() {
  const rows: Row[] = []
  const runQuery = vi.fn<RunCall>(async (ref, args) => {
    if (ref !== refs.find) return null
    const { service, deliveryId } = args as { service: string, deliveryId: string }
    const matching = rows.filter(row => row.service === service && row.deliveryId === deliveryId)
    const row = matching.find(candidate => candidate.outcome === 'ok') ?? matching.at(-1)
    return row ? { outcome: row.outcome, receivedAt: 0 } : null
  })
  const runMutation = vi.fn<RunCall>(async (ref, args) => {
    if (ref === refs.record) rows.push(args as Row)
    return null
  })
  return { ctx: { runQuery, runMutation } as unknown as Parameters<Billing['webhookHandler']>[0], rows }
}

/** Sign the way the provider does — Standard Webhooks semantics. */
function signedRequest(secret: string, body: string, id = 'msg_1', headers: Record<string, string> = {}): Request {
  const at = new Date()
  return new Request('https://site.test/billing/events', {
    method: 'POST',
    body,
    headers: {
      'webhook-id': id,
      'webhook-timestamp': String(Math.floor(at.getTime() / 1000)),
      'webhook-signature': new Webhook(secret).sign(id, at, body),
      ...headers,
    },
  })
}

/**
 * The smallest delivery the installed SDK parses: `member.deleted` carries a
 * flat member record, and no built-in handler acts on it, so a verified one
 * reaches the consumer's hook and nothing else.
 */
function memberDeleted(data: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'member.deleted',
    timestamp: '2026-10-01T00:00:00Z',
    data: {
      id: 'mem_1',
      created_at: '2026-10-01T00:00:00Z',
      modified_at: null,
      customer_id: 'cus_1',
      email: 'member@example.com',
      name: null,
      external_id: null,
      role: 'member',
      ...data,
    },
  })
}

function billing(config: Omit<SetupBillingConfig, 'email'>) {
  // No gift here is paid, so nothing is sent.
  return setupBilling(components, { email: { sendTemplate: async () => null }, ...config })
}

const outcomes = (rows: Row[]) => rows.map(row => [row.outcome, row.type])

let errors: Mock<typeof console.error>

beforeEach(() => {
  // Nothing on the route logs to the console: a refusal is the delivery log's.
  errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubEnv('BILLING_WEBHOOK_SECRET', undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('signatures', () => {
  it('a Standard-Webhooks-signed delivery verifies, runs the event map, and is logged ok', async () => {
    const secret = signingSecret()
    const deleted = vi.fn(async () => {})
    const { ctx, rows } = makeCtx()

    const response = await billing({ webhookSecret: secret, events: { 'member.deleted': deleted } })
      .webhookHandler(ctx, signedRequest(secret, memberDeleted()))

    expect(response.status).toBe(202)
    expect(deleted).toHaveBeenCalledTimes(1)
    expect(deleted).toHaveBeenCalledWith(ctx, expect.objectContaining({
      type: 'member.deleted',
      data: expect.objectContaining({ id: 'mem_1', customerId: 'cus_1' }),
    }))
    expect(outcomes(rows)).toStrictEqual([['ok', 'member.deleted']])
    expect(errors).not.toHaveBeenCalled()
  })

  it('rotation: with `whsec_new,whsec_old`, a delivery signed with the old secret verifies', async () => {
    const newSecret = signingSecret()
    const oldSecret = signingSecret()
    const deleted = vi.fn(async () => {})
    const edge = billing({ webhookSecret: `${newSecret},${oldSecret}`, events: { 'member.deleted': deleted } })
    const { ctx, rows } = makeCtx()

    const response = await edge.webhookHandler(ctx, signedRequest(oldSecret, memberDeleted(), 'msg_old'))

    expect(response.status).toBe(202)
    expect(deleted).toHaveBeenCalledTimes(1)
    expect(errors).not.toHaveBeenCalled()
    expect(outcomes(rows)).toStrictEqual([['ok', 'member.deleted']])

    const fresh = await edge.webhookHandler(ctx, signedRequest(newSecret, memberDeleted(), 'msg_new'))
    expect(fresh.status).toBe(202)
    expect(errors).not.toHaveBeenCalled()
  })

  it('a secret created before 2026-09-08: Polar\'s legacy key reading verifies', async () => {
    const secret = fakeCredential('polar_whs_')
    const deleted = vi.fn(async () => {})
    const { ctx, rows } = makeCtx()
    const body = memberDeleted()
    const at = new Date()
    const request = new Request('https://site.test/billing/events', {
      method: 'POST',
      body,
      headers: {
        'webhook-id': 'msg_legacy',
        'webhook-timestamp': String(Math.floor(at.getTime() / 1000)),
        'webhook-signature': new Webhook(new TextEncoder().encode(secret), { format: 'raw' }).sign('msg_legacy', at, body),
      },
    })

    const response = await billing({ webhookSecret: secret, events: { 'member.deleted': deleted } }).webhookHandler(ctx, request)

    expect(response.status).toBe(202)
    expect(deleted).toHaveBeenCalledTimes(1)
    expect(outcomes(rows)).toStrictEqual([['ok', 'member.deleted']])
  })

  it('a stale timestamp → 403, however right the signature', async () => {
    const secret = signingSecret()
    const { ctx, rows } = makeCtx()
    const body = memberDeleted()
    const at = new Date(Date.now() - 10 * 60_000)
    const request = new Request('https://site.test/billing/events', {
      method: 'POST',
      body,
      headers: { 'webhook-id': 'msg_stale', 'webhook-timestamp': String(Math.floor(at.getTime() / 1000)), 'webhook-signature': new Webhook(secret).sign('msg_stale', at, body) },
    })

    expect((await billing({ webhookSecret: secret }).webhookHandler(ctx, request)).status).toBe(403)
    expect(outcomes(rows)).toStrictEqual([['invalid_signature', undefined]])
  })

  it('invalid signature → 403, logged invalid_signature, nothing dispatched', async () => {
    const deleted = vi.fn(async () => {})
    const { ctx, rows } = makeCtx()

    const response = await billing({ webhookSecret: signingSecret(), events: { 'member.deleted': deleted } })
      .webhookHandler(ctx, signedRequest(signingSecret(), memberDeleted()))

    expect(response.status).toBe(403)
    expect(deleted).not.toHaveBeenCalled()
    expect(outcomes(rows)).toStrictEqual([['invalid_signature', undefined]])
  })
})

describe('outcomes', () => {
  it.each([
    ['a type the SDK does not know', JSON.stringify({ type: 'mystery.event', data: { id: 'x_1' } }), 'mystery.event'],
    ['a known type whose payload the SDK rejects', memberDeleted({ customer_id: 42 }), 'member.deleted'],
  ])('authentic but unparseable (%s) → 202, onUnknownEvent, logged unknown_type', async (_, body, type) => {
    const secret = signingSecret()
    const onUnknownEvent = vi.fn(async () => {})
    const { ctx, rows } = makeCtx()

    const response = await billing({ webhookSecret: secret, onUnknownEvent }).webhookHandler(ctx, signedRequest(secret, body))

    expect(response.status).toBe(202)
    expect(await response.text()).toBe('Accepted (unknown event type)')
    expect(onUnknownEvent).toHaveBeenCalledWith(ctx, { type, payload: JSON.parse(body) })
    expect(outcomes(rows)).toStrictEqual([['unknown_type', type]])
  })

  it('a throwing onUnknownEvent → rethrown so the provider retries, logged handler_error with the type', async () => {
    const secret = signingSecret()
    const { ctx, rows } = makeCtx()
    const onUnknownEvent = vi.fn(async () => {
      throw new Error('hook failed')
    })
    const body = JSON.stringify({ type: 'mystery.event', data: { id: 'x_1' } })

    await expect(billing({ webhookSecret: secret, onUnknownEvent }).webhookHandler(ctx, signedRequest(secret, body)))
      .rejects.toThrow('hook failed')

    expect(rows.map(row => [row.outcome, row.type, row.note])).toStrictEqual([['handler_error', 'mystery.event', 'hook failed']])
  })

  it('a redelivered id after an ok → 200 without running anything again', async () => {
    const secret = signingSecret()
    const deleted = vi.fn(async () => {})
    const edge = billing({ webhookSecret: secret, events: { 'member.deleted': deleted } })
    const { ctx, rows } = makeCtx()
    const body = memberDeleted()

    expect((await edge.webhookHandler(ctx, signedRequest(secret, body, 'msg_once'))).status).toBe(202)
    const redelivery = await edge.webhookHandler(ctx, signedRequest(secret, body, 'msg_once'))

    expect(redelivery.status).toBe(200)
    expect(await redelivery.text()).toBe('Already processed')
    expect(deleted).toHaveBeenCalledTimes(1)
    expect(outcomes(rows)).toStrictEqual([['ok', 'member.deleted'], ['duplicate', undefined]])
  })

  it('no secret → 503, and nothing verified or run', async () => {
    const { ctx, rows } = makeCtx()

    const response = await billing({}).webhookHandler(ctx, signedRequest(signingSecret(), memberDeleted()))

    expect(response.status).toBe(503)
    expect(outcomes(rows)).toStrictEqual([['missing_secret', undefined]])
  })

  it('oversized body → 413 before any handler verifies it', async () => {
    const secret = signingSecret()
    const { ctx, rows } = makeCtx()

    const response = await billing({ webhookSecret: secret })
      .webhookHandler(ctx, signedRequest(secret, 'x'.repeat(WEBHOOK_BODY_LIMIT + 1)))

    expect(response.status).toBe(413)
    expect(errors).not.toHaveBeenCalled()
    expect(outcomes(rows)).toStrictEqual([['oversized', undefined]])
  })

  it('a declared Content-Length over the cap → 413 with the body never read', async () => {
    const secret = signingSecret()
    const { ctx, rows } = makeCtx()
    const request = signedRequest(secret, memberDeleted(), 'msg_big', { 'content-length': String(WEBHOOK_BODY_LIMIT + 1) })

    const response = await billing({ webhookSecret: secret }).webhookHandler(ctx, request)

    expect(response.status).toBe(413)
    expect(request.bodyUsed).toBe(false)
    expect(outcomes(rows)).toStrictEqual([['oversized', undefined]])
  })

  it('counts the cap in bytes: a body under it in characters but over it in UTF-8 → 413', async () => {
    const secret = signingSecret()
    const { ctx, rows } = makeCtx()

    const response = await billing({ webhookSecret: secret })
      .webhookHandler(ctx, signedRequest(secret, '€'.repeat(Math.floor(WEBHOOK_BODY_LIMIT / 3) + 1)))

    expect(response.status).toBe(413)
    expect(errors).not.toHaveBeenCalled()
    expect(outcomes(rows)).toStrictEqual([['oversized', undefined]])
  })
})
