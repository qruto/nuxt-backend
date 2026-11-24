/// <reference types="vite/client" />
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, makeFunctionReference, queryGeneric } from 'convex/server'
import { defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { setupAuth } from '../../src/convex/client'

// Billing on a Convex Auth app: its auth runs inside its own functions, not
// on the routes `registerBackendRoutes` mounts, so `setupAuth({ billing })`
// is what tells billing of each workspace it makes (the free plan) and what
// holds a paid workspace's deletion. Billing is played by two spies.

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'>, auth: unknown }

interface Sent { name: string, data: Record<string, unknown> }
const sent: Sent[] = []
const email = {
  sendTemplate: vi.fn(async (_ctx: unknown, name: string, data: Record<string, unknown>) => {
    sent.push({ name, data })
    return 'email_1'
  }),
}
const paid = new Set<string>()
const billing = {
  entityCreated: vi.fn(async (_ctx: never, _entity: { kind: 'workspace' | 'user', id: string }) => {}),
  deletionRefusal: vi.fn(async (_ctx: never, entity: { kind: 'workspace' | 'user', id: string }) => (paid.has(entity.id) ? 'paid_subscription' : null)),
}

const { refreshSession, signOut, isAuthenticated, signIn, authRequest } = setupAuth(components as never, queryGeneric, { provider: 'convex-auth', email: email as never, billing })

const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './auth.js': () => Promise.resolve({ refreshSession, signOut, isAuthenticated, signIn, authRequest }),
})
const refs = {
  signIn: makeFunctionReference<'action'>('auth:signIn'),
  authRequest: makeFunctionReference<'action'>('auth:authRequest'),
}
const BROWSER = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130.0', language: 'en-US' }

interface Answer { status: number, body: unknown, cookies: Array<{ name: string, value: string, maxAge?: number }> }

beforeAll(() => {
  vi.stubEnv('SITE_URL', 'http://localhost:3000')
  vi.stubEnv('AUTH_SECRET', 'test-secret-for-convex-auth-sessions-0123456789')
  vi.stubEnv('EMAIL_API_KEY', 're_test')
  vi.stubEnv('EMAIL_FROM', 'Acme <hello@acme.dev>')
  vi.stubEnv('BACKEND_ENVIRONMENT', 'production')
})
afterAll(() => {
  vi.unstubAllEnvs()
})

let t: ReturnType<typeof testApp>
beforeEach(() => {
  t = testApp()
  sent.length = 0
  paid.clear()
  vi.clearAllMocks()
})

/** A JWT's claims, unverified. */
function claimsOf(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as Record<string, unknown>
}

async function signedIn(address: string) {
  const jar: Record<string, string> = {}
  const asked = await t.action(refs.authRequest, { method: 'POST', path: '/email-otp/send-verification-otp', body: { email: address, type: 'sign-in' }, jar, client: BROWSER }) as Answer
  for (const cookie of asked.cookies) jar[cookie.name] = cookie.value
  const otp = String([...sent].reverse().find(entry => entry.name === 'otp' && entry.data.email === address)!.data.otp)
  const result = await t.action(refs.signIn, { method: 'POST', path: '/sign-in/email-otp', body: { email: address, otp }, jar, client: BROWSER }) as { status: string, tokens: { accessToken: string } }
  expect(result.status).toBe('complete')
  const claims = claimsOf(result.tokens.accessToken) as { sub: string, iss: string }
  return t.withIdentity({ ...claims, subject: claims.sub, issuer: claims.iss, tokenIdentifier: `${claims.iss}|${claims.sub}` })
}

describe('billing on a Convex Auth app', () => {
  test('hears of the personal workspace a first sign-in makes, and of each workspace made after', async () => {
    const ada = await signedIn('ada@example.com')
    expect(billing.entityCreated).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: 'workspace' }))
    const created = await ada.action(refs.authRequest, { method: 'POST', path: '/organization/create', body: { name: 'Acme', slug: 'acme' }, client: BROWSER }) as Answer
    expect(created.status).toBe(200)
    const id = (created.body as { id: string }).id
    expect(billing.entityCreated).toHaveBeenCalledWith(expect.anything(), { kind: 'workspace', id })
  })

  test('keeps a workspace that still pays, and deletes one that does not', async () => {
    const ada = await signedIn('ada@example.com')
    const created = await ada.action(refs.authRequest, { method: 'POST', path: '/organization/create', body: { name: 'Acme', slug: 'acme' }, client: BROWSER }) as Answer
    const id = (created.body as { id: string }).id
    paid.add(id)
    const refused = await ada.action(refs.authRequest, { method: 'POST', path: '/organization/delete', body: { organizationId: id }, client: BROWSER }) as Answer
    expect(refused.status).toBeGreaterThanOrEqual(400)
    expect(JSON.stringify(refused.body)).toContain('paid_subscription')
    expect(billing.deletionRefusal).toHaveBeenCalledWith(expect.anything(), { kind: 'workspace', id })

    paid.clear()
    const deleted = await ada.action(refs.authRequest, { method: 'POST', path: '/organization/delete', body: { organizationId: id }, client: BROWSER }) as Answer
    expect(deleted.status).toBe(200)
  })
})
