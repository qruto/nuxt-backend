import { Polar } from '@convex-dev/polar'
import { Webhook } from 'standardwebhooks'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { type Billing, type BillingComponents, setupBilling, type SetupBillingConfig } from '../../src/convex/integrations/billing'
import { WEBHOOK_BODY_LIMIT, type WebhookLogRefs, type WebhookOutcome } from '../../src/convex/integrations/webhook-guard'

// `/billing/events` runs upstream's verification through handlers captured
// from registered http actions' private `_handler` field (see
// billing-webhook-edge.test.ts, which pins the seam as installed). This file
// is the day that field moves: a Convex release that hands over an http
// action without `_handler` must not turn every genuine delivery into a 403
// logged as `invalid_signature` — that sends operators after the secret. It
// fails loudly instead, with the cause, and the provider keeps retrying.

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
  const runQuery = vi.fn<RunCall>(async () => null)
  const runMutation = vi.fn<RunCall>(async (ref, args) => {
    if (ref === refs.record) rows.push(args as Row)
    return null
  })
  return { ctx: { runQuery, runMutation } as unknown as Parameters<Billing['webhookHandler']>[0], rows }
}

function generateSecret(): string {
  return `whsec_${Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('base64')}`
}

/** Signed the way the provider signs — a genuine delivery. */
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

const memberDeleted = JSON.stringify({
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
  },
})

/**
 * Make the http actions upstream registers look like a Convex release that
 * moved the private field: same implementation, no `_handler`. `keep` lists
 * which registrations (by order) still carry it.
 */
function moveHandlerSeam(keep: number[] = []) {
  const registerRoutes = Polar.prototype.registerRoutes
  let registration = 0
  vi.spyOn(Polar.prototype, 'registerRoutes').mockImplementation(function (this: Polar, http, options) {
    const tap = {
      route: (spec: { handler: { _handler?: unknown } }) => {
        const index = registration++
        const handler = keep.includes(index) ? spec.handler : { isHttp: true, _implementation: spec.handler._handler }
        ;(http as unknown as { route: (spec: unknown) => void }).route({ ...spec, handler })
      },
    }
    return registerRoutes.call(this, tap as never, options)
  })
}

function billing(config: Omit<SetupBillingConfig, 'email'>) {
  return setupBilling(components, { email: { sendTemplate: async () => null }, ...config })
}

let errors: Mock<typeof console.error>

beforeEach(() => {
  errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubEnv('BILLING_WEBHOOK_SECRET', undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('a webhook seam that captured nothing', () => {
  it('fails a genuine delivery loudly with its cause — never a 403, never `invalid_signature`', async () => {
    moveHandlerSeam()
    const secret = generateSecret()
    const deleted = vi.fn(async () => {})
    const edge = billing({ webhookSecret: secret, events: { 'member.deleted': deleted } })
    const { ctx, rows } = makeCtx()

    // A throw is what the platform answers 500 to — so the provider retries
    // the delivery until a fixed deployment can verify it.
    await expect(edge.webhookHandler(ctx, signedRequest(secret, memberDeleted)))
      .rejects.toThrow(/handlers were not captured[\s\S]*This is not a signature problem/)

    // Recorded with its cause, and nothing read off a body nobody verified.
    expect(rows.map(row => [row.outcome, row.type])).toStrictEqual([['handler_error', undefined]])
    expect(rows[0]!.note).toMatch(/not captured[\s\S]*`_handler`[\s\S]*upgrade nuxt-backend/)
    expect(deleted).not.toHaveBeenCalled()
    // Nothing ran a verification, so nothing refused a signature.
    expect(errors).not.toHaveBeenCalled()
  })

  it('names the fix in the error itself: pin convex or upgrade nuxt-backend', async () => {
    moveHandlerSeam()
    const secret = generateSecret()
    const { ctx } = makeCtx()

    await expect(billing({ webhookSecret: secret }).webhookHandler(ctx, signedRequest(secret, memberDeleted)))
      .rejects.toThrow(/Pin `convex` to a release nuxt-backend supports, or upgrade nuxt-backend/)
  })

  it('refuses even a delivery signed with a secret whose handler was captured, when another one was not', async () => {
    // With a rotation list, one secret's handler missing means some genuine
    // deliveries could never verify; that is the same broken edge.
    moveHandlerSeam([0])
    const primary = generateSecret()
    const previous = generateSecret()
    const { ctx, rows } = makeCtx()

    await expect(billing({ webhookSecret: `${primary},${previous}` }).webhookHandler(ctx, signedRequest(primary, memberDeleted)))
      .rejects.toThrow(/not captured/)
    expect(rows.map(row => row.outcome)).toStrictEqual(['handler_error'])
  })

  it('leaves the guard’s answers first: an unset secret is still 503, an oversized body 413', async () => {
    moveHandlerSeam()

    const unset = makeCtx()
    const missing = await billing({}).webhookHandler(unset.ctx, signedRequest(generateSecret(), memberDeleted))
    expect(missing.status).toBe(503)
    expect(unset.rows.map(row => row.outcome)).toStrictEqual(['missing_secret'])

    const secret = generateSecret()
    const huge = makeCtx()
    const oversized = await billing({ webhookSecret: secret }).webhookHandler(huge.ctx, signedRequest(secret, 'x'.repeat(WEBHOOK_BODY_LIMIT + 1)))
    expect(oversized.status).toBe(413)
    expect(huge.rows.map(row => row.outcome)).toStrictEqual(['oversized'])
  })

  it('does not stop setupBilling: the modules that import billing (http.ts, ai.ts) keep loading', () => {
    moveHandlerSeam()

    expect(() => billing({ webhookSecret: generateSecret() })).not.toThrow()
  })
})
