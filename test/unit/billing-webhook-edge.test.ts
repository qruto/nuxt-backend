import { Polar } from '@convex-dev/polar'
import { Webhook } from 'standardwebhooks'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { type Billing, type BillingComponents, setupBilling, type SetupBillingConfig } from '../../src/convex/integrations/billing'
import { WEBHOOK_BODY_LIMIT, type WebhookLogRefs, type WebhookOutcome } from '../../src/convex/integrations/webhook-guard'

// The `/billing/events` edge against the real `@convex-dev/polar` — nothing of
// it is mocked. The route is ours, but verification and parsing are upstream's:
// `setupBilling` mounts one upstream route per accepted secret on a shim router
// and keeps the http action's implementation, which convex-server exposes on
// the private `_handler` property. That seam is pinned here, together with the
// status table the guard and the captured handlers produce between them.
//
// Only the delivery log is faked, as an in-memory table with the component's
// own dedupe rule: an `ok` row wins, otherwise the latest row answers.

const refs = {
  record: 'ref:webhooks.record',
  find: 'ref:webhooks.find',
  listRecent: 'ref:webhooks.listRecent',
} as unknown as WebhookLogRefs

const components = {
  polar: { lib: { insertCustomer: 'ref:insertCustomer' } },
  backend: {
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

/** A fresh Standard Webhooks secret: `whsec_` and 24 random bytes in base64. */
function generateSecret(): string {
  return `whsec_${Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('base64')}`
}

/** Sign the way the provider does — Standard Webhooks semantics. */
function signedRequest(secret: string, body: string, id = 'msg_1'): Request {
  const at = new Date()
  return new Request('https://site.test/billing/events', {
    method: 'POST',
    body,
    headers: {
      'webhook-id': id,
      'webhook-timestamp': String(Math.floor(at.getTime() / 1000)),
      'webhook-signature': new Webhook(secret).sign(id, at, body),
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
  // Upstream logs every refused signature; the count is one per handler tried.
  errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubEnv('BILLING_WEBHOOK_SECRET', undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('the captured upstream handlers', () => {
  it.each([1, 2])('captures exactly one `_handler` per configured secret (%i)', async (count) => {
    const registered: Array<{ path: string, method: string, handler: unknown }> = []
    const registerRoutes = Polar.prototype.registerRoutes
    vi.spyOn(Polar.prototype, 'registerRoutes').mockImplementation(function (this: Polar, http, options) {
      const tap = {
        route: (spec: { path: string, method: string, handler: unknown }) => {
          registered.push(spec)
          ;(http as unknown as { route: (spec: unknown) => void }).route(spec)
        },
      }
      return registerRoutes.call(this, tap as never, options)
    })
    const secrets = Array.from({ length: count }, generateSecret)

    const edge = billing({ webhookSecret: secrets.join(',') })

    expect(registered).toHaveLength(count)
    for (const spec of registered) {
      expect(spec).toMatchObject({ path: '/billing/events', method: 'POST' })
      expect((spec.handler as { _handler?: unknown })._handler).toBeTypeOf('function')
    }

    // Every captured handler runs on a delivery none of them accepts, and
    // upstream logs each refusal once: the count is the number captured.
    const { ctx } = makeCtx()
    const response = await edge.webhookHandler(ctx, signedRequest(generateSecret(), memberDeleted()))
    expect(response.status).toBe(403)
    expect(errors).toHaveBeenCalledTimes(count)
  })
})

describe('signatures', () => {
  it('a Standard-Webhooks-signed delivery verifies, runs the event map, and is logged ok', async () => {
    const secret = generateSecret()
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

  it('rotation: with `whsec_new,whsec_old`, a delivery signed with the old secret verifies on the second handler', async () => {
    const newSecret = generateSecret()
    const oldSecret = generateSecret()
    const deleted = vi.fn(async () => {})
    const edge = billing({ webhookSecret: `${newSecret},${oldSecret}`, events: { 'member.deleted': deleted } })
    const { ctx, rows } = makeCtx()

    const response = await edge.webhookHandler(ctx, signedRequest(oldSecret, memberDeleted(), 'msg_old'))

    expect(response.status).toBe(202)
    expect(deleted).toHaveBeenCalledTimes(1)
    // The primary secret's handler refused first; the old one accepted.
    expect(errors).toHaveBeenCalledTimes(1)
    expect(outcomes(rows)).toStrictEqual([['ok', 'member.deleted']])

    const fresh = await edge.webhookHandler(ctx, signedRequest(newSecret, memberDeleted(), 'msg_new'))
    expect(fresh.status).toBe(202)
    expect(errors).toHaveBeenCalledTimes(1)
  })

  it('invalid signature → 403, logged invalid_signature, nothing dispatched', async () => {
    const deleted = vi.fn(async () => {})
    const { ctx, rows } = makeCtx()

    const response = await billing({ webhookSecret: generateSecret(), events: { 'member.deleted': deleted } })
      .webhookHandler(ctx, signedRequest(generateSecret(), memberDeleted()))

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
    const secret = generateSecret()
    const onUnknownEvent = vi.fn(async () => {})
    const { ctx, rows } = makeCtx()

    const response = await billing({ webhookSecret: secret, onUnknownEvent }).webhookHandler(ctx, signedRequest(secret, body))

    expect(response.status).toBe(202)
    expect(await response.text()).toBe('Accepted (unknown event type)')
    expect(onUnknownEvent).toHaveBeenCalledWith(ctx, { type, payload: JSON.parse(body) })
    expect(outcomes(rows)).toStrictEqual([['unknown_type', type]])
  })

  it('a redelivered id after an ok → 200 without running anything again', async () => {
    const secret = generateSecret()
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

  it('no secret → 503 and no upstream handler is mounted at all', async () => {
    const registerRoutes = vi.spyOn(Polar.prototype, 'registerRoutes')
    const { ctx, rows } = makeCtx()

    const response = await billing({}).webhookHandler(ctx, signedRequest(generateSecret(), memberDeleted()))

    expect(response.status).toBe(503)
    expect(registerRoutes).not.toHaveBeenCalled()
    expect(outcomes(rows)).toStrictEqual([['missing_secret', undefined]])
  })

  it('oversized body → 413 before any handler verifies it', async () => {
    const secret = generateSecret()
    const { ctx, rows } = makeCtx()

    const response = await billing({ webhookSecret: secret })
      .webhookHandler(ctx, signedRequest(secret, 'x'.repeat(WEBHOOK_BODY_LIMIT + 1)))

    expect(response.status).toBe(413)
    expect(errors).not.toHaveBeenCalled()
    expect(outcomes(rows)).toStrictEqual([['oversized', undefined]])
  })
})
