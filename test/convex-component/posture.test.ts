/// <reference types="vite/client" />

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { convexTest } from 'convex-test'
import component from '../../src/convex/test'
import schema from '../../src/convex/components/backend/schema'
import { internal } from '../../src/convex/components/backend/_generated/api'

// `posture:email`, the backend component's report to `doctor --prod`: it
// reads its own forwarded email env, asks the email provider with its own
// key, and answers with derived facts only. The provider is mocked; the key
// is generated per run and must not come back.

let t: ReturnType<typeof convexTest>
const KEY = `re_${crypto.randomUUID().replace(/-/g, '')}`

beforeEach(() => {
  t = convexTest(schema, component.modules)
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.EMAIL_API_KEY
  delete process.env.EMAIL_FROM
})

describe('posture:email', () => {
  test('reports the sender\'s domain and what the provider says of it, never the key or the address', async () => {
    process.env.EMAIL_API_KEY = KEY
    process.env.EMAIL_FROM = 'Acme <hello@acme.dev>'
    const asked: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      asked.push(`${url.origin}${url.pathname} ${new Headers(init?.headers).get('authorization') === `Bearer ${KEY}`}`)
      if (url.pathname === '/domains') return Response.json({ data: [{ id: 'd1', name: 'acme.dev', status: 'verified' }] }, { headers: { 'x-resend-monthly-quota': '77' } })
      return Response.json({ totals: { sent: 10, delivered: 10, bounced: 0, complained: 0 } })
    }))
    const posture = await t.action(internal.posture.email, {})
    expect(posture).toEqual({
      sender: { domain: 'acme.dev' },
      provider: { access: 'full', domain: { status: 'verified', sending: true }, week: { sent: 10, delivered: 10, bounced: 0, complained: 0 }, quota: { monthly: 77 } },
    })
    expect(asked).toEqual(['https://api.resend.com/domains true', 'https://api.resend.com/emails/metrics true'])
    const reported = JSON.stringify(posture)
    expect(reported).not.toContain(KEY)
    expect(reported).not.toContain('hello@')
  })

  test('asks the provider nothing without a key', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    expect(await t.action(internal.posture.email, {})).toEqual({ sender: 'unset', provider: null })
    expect(fetcher).not.toHaveBeenCalled()
  })
})
