import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emailPosture, senderDomain } from '../../src/convex/email-posture'

// What a deployment reads of its own email for `doctor --prod`, through the
// email provider's SDK, against its answers, mocked at the SDK's fetch: no
// live call. The key is generated per run, and nothing it reports may carry
// it.

const KEY = `re_${crypto.randomUUID().replace(/-/g, '')}`

beforeEach(() => {
  // The SDK logs the errors it answers outside production: refusals are expected here.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** A provider that answers each path from `routes` (a JSON body, a status, headers) in place of the SDK's fetch, and records what it was asked. */
function provider(routes: Record<string, { status?: number, body?: unknown, headers?: Record<string, string> } | 'throw'>) {
  const calls: Array<{ url: string, init: RequestInit | undefined }> = []
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    const path = new URL(url).pathname
    const route = routes[path]
    if (route === 'throw') throw new TypeError('fetch failed')
    if (!route) return new Response(JSON.stringify({ name: 'not_found', statusCode: 404 }), { status: 404 })
    return new Response(JSON.stringify(route.body ?? {}), { status: route.status ?? 200, headers: { 'content-type': 'application/json', ...route.headers } })
  }) as unknown as typeof fetch
  vi.stubGlobal('fetch', fetcher)
  return { fetcher, calls }
}

const VERIFIED = { data: [{ id: 'd1', name: 'mail.acme.dev', status: 'verified', capabilities: { sending: 'enabled', receiving: 'disabled' } }] }
const WEEK = { object: 'metrics', totals: { sent: 400, delivered: 390, bounced: 6, complained: 0 } }

describe('the sender\'s domain', () => {
  it.each([
    ['Acme <hello@Mail.Acme.dev>', 'mail.acme.dev'],
    ['hello@acme.dev', 'acme.dev'],
    ['"Acme, Inc." <billing+receipts@acme.co.uk>', 'acme.co.uk'],
    ['  Acme <hello@acme.dev>  ', 'acme.dev'],
  ])('reads %s as %s', (from, domain) => {
    expect(senderDomain(from)).toBe(domain)
  })

  it.each(['Acme', 'hello@', 'hello@localhost', '<>', 'a b@acme.dev'])('reads no domain from %s', (from) => {
    expect(senderDomain(from)).toBeNull()
  })
})

describe('the deployment\'s email posture', () => {
  it('reads nothing from the provider without a key', async () => {
    const { fetcher } = provider({})
    expect(await emailPosture({ from: 'Acme <hello@acme.dev>' })).toEqual({ sender: { domain: 'acme.dev' }, provider: null })
    expect(await emailPosture({ apiKey: undefined })).toEqual({ sender: 'unset', provider: null })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('reads the sender\'s domain, the week and the quota with a full-access key, and reports none of the key', async () => {
    const { calls } = provider({
      '/domains': { body: VERIFIED, headers: { 'x-resend-monthly-quota': '1200' } },
      '/emails/metrics': { body: WEEK, headers: { 'x-resend-monthly-quota': '1201' } },
    })
    const posture = await emailPosture({ from: 'Acme <hello@mail.acme.dev>', apiKey: KEY })
    expect(posture).toEqual({
      sender: { domain: 'mail.acme.dev' },
      provider: { access: 'full', domain: { status: 'verified', sending: true }, week: { sent: 400, delivered: 390, bounced: 6, complained: 0 }, quota: { monthly: 1201 } },
    })
    expect(JSON.stringify(posture)).not.toContain(KEY)
    // Reads only, to the provider's API, with the key as the bearer.
    expect(calls.map(call => new URL(call.url).origin)).toEqual(['https://api.resend.com', 'https://api.resend.com'])
    for (const call of calls) {
      expect(call.init?.method ?? 'GET').toBe('GET')
      expect(call.init?.body).toBeUndefined()
      expect(new Headers(call.init?.headers).get('authorization')).toBe(`Bearer ${KEY}`)
    }
  })

  it('tells a domain the account lacks from one it has unverified', async () => {
    provider({ '/domains': { body: { data: [{ id: 'd1', name: 'acme.dev', status: 'pending' }] } }, '/emails/metrics': { body: WEEK } })
    expect((await emailPosture({ from: 'hello@acme.dev', apiKey: KEY })).provider?.domain).toEqual({ status: 'pending', sending: true })
    // A subdomain is verified on its own: its parent does not stand in.
    provider({ '/domains': { body: VERIFIED }, '/emails/metrics': { body: WEEK } })
    expect((await emailPosture({ from: 'hello@acme.dev', apiKey: KEY })).provider?.domain).toBe('absent')
  })

  it('pages through the domains until it finds the sender\'s', async () => {
    const first = { has_more: true, data: [{ id: 'd1', name: 'one.dev', status: 'verified' }] }
    const second = { has_more: false, data: [{ id: 'd2', name: 'acme.dev', status: 'verified', capabilities: { sending: 'disabled' } }] }
    let page = 0
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      if (url.pathname === '/domains') {
        page++
        if (page === 2) expect(url.searchParams.get('after')).toBe('d1')
        return Response.json(page === 1 ? first : second)
      }
      return Response.json(WEEK)
    }))
    expect((await emailPosture({ from: 'hello@acme.dev', apiKey: KEY })).provider?.domain).toEqual({ status: 'verified', sending: false })
  })

  it('tells a key that may only send from one the provider refuses', async () => {
    const sending = provider({ '/domains': { status: 401, body: { name: 'restricted_api_key', statusCode: 401, message: 'This API key is restricted to only send emails.' } } })
    expect((await emailPosture({ from: 'hello@acme.dev', apiKey: KEY })).provider).toEqual({ access: 'sending', reason: 'restricted_api_key' })
    // Nothing else is asked once the key cannot read.
    expect(sending.calls).toHaveLength(1)
    provider({ '/domains': { status: 400, body: { name: 'validation_error', statusCode: 400, message: 'API key is invalid' } } })
    expect((await emailPosture({ from: 'hello@acme.dev', apiKey: KEY })).provider).toEqual({ access: 'refused', reason: 'validation_error' })
    provider({ '/domains': { status: 403, body: { name: 'restricted_api_key', statusCode: 403, message: 'API key is not active' } } })
    expect((await emailPosture({ from: 'hello@acme.dev', apiKey: KEY })).provider).toEqual({ access: 'refused', reason: 'restricted_api_key' })
  })

  it('calls a provider that does not answer unreachable, and leaves out a read that failed', async () => {
    provider({ '/domains': 'throw' })
    expect((await emailPosture({ from: 'hello@acme.dev', apiKey: KEY })).provider).toEqual({ access: 'unreachable' })
    provider({ '/domains': { status: 429, body: { name: 'rate_limit_exceeded', statusCode: 429 } } })
    expect((await emailPosture({ from: 'hello@acme.dev', apiKey: KEY })).provider).toEqual({ access: 'unreachable', reason: 'rate_limit_exceeded' })
    provider({ '/domains': { body: VERIFIED }, '/emails/metrics': 'throw' })
    expect((await emailPosture({ from: 'hello@mail.acme.dev', apiKey: KEY })).provider).toEqual({ access: 'full', domain: { status: 'verified', sending: true } })
  })

  it('reads through a client given in place of the SDK, never rejecting when it does', async () => {
    const client = {
      domains: { list: vi.fn(async () => { throw new Error('boom') }) },
      emails: { metrics: vi.fn() },
    }
    expect((await emailPosture({ from: 'hello@acme.dev', apiKey: KEY }, client as never)).provider).toEqual({ access: 'unreachable' })
    expect(client.emails.metrics).not.toHaveBeenCalled()
  })

  it('reads the daily quota a plan with one reports', async () => {
    provider({
      '/domains': { body: VERIFIED, headers: { 'x-resend-daily-quota': '42', 'x-resend-monthly-quota': '880' } },
      '/emails/metrics': { body: WEEK },
    })
    expect((await emailPosture({ from: 'hello@mail.acme.dev', apiKey: KEY })).provider?.quota).toEqual({ daily: 42, monthly: 880 })
  })

  it('still reads the provider for a sender that holds no address', async () => {
    provider({ '/domains': { body: VERIFIED }, '/emails/metrics': { body: WEEK } })
    const posture = await emailPosture({ from: 'Acme', apiKey: KEY })
    expect(posture.sender).toBe('malformed')
    expect(posture.provider).toMatchObject({ access: 'full', week: WEEK.totals })
    expect(posture.provider).not.toHaveProperty('domain')
  })
})
