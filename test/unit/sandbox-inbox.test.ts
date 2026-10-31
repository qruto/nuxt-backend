import { describe, expect, it, vi } from 'vitest'
import { createSandboxInboxCache, providerTime, readSandboxMail, SANDBOX_INBOX_BODIES, SANDBOX_INBOX_CACHE_MS, SANDBOX_INBOX_LIMIT, SandboxInboxError } from '../../src/convex/sandbox-inbox'

// The dev inbox reads the mail a test address received from the email
// provider's own log of sent email: one list of what was sent, and a
// retrieval of the newest for its body. Nothing here reaches the provider.

const NOW = Date.parse('2026-04-03T22:30:00.000Z')
const ADDRESS = 'delivered+demo@resend.dev'

interface Sent { id: string, to: string[] | null, subject?: string | null, at: string, text?: string, html?: string }

/** A `fetch` that answers the provider's list (in pages of `pageSize`, newest first) and retrieval. */
function provider(sent: Sent[], { pageSize = 100, status = 200 }: { pageSize?: number, status?: number } = {}) {
  const calls: string[] = []
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    calls.push(`${url.pathname}${url.search}`)
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer re_key')
    if (status !== 200) return new Response('{}', { status })
    const one = /^\/emails\/(.+)$/.exec(url.pathname)
    if (one) {
      const email = sent.find(entry => entry.id === one[1])!
      return Response.json({ id: email.id, text: email.text ?? null, html: email.html ?? null })
    }
    const after = url.searchParams.get('after')
    const start = after ? sent.findIndex(entry => entry.id === after) + 1 : 0
    const page = sent.slice(start, start + Math.min(pageSize, Number(url.searchParams.get('limit'))))
    return Response.json({ object: 'list', has_more: start + page.length < sent.length, data: page.map(email => ({ id: email.id, to: email.to, from: 'App <onboarding@resend.dev>', subject: email.subject ?? '', created_at: email.at })) })
  }) as unknown as typeof fetch
  return { fetcher, calls }
}

const read = (fetcher: typeof fetch) => readSandboxMail({ apiKey: 're_key', address: ADDRESS, now: NOW, fetcher })

describe('providerTime', () => {
  it('reads the provider\'s timestamp, and an ISO one', () => {
    expect(providerTime('2026-04-03 22:13:42.674981+00')).toBe(Date.parse('2026-04-03T22:13:42.674Z'))
    expect(providerTime('2026-04-03T22:13:42.000Z')).toBe(Date.parse('2026-04-03T22:13:42Z'))
    expect(providerTime('2026-04-03 22:13:42+02')).toBe(Date.parse('2026-04-03T20:13:42Z'))
    expect(providerTime('not a time')).toBeNaN()
  })
})

describe('readSandboxMail', () => {
  it('lists the address\'s mail from the last hour, newest first, with the body of the newest only', async () => {
    const sent: Sent[] = Array.from({ length: 6 }, (_, index) => ({ id: `e${index}`, to: [ADDRESS], subject: `S${index}`, at: `2026-04-03 22:${String(29 - index).padStart(2, '0')}:00+00`, text: `code 00000${index}` }))
    const { fetcher, calls } = provider(sent)

    const messages = await read(fetcher)

    expect(messages.map(message => message.subject)).toEqual(['S0', 'S1', 'S2', 'S3', 'S4', 'S5'])
    expect(messages.map(message => message.text)).toEqual(['code 000000', undefined, undefined, undefined, undefined, undefined])
    expect(messages[0]).toMatchObject({ from: 'App <onboarding@resend.dev>', receivedAt: Date.parse('2026-04-03T22:29:00Z') })
    // One list and one retrieval: two requests a read, nothing more.
    expect(calls).toEqual(['/emails?limit=100', '/emails/e0'])
    expect(SANDBOX_INBOX_BODIES).toBe(1)
  })

  it('matches the address however the provider wrote it, and leaves other recipients out', async () => {
    const { fetcher } = provider([
      { id: 'a', to: ['Demo <Delivered+Demo@Resend.dev>'], subject: 'Named', at: '2026-04-03 22:20:00+00', text: 'x' },
      { id: 'b', to: ['delivered+other@resend.dev'], subject: 'Other', at: '2026-04-03 22:19:00+00', text: 'y' },
      { id: 'c', to: null, subject: 'Nobody', at: '2026-04-03 22:18:00+00' },
      { id: 'd', to: [ADDRESS, 'cc@example.com'], subject: 'Both', at: '2026-04-03 22:17:00+00', text: 'z' },
    ])
    expect((await read(fetcher)).map(message => message.subject)).toEqual(['Named', 'Both'])
  })

  it('leaves out what was sent before the hour', async () => {
    const { fetcher } = provider([
      { id: 'new', to: [ADDRESS], subject: 'Now', at: '2026-04-03 22:10:00+00', text: 'x' },
      { id: 'old', to: [ADDRESS], subject: 'Earlier', at: '2026-04-03 21:10:00+00', text: 'y' },
    ])
    expect((await read(fetcher)).map(message => message.subject)).toEqual(['Now'])
  })

  it('reads one list of the newest hundred and never a further page, even when the provider has more', async () => {
    const others: Sent[] = Array.from({ length: 5 }, (_, index) => ({ id: `o${index}`, to: ['someone@example.com'], at: '2026-04-03 22:25:00+00' }))
    const { fetcher, calls } = provider([...others, { id: 'mine', to: [ADDRESS], subject: 'Mine', at: '2026-04-03 22:24:00+00', text: 'x' }], { pageSize: 2 })
    // The provider answers a page of two with has_more: the inbox does not follow it.
    expect(await read(fetcher)).toEqual([])
    expect(calls).toEqual(['/emails?limit=100'])
  })

  it('returns at most ten messages', async () => {
    const sent: Sent[] = Array.from({ length: 14 }, (_, index) => ({ id: `e${index}`, to: [ADDRESS], subject: `S${index}`, at: '2026-04-03 22:20:00+00', text: 'x' }))
    expect(await read(provider(sent).fetcher)).toHaveLength(SANDBOX_INBOX_LIMIT)
  })

  it('says why the provider refused: a key restricted to sending, a rate limit', async () => {
    await expect(read(provider([], { status: 401 }).fetcher)).rejects.toThrow(/answered 401.*restricted to sending/)
    await expect(read(provider([], { status: 429 }).fetcher)).rejects.toThrow(/rate limit/)
    await expect(read(provider([], { status: 500 }).fetcher)).rejects.toBeInstanceOf(SandboxInboxError)
    const offline = (async () => Promise.reject(new Error('offline'))) as unknown as typeof fetch
    await expect(read(offline)).rejects.toThrow(/could not be reached: offline/)
  })
})

describe('the cache', () => {
  it('answers reads of an address within its time from the one before, without asking the provider', async () => {
    let clock = 1000
    const cache = createSandboxInboxCache({ clock: () => clock })
    const { fetcher, calls } = provider([{ id: 'a', to: [ADDRESS], subject: 'One', at: '2026-04-03 22:20:00+00', text: 'x' }])
    const cached = () => readSandboxMail({ apiKey: 're_key', address: ADDRESS, now: NOW, fetcher, cache })

    const first = await cached()
    clock += SANDBOX_INBOX_CACHE_MS - 1
    expect(await cached()).toEqual(first)
    expect(calls).toEqual(['/emails?limit=100', '/emails/a'])

    clock += 1
    await cached()
    expect(calls).toEqual(['/emails?limit=100', '/emails/a', '/emails?limit=100', '/emails/a'])
  })

  it('shares one read between callers that arrive while it is under way', async () => {
    const cache = createSandboxInboxCache()
    const { fetcher, calls } = provider([{ id: 'a', to: [ADDRESS], subject: 'One', at: '2026-04-03 22:20:00+00', text: 'x' }])
    const reads = await Promise.all(Array.from({ length: 5 }, () => readSandboxMail({ apiKey: 're_key', address: ADDRESS.toUpperCase(), now: NOW, fetcher, cache })))
    expect(reads.every(answer => answer[0]?.subject === 'One')).toBe(true)
    expect(calls).toEqual(['/emails?limit=100', '/emails/a'])
  })

  it('answers each address from one shared list', async () => {
    const cache = createSandboxInboxCache()
    const { fetcher, calls } = provider([
      { id: 'a', to: [ADDRESS], subject: 'Mine', at: '2026-04-03 22:20:00+00', text: 'x' },
      { id: 'b', to: ['delivered+other@resend.dev'], subject: 'Theirs', at: '2026-04-03 22:19:00+00', text: 'y' },
    ])
    const mine = await readSandboxMail({ apiKey: 're_key', address: ADDRESS, now: NOW, fetcher, cache })
    const theirs = await readSandboxMail({ apiKey: 're_key', address: 'delivered+other@resend.dev', now: NOW, fetcher, cache })
    expect([mine[0]?.subject, theirs[0]?.subject]).toEqual(['Mine', 'Theirs'])
    expect(calls.filter(call => call.startsWith('/emails?'))).toHaveLength(1)
  })

  it('costs the provider nothing more for labels nobody sent to', async () => {
    const cache = createSandboxInboxCache()
    const { fetcher, calls } = provider([{ id: 'a', to: [ADDRESS], subject: 'One', at: '2026-04-03 22:20:00+00', text: 'x' }])
    for (let index = 0; index < 50; index++) {
      expect(await readSandboxMail({ apiKey: 're_key', address: `delivered+${index}@resend.dev`, now: NOW, fetcher, cache })).toEqual([])
    }
    expect(calls).toEqual(['/emails?limit=100'])
  })

  it('shares a refusal too, so a rate-limited read is not asked again at once', async () => {
    let clock = 0
    const cache = createSandboxInboxCache({ clock: () => clock })
    const { fetcher, calls } = provider([], { status: 429 })
    const cached = () => readSandboxMail({ apiKey: 're_key', address: ADDRESS, now: NOW, fetcher, cache })
    await expect(cached()).rejects.toThrow(/rate limit/)
    await expect(cached()).rejects.toThrow(/rate limit/)
    expect(calls).toEqual(['/emails?limit=100'])
    clock += SANDBOX_INBOX_CACHE_MS
    await expect(cached()).rejects.toThrow(/rate limit/)
    expect(calls).toHaveLength(2)
  })

  it('drops entries past their time when it fills up', async () => {
    let clock = 0
    const cache = createSandboxInboxCache({ clock: () => clock })
    for (let index = 0; index < 250; index++) {
      clock += SANDBOX_INBOX_CACHE_MS
      await cache.read(`address-${index}`, async () => [])
    }
    // Every earlier entry had expired by the time the next was added: only the last stays.
    const load = vi.fn(async () => [])
    await cache.read('address-249', load)
    expect(load).not.toHaveBeenCalled()
    await cache.read('address-0', load)
    expect(load).toHaveBeenCalledTimes(1)
  })
})
