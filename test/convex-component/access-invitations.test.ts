/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, makeFunctionReference, mutationGeneric } from 'convex/server'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { getBackendError } from '../../src/convex/errors'
import { setupAudit } from '../../src/convex/integrations/audit'
import { setupEmail } from '../../src/convex/integrations/email'
import { type AdmitResult, setupAccess } from '../../src/convex/integrations/launch'

// "Email them" on the Access tab: an invitation by address, emailed. The
// email goes from an action of its own, by the invitations' ids, in the
// layout with a one-click unsubscribe, about a hundred an hour, however
// many waves an administrator sends.

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const audit = setupAudit(components as never)
const email = setupEmail(components as never, { brand: { name: 'Panels' } })
/** What reached the sending rules, and what was handed to the send: the message and when it goes. */
const sent: Array<{ to: string, subject: string, html?: string, text?: string, headers?: Array<{ name: string, value: string }>, deliverAt?: number }> = []
const access = setupAccess(components as never, {
  audit,
  email: {
    compose: email.compose,
    preferences: {
      prepare: (async (ctx, message, topic, words, options) => {
        const result = await email.preferences.prepare(ctx, message, topic, words, options)
        if (result) sent.push(result as never)
        return result
      }) as typeof email.preferences.prepare,
    },
  },
})
const silent = setupAccess(components as never, { audit })
/** The same, on an app whose nuxt.config moved the sign-in and privacy pages. */
const moved = setupAccess(components as never, { audit, email: { compose: email.compose, preferences: { prepare: (async (ctx, message, topic, words, options) => {
  const result = await email.preferences.prepare(ctx, message, topic, words, options)
  if (result) sent.push(result as never)
  return result
}) as typeof email.preferences.prepare } }, paths: { login: '/sign-in', privacy: '/policies/privacy' } })

/** When the next invitation email may go, as the pace books it. */
const nextSlot = mutationGeneric({ args: {}, handler: async ctx => (await ctx.runMutation(components.backend.access.bookInvitationEmails, { count: 0 })).start })

const app = (instance: typeof access) => defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './access.js': () => Promise.resolve({ ...instance.api, nextSlot }),
  './audit.js': () => Promise.resolve(audit.api),
})

const nextSlotRef = makeFunctionReference<'mutation', Record<string, never>, number>('access:nextSlot')
const admitEmails = makeFunctionReference<'mutation', { emails: string[], label?: string, email?: boolean }, AdmitResult>('access:admitEmails')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'], now: Date.UTC(2026, 9, 28, 12) })
  vi.stubEnv('AUTH_SECRET', 'a-test-secret-that-is-long-enough-1234')
  vi.stubEnv('SITE_URL', 'https://app.example.com')
  vi.stubEnv('CONVEX_SITE_URL', 'https://example.convex.site')
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  sent.length = 0
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('"Email them"', () => {
  test('emails each invited address a plain invitation with a one-click unsubscribe and a link that names nobody', async () => {
    const t = app(access)()
    const admin = await asUser(t, { role: 'admin' })
    const result = await admin.mutation(admitEmails, { emails: ['ada@resend.dev', 'grace@resend.dev'], label: 'beta-1', email: true })
    expect(result.admitted).toEqual(['ada@resend.dev', 'grace@resend.dev'])
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(sent.map(message => [message.to, message.subject])).toEqual([['ada@resend.dev', 'You\'re invited to Panels'], ['grace@resend.dev', 'You\'re invited to Panels']])
    const [first] = sent
    expect(first!.html).toContain('https://app.example.com/login"')
    expect(first!.html).toContain('data: https://app.example.com/legal/privacy<')
    expect(first!.html).not.toMatch(/login\?|ada%40|token=.*ada/)
    // The footer's link reads as one, in the HTML and the text part.
    expect(first!.html).toMatch(/<a href="[^"]*unsubscribe[^"]*token=[^"]+"[^>]*>Unsubscribe<\/a>/)
    expect(first!.text).toMatch(/\nUnsubscribe: https:\/\/\S+token=/)
    expect(first!.headers).toEqual(expect.arrayContaining([{ name: 'List-Unsubscribe-Post', value: 'List-Unsubscribe=One-Click' }, expect.objectContaining({ name: 'List-Unsubscribe' })]))
  })

  test('links the sign-in and privacy pages where nuxt.config put them', async () => {
    const t = app(moved)()
    const admin = await asUser(t, { role: 'admin' })
    await admin.mutation(admitEmails, { emails: ['ada@resend.dev'], email: true })
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(sent[0]!.html).toContain('https://app.example.com/sign-in"')
    expect(sent[0]!.html).toContain('data: https://app.example.com/policies/privacy<')
  })

  test('paces every wave about a hundred an hour, one after another', async () => {
    const t = app(access)()
    const admin = await asUser(t, { role: 'admin' })
    const start = Date.now()
    await admin.mutation(admitEmails, { emails: ['a@resend.dev', 'b@resend.dev'], email: true })
    await admin.mutation(admitEmails, { emails: ['c@resend.dev'], email: true })
    await t.finishInProgressScheduledFunctions()
    await vi.advanceTimersByTimeAsync(1)
    await t.finishInProgressScheduledFunctions()
    expect(sent).toHaveLength(3)
    // Three emails booked 36 seconds apart: the next one may go no sooner than the third's slot plus one gap.
    expect(await t.mutation(nextSlotRef, {})).toBeGreaterThanOrEqual(start + 3 * 36_000)
  })

  test('sends nothing without asking, and refuses to email without the email instance', async () => {
    const t = app(silent)()
    const admin = await asUser(t, { role: 'admin' })
    await admin.mutation(admitEmails, { emails: ['ada@resend.dev'] })
    const refused = await admin.mutation(admitEmails, { emails: ['grace@resend.dev'], email: true }).catch(error => error)
    expect(getBackendError(refused)).toMatchObject({ code: 'invalid_input', data: { field: 'email' } })
    expect(sent).toEqual([])
  })
})
