import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupWebhooks, type SetupWebhooksOptions } from '../../src/convex/integrations/webhooks'
import { RECENT_SIGN_IN_SECONDS } from '../../src/convex/constants'

// The log's own module, setupWebhooks. `getWebhookDeliveries` serves the
// deployment-wide delivery log — every account's provider delivery ids,
// event types, outcomes and handler errors —
// so it answers an administrator now, in person, the role read fresh from
// the user table, never from the token. Anyone else reads `null`, never an
// error: the DevTools panel subscribes to it reactively, and a throwing
// query would be retried on every reconnect. `replayWebhookDelivery` is an
// administrator's write: in person, recently signed in, and only for a
// delivery the log holds.

const listRecent = 'ref:webhooks.listRecent'
const entry = 'ref:webhooks.entry'
const markReplayed = 'ref:webhooks.markReplayed'
const findOne = 'ref:findOne'

const components = {
  backend: {
    adapter: { findOne },
    webhooks: { record: 'ref:webhooks.record', find: 'ref:webhooks.find', listRecent, entry, markReplayed },
  },
}

const log = [{ service: 'billing', deliveryId: 'wh_1', type: 'order.paid', outcome: 'ok', receivedAt: 1 }]

const member = { subject: 'u1', email: 'member@example.com' }
const admin = { ...member, role: 'admin' }
/** Signed in a minute ago: recent enough for a write. */
const fresh = () => ({ ...admin, sessionId: 's1', authTime: Date.now() - 60_000 })

/** The account as the user table holds it now: by default, as its token says. */
type Stored = { role?: string, banned?: boolean } | null

type Handler = { _handler: (ctx: unknown, args: unknown) => Promise<unknown> }

function read(claims: Record<string, unknown> | null, options: SetupWebhooksOptions = {}, args: { limit?: number } = {}, stored: Stored = claims as Stored) {
  const webhooks = setupWebhooks(components, options)
  const ctx = {
    auth: { getUserIdentity: vi.fn(async () => claims) },
    runQuery: vi.fn(async (ref: unknown, _args?: unknown) => ref === listRecent ? log : ref === findOne ? stored : null),
  }
  return { ctx, result: (webhooks.api.getWebhookDeliveries as unknown as Handler)._handler(ctx, args) }
}

describe('getWebhookDeliveries — admin-only', () => {
  it('answers a signed-out caller null, without reading the log', async () => {
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
    expect(ctx.runQuery).toHaveBeenCalledWith(findOne, { model: 'user', where: [{ field: '_id', value: 'u1' }] })
    expect(ctx.runQuery).not.toHaveBeenCalledWith(listRecent, expect.anything())
  })

  it('serves an admin the log, passing the limit through', async () => {
    const { ctx, result } = read(admin, {}, { limit: 15 })

    await expect(result).resolves.toBe(log)
    expect(ctx.runQuery).toHaveBeenCalledWith(listRecent, { limit: 15 })
  })

  it('reads a comma-separated role, as the admin plugin stores it', async () => {
    await expect(read(member, {}, {}, { role: 'user, admin' }).result).resolves.toBe(log)
  })

  it('serves an admin promoted since their token was minted, and one named by id', async () => {
    await expect(read(member, {}, {}, { role: 'admin' }).result).resolves.toBe(log)
    await expect(read(member, { adminUserIds: ['u1'] }, {}, {}).result).resolves.toBe(log)
  })

  it('answers an admin acting as someone else null', async () => {
    await expect(read({ ...admin, impersonatedBy: 'admin-2' }).result).resolves.toBeNull()
  })
})

describe('replayWebhookDelivery', () => {
  // A replay runs on a production or development deployment alone.
  beforeEach(() => {
    vi.stubEnv('BACKEND_ENVIRONMENT', 'development')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  function replay(claims: Record<string, unknown> | null, args: { service: 'billing' | 'email', deliveryId: string }, held: Record<string, unknown> | null = { type: 'order.paid', outcome: 'handler_error', receivedAt: 1 }) {
    const recordBackendEvent = vi.fn(async () => {})
    const webhooks = setupWebhooks(components, { audit: { recordBackendEvent } as never })
    const ctx = {
      auth: { getUserIdentity: vi.fn(async () => claims) },
      runQuery: vi.fn(async (ref: unknown) => ref === findOne ? { role: claims?.role } : ref === entry ? held : null),
      runMutation: vi.fn(async (ref: unknown) => ref === markReplayed ? 42 : null),
    }
    return { ctx, recordBackendEvent, result: (webhooks.api.replayWebhookDelivery as unknown as Handler)._handler(ctx, args) }
  }

  it.each([
    ['nobody signed in', null, 'unauthenticated'],
    ['a member', { ...member, authTime: Date.now() }, 'forbidden'],
    ['an admin acting as someone', { ...fresh(), impersonatedBy: 'admin-2' }, 'forbidden'],
    ['an admin signed in long ago', { ...admin, authTime: Date.now() - (RECENT_SIGN_IN_SECONDS + 60) * 1000 }, 'reauthentication_required'],
  ])('refuses %s before any provider call', async (_, claims, code) => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const { result } = replay(claims, { service: 'billing', deliveryId: 'wh_1' })
    await expect(result).rejects.toMatchObject({ data: { code } })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refuses a delivery the log does not hold, on its id', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const { result } = replay(fresh(), { service: 'email', deliveryId: 'msg_unknown' }, null)
    await expect(result).rejects.toMatchObject({ data: { code: 'invalid_input', field: 'deliveryId' } })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('asks the billing provider to redeliver the event, then stamps and records the replay', async () => {
    vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_test_token')
    const fetch = vi.fn(async () => new Response('null', { status: 202, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)
    const { ctx, recordBackendEvent, result } = replay(fresh(), { service: 'billing', deliveryId: 'wh_1' })

    await expect(result).resolves.toEqual({ replayedAt: 42 })
    const request = (fetch.mock.calls[0] as unknown as [Request])[0]
    expect(request.method).toBe('POST')
    expect(request.url).toMatch(/\/v1\/webhooks\/events\/wh_1\/redeliver$/)
    expect(request.url).toMatch(/^https:\/\/sandbox-api\.polar\.sh\//)
    expect(ctx.runMutation).toHaveBeenCalledWith(markReplayed, { service: 'billing', deliveryId: 'wh_1' })
    expect(recordBackendEvent).toHaveBeenCalledWith(ctx, { type: 'webhook.replayed', data: { service: 'billing', delivery: 'wh_1', type: 'order.paid' } })
  })

  it('asks the email provider to replay the event on this deployment\'s webhook', async () => {
    vi.stubEnv('EMAIL_API_KEY', 're_test_key')
    vi.stubEnv('CONVEX_SITE_URL', 'https://happy-otter-123.convex.site')
    const urls: string[] = []
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input)
      urls.push(url)
      const body = url.endsWith('/webhooks')
        ? { object: 'list', has_more: false, data: [
            { id: 'wh_other', endpoint: 'https://other-deployment.convex.site/email/events', events: [], status: 'enabled', created_at: '' },
            { id: 'wh_ours', endpoint: 'https://happy-otter-123.convex.site/email/events', events: [], status: 'enabled', created_at: '' },
          ] }
        : { object: 'webhook_event', id: 'msg_1' }
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetch)
    const { result } = replay(fresh(), { service: 'email', deliveryId: 'msg_1' }, { type: 'email.delivered', outcome: 'ok', receivedAt: 1 })

    await expect(result).resolves.toEqual({ replayedAt: 42 })
    expect(urls.at(-1)).toBe('https://api.resend.com/webhooks/wh_ours/events/msg_1/replay')
  })

  it('reports a provider refusal as unavailable, stamping nothing', async () => {
    vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_test_token')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'ResourceNotFound', detail: 'Not found' }), { status: 404, headers: { 'content-type': 'application/json' } })))
    const { ctx, result } = replay(fresh(), { service: 'billing', deliveryId: 'wh_1' })

    await expect(result).rejects.toMatchObject({ data: { code: 'unavailable', service: 'billing', reason: 'provider_refused' } })
    expect(ctx.runMutation).not.toHaveBeenCalled()
  })

  it('says what is missing without the provider\'s key', async () => {
    vi.stubEnv('EMAIL_API_KEY', '')
    const { result } = replay(fresh(), { service: 'email', deliveryId: 'msg_1' })
    await expect(result).rejects.toMatchObject({ data: { code: 'unavailable', service: 'email', reason: 'not_configured' } })
  })
})
