/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { convexTest } from 'convex-test'
import resendComponent from '@convex-dev/resend/test'
import component from '../../src/convex/test'
import schema from '../../src/convex/components/backend/schema'
import { api, internal } from '../../src/convex/components/backend/_generated/api'
import { resolveCaps } from '../../src/convex/email-preferences'
import { lifecycleSettings } from '../../src/convex/integrations/email-lifecycle'

// The lifecycle flows' runs, as the backend component keeps them: a
// sign-up, an event of the app's own and a billing event start and stop
// each person's run; a step due later waits for the component's sweep, and
// a lifecycle or marketing step passes the person's topic, the sunset rule,
// the weekly cap and the quiet hours as they stand when it is due. Each
// email that goes is one event to the email provider, whose automation
// sends the flow's template. The component runs as the root app, as in
// maintenance.test.ts.

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const TOPICS = {
  tips: { name: 'Tips', description: 'How to get more out of Panels.', subscribedByDefault: true },
  offers: { name: 'Offers', description: 'Discounts and plan news.', subscribedByDefault: false },
}
const FLOWS = lifecycleSettings({
  welcome: true,
  activationNudge: { topic: 'tips' },
  firstResult: { event: 'app.strip_ready' },
  creditsLow: true,
  trialEnding: true,
  checkoutAbandoned: { topic: 'offers' },
  winBack: { topic: 'offers', days: [7, 30] },
  stalled: { topic: 'tips' },
  annualSwitch: { topic: 'offers' },
}, TOPICS)

let t: ReturnType<typeof convexTest>
let sent: string[]
let payloads: Array<Record<string, unknown> | undefined>

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'], now: Date.UTC(2026, 9, 27, 12) })
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubEnv('EMAIL_API_KEY', 're_test_key')
  sent = []
  payloads = []
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input))
    const body = init?.body ? JSON.parse(String(init.body)) as { event?: string, email?: string, payload?: Record<string, unknown> } : {}
    if (url.pathname === '/events/send') {
      sent.push(`${body.event} → ${body.email}`)
      payloads.push(body.payload)
    }
    return new Response(JSON.stringify({ object: 'event', id: 'x' }), { status: 200, headers: { 'content-type': 'application/json' } })
  }))
  t = convexTest(schema, component.modules)
  resendComponent.register(t, 'resend')
  await t.mutation(api.lifecycle.configure, { flows: FLOWS, caps: resolveCaps({ perWeek: 2 }) })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** An account, as Better Auth writes it, at a test address. */
async function account(label: string, createdAt = Date.now()): Promise<{ userId: string, email: string }> {
  const email = `delivered+${label}@resend.dev`
  const userId = await t.run(ctx => ctx.db.insert('user', { name: label, email, emailVerified: true, createdAt, updatedAt: createdAt }))
  return { userId, email }
}

/** Let the time pass (and a second more: each function call moves the test clock on a little), then run the component's sweep and every job it schedules. */
async function after(ms: number) {
  vi.advanceTimersByTime(ms + 1000)
  await t.mutation(internal.lifecycle.sweep, {})
  await t.finishAllScheduledFunctions(() => vi.runAllTimers())
}

const signUp = async (who: { userId: string, email: string }) => {
  const result = await t.mutation(api.lifecycle.signal, { type: 'signed-up', userId: who.userId, email: who.email })
  await t.finishAllScheduledFunctions(() => vi.runAllTimers())
  return result
}

const runsOf = (userId: string) => t.run(async ctx => (await ctx.db.query('lifecycleRuns').collect()).filter(run => run.userId === userId).map(run => `${run.flow}#${run.step}:${run.state}${run.reason ? `(${run.reason})` : ''}`))

/** Join a topic on purpose, as the profile does. */
const join = (who: { userId: string, email: string }, topic: string) => t.mutation(api.preferences.choose, { email: who.email, userId: who.userId, topic: { key: topic, subscribedByDefault: false, doubleOptIn: false }, subscribe: true, source: 'profile' })

describe('the sign-up flows', () => {
  test('send the welcome at once, and the nudge a day later to someone who made nothing', async () => {
    const ada = await account('ada')
    expect(await signUp(ada)).toEqual({ welcome: true })
    expect(sent).toEqual([`lifecycle.welcome → ${ada.email}`])
    await after(DAY)
    expect(sent).toEqual([`lifecycle.welcome → ${ada.email}`, `lifecycle.activation_nudge → ${ada.email}`])
    // A second sign-up signal (an after-hook run again) starts nothing twice.
    await signUp(ada)
    await after(DAY)
    expect(sent).toHaveLength(2)
  })

  test('stop the nudge once the app tracks that the person created something, which starts the first result once', async () => {
    const ada = await account('ada')
    await signUp(ada)
    await t.mutation(api.lifecycle.track, { event: 'app.strip_ready', email: ada.email, userId: ada.userId })
    await t.mutation(api.lifecycle.track, { event: 'app.strip_ready', email: ada.email, userId: ada.userId })
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    await after(DAY)
    expect(sent.filter(line => line.startsWith('lifecycle.'))).toEqual([`lifecycle.welcome → ${ada.email}`, `lifecycle.first_result → ${ada.email}`])
    // The app's own event reaches the provider too, for its own automations.
    expect(sent.filter(line => line.startsWith('app.strip_ready'))).toHaveLength(2)
    expect(await runsOf(ada.userId)).toContain('activationNudge#0:stopped(app.strip_ready)')
  })

  test('skip the nudge for someone who left its topic, and say why', async () => {
    const ada = await account('ada')
    await signUp(ada)
    await t.mutation(api.preferences.choose, { email: ada.email, userId: ada.userId, topic: { key: 'tips', subscribedByDefault: true, doubleOptIn: false }, subscribe: false, source: 'profile' })
    await after(DAY)
    expect(sent).toEqual([`lifecycle.welcome → ${ada.email}`])
    expect(await runsOf(ada.userId)).toContain('activationNudge#0:skipped(unsubscribed)')
  })

  test('write to an account\'s address as it is when the email is due, and to an erased account never', async () => {
    const ada = await account('ada')
    const bob = await account('bob')
    await signUp(ada)
    await signUp(bob)
    await t.run(async (ctx) => {
      await ctx.db.patch(ada.userId as never, { email: 'delivered+ada-new@resend.dev' })
      await ctx.db.delete(bob.userId as never)
    })
    await after(DAY)
    expect(sent).toContain('lifecycle.activation_nudge → delivered+ada-new@resend.dev')
    expect(await runsOf(bob.userId)).toContain('activationNudge#0:stopped(no_account)')
  })
})

describe('a flow a billing event starts', () => {
  test('goes only to someone who joined its topic on purpose, 7 and 30 days after the plan ended, and stops when they subscribe again', async () => {
    const quiet = await account('quiet')
    const keen = await account('keen')
    await join(keen, 'offers')
    for (const who of [quiet, keen]) await t.mutation(api.lifecycle.signal, { type: 'billing.subscription_revoked', entityId: who.userId })
    await after(7 * DAY)
    expect(sent).toEqual([`lifecycle.win_back → ${keen.email}`])
    expect(await runsOf(quiet.userId)).toContain('winBack#0:skipped(unsubscribed)')
    await t.mutation(api.lifecycle.signal, { type: 'billing.subscription_created', entityId: keen.userId, data: { productId: 'p', interval: 'month' } })
    await after(30 * DAY)
    expect(sent).toEqual([`lifecycle.win_back → ${keen.email}`])
    expect(await runsOf(keen.userId)).toContain('winBack#1:stopped(billing.subscription_created)')
  })

  test('a win-back carries the cancellation reason to its automation', async () => {
    const keen = await account('keen')
    await join(keen, 'offers')
    await t.run(ctx => ctx.db.insert('auditEvents', { type: 'billing.subscription_canceled', entityId: keen.userId, data: { productId: 'p', reason: 'too_expensive' }, at: Date.now() }))
    await t.mutation(api.lifecycle.signal, { type: 'billing.subscription_revoked', entityId: keen.userId })
    await after(7 * DAY)
    expect(sent).toEqual([`lifecycle.win_back → ${keen.email}`])
    expect(payloads).toEqual([{ reason: 'too_expensive' }])
  })

  test('an abandoned checkout writes once, a day later, to someone who joined its topic, and stops when they pay', async () => {
    const keen = await account('keen')
    const payer = await account('payer')
    for (const who of [keen, payer]) {
      await join(who, 'offers')
      await t.mutation(api.lifecycle.signal, { type: 'billing.checkout_abandoned', entityId: who.userId, data: { productId: 'p' } })
    }
    // The provider's own name for an expired checkout starts nothing: the billing lifecycle records it as abandoned.
    await t.mutation(api.lifecycle.signal, { type: 'billing.checkout_expired', entityId: payer.userId, data: { productId: 'p' } })
    await t.mutation(api.lifecycle.signal, { type: 'billing.order_paid', entityId: payer.userId, data: { amount: 900, currency: 'usd' } })
    await after(DAY)
    expect(sent).toEqual([`lifecycle.checkout_abandoned → ${keen.email}`])
    expect(await runsOf(payer.userId)).toContain('checkoutAbandoned#0:stopped(billing.order_paid)')
  })

  test('a topic on by default does not count as joining it', async () => {
    const ada = await account('ada')
    // A billing-started flow under the tips topic, which everyone is in by default.
    await t.mutation(api.lifecycle.configure, { flows: lifecycleSettings({ winBack: { topic: 'tips' } }, TOPICS), caps: resolveCaps() })
    await t.mutation(api.lifecycle.signal, { type: 'billing.subscription_revoked', entityId: ada.userId })
    await after(7 * DAY)
    expect(sent).toEqual([])
  })

  test('warns of a trial of 14 days or more 7 days before it ends, and of a shorter one never', async () => {
    const long = await account('long')
    const short = await account('short')
    await t.mutation(api.lifecycle.signal, { type: 'billing.subscription_created', entityId: long.userId, data: { productId: 'p', trialEndsAt: Date.now() + 14 * DAY, trialDays: 14 } })
    await t.mutation(api.lifecycle.signal, { type: 'billing.subscription_created', entityId: short.userId, data: { productId: 'p', trialEndsAt: Date.now() + 7 * DAY, trialDays: 7 } })
    await after(6 * DAY)
    expect(sent).toEqual([])
    await after(DAY)
    expect(sent).toEqual([`lifecycle.trial_ending → ${long.email}`])
  })

  test('writes to a workspace\'s owners, transactional email going whatever the topic', async () => {
    const owner = await account('owner')
    const member = await account('member')
    const workspaceId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('organization', { name: 'Acme', slug: 'acme', createdAt: Date.now() })
      await ctx.db.insert('member', { organizationId: id, userId: owner.userId, role: 'owner', createdAt: Date.now() })
      await ctx.db.insert('member', { organizationId: id, userId: member.userId, role: 'member', createdAt: Date.now() })
      return id
    })
    await t.mutation(api.lifecycle.signal, { type: 'billing.credits_low', entityId: workspaceId, data: { balance: 3, threshold: 10 } })
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(sent).toEqual([`lifecycle.credits_low → ${owner.email}`])
  })
})

describe('the sending rules', () => {
  test('a step over the weekly cap is skipped, not queued', async () => {
    const ada = await account('ada', Date.now() - 30 * DAY)
    await join(ada, 'offers')
    await t.mutation(api.lifecycle.signal, { type: 'billing.subscription_revoked', entityId: ada.userId })
    vi.advanceTimersByTime(7 * DAY - HOUR)
    // Two emails under a topic in the last 7 days: the cap of 2 is reached.
    for (let sent = 0; sent < 2; sent++) await t.mutation(api.preferences.gate, { email: ada.email, userId: ada.userId, caps: resolveCaps({ perWeek: 2 }) })
    await after(HOUR)
    expect(sent).toEqual([])
    expect(await runsOf(ada.userId)).toContain('winBack#0:skipped(capped)')
  })

  test('the quiet hours hold a step to their end, counted once', async () => {
    await t.mutation(api.lifecycle.configure, { flows: FLOWS, caps: resolveCaps({ perWeek: 1, quietHours: { start: '21:00', end: '08:00' } }) })
    vi.setSystemTime(Date.UTC(2026, 9, 27, 22))
    const ada = await account('ada')
    await signUp(ada)
    // The nudge comes due at 22:00 the next day, in the quiet hours of a person with no time zone known (UTC).
    await after(DAY)
    expect(sent).toEqual([`lifecycle.welcome → ${ada.email}`])
    expect(await runsOf(ada.userId)).toContain('activationNudge#0:held')
    await after(10 * HOUR)
    expect(sent).toEqual([`lifecycle.welcome → ${ada.email}`, `lifecycle.activation_nudge → ${ada.email}`])
  })

  test('a held step asks the topic again as it goes', async () => {
    await t.mutation(api.lifecycle.configure, { flows: FLOWS, caps: resolveCaps({ quietHours: { start: '21:00', end: '08:00' } }) })
    vi.setSystemTime(Date.UTC(2026, 9, 27, 22))
    const ada = await account('ada')
    await signUp(ada)
    await after(DAY)
    expect(await runsOf(ada.userId)).toContain('activationNudge#0:held')
    // The person leaves the topic while the step waits for the quiet hours' end.
    await t.mutation(api.preferences.choose, { email: ada.email, userId: ada.userId, topic: { key: 'tips', subscribedByDefault: true, doubleOptIn: false }, subscribe: false, source: 'profile' })
    await after(10 * HOUR)
    expect(sent).toEqual([`lifecycle.welcome → ${ada.email}`])
    expect(await runsOf(ada.userId)).toContain('activationNudge#0:skipped(unsubscribed)')
  })

  test('stalled writes once an account that came back has been away 14 days', async () => {
    const ada = await account('ada', Date.now() - 3 * DAY)
    await t.mutation(api.preferences.seen, { userId: ada.userId, email: ada.email })
    await after(13 * DAY)
    expect(sent).toEqual([])
    await after(DAY)
    expect(sent).toEqual([`lifecycle.stalled → ${ada.email}`])
  })
})

describe('the event to the provider', () => {
  /** The provider answers each `/events/send` with the next status, then 200. */
  function answering(...statuses: number[]) {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) as { event?: string } : {}
      if (new URL(String(input instanceof Request ? input.url : input)).pathname === '/events/send') calls.push(String(body.event))
      const status = statuses.shift() ?? 200
      const answer = status === 200 ? { object: 'event', id: 'x' } : { name: status === 429 ? 'rate_limit_exceeded' : 'application_error', message: 'no', statusCode: status }
      return new Response(JSON.stringify(answer), { status, headers: { 'content-type': 'application/json' } })
    }))
    return calls
  }

  test('is not sent again after a failure that may have started its automation', async () => {
    const calls = answering(500)
    await signUp(await account('ada'))
    expect(calls).toEqual(['lifecycle.welcome'])
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('email.event_unsent'), expect.objectContaining({ statusCode: 500 }))
  })

  test('waits out a rate limit, and goes once', async () => {
    const calls = answering(429)
    await signUp(await account('ada'))
    expect(calls).toEqual(['lifecycle.welcome', 'lifecycle.welcome'])
    expect(vi.mocked(console.warn).mock.calls.flat().join(' ')).not.toContain('email.event_unsent')
  })
})

describe('the flows\' settings', () => {
  test('a flow turned off starts nothing, and its waiting runs stop when they come due', async () => {
    const ada = await account('ada')
    await signUp(ada)
    await t.mutation(api.lifecycle.configure, { flows: [], caps: resolveCaps() })
    await after(DAY)
    expect(sent).toEqual([`lifecycle.welcome → ${ada.email}`])
    expect(await runsOf(ada.userId)).toContain('activationNudge#0:stopped(flow_off)')
    expect(await signUp(await account('bob'))).toEqual({ welcome: false })
  })

  test('an account\'s erasure removes its runs', async () => {
    const ada = await account('ada')
    await signUp(ada)
    const { eraseLifecycle } = await import('../../src/convex/components/backend/lifecycle')
    await t.run(ctx => eraseLifecycle(ctx as never, ada.userId, 100))
    expect(await runsOf(ada.userId)).toEqual([])
  })
})
