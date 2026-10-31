/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, defineTable, makeFunctionReference, mutationGeneric } from 'convex/server'
import { v } from 'convex/values'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { getBackendError } from '../../src/convex/errors'
import { EVENT_VALUE_MAX } from '../../src/convex/events'
import { type AppealView, type ReportsConsole, type ReportsOptions, setupAdmin } from '../../src/convex/integrations/admin'
import { setupAudit } from '../../src/convex/integrations/audit'

// The content duties past the paths reports.test.ts walks: the checks the
// form and the tab make on what a person typed, which account may report,
// the order the Reports tab lists things in, what `describe` and `locate`
// throwing or missing leave, an email that cannot be sent, the notifier's
// language, and what the activity trail keeps of a long reason. A second
// admin instance, without `locate`, runs beside the first.

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }

/** The emails the duties sent, by template, with the options they went with. */
const sent: Array<{ name: string, data: Record<string, unknown>, options: Record<string, unknown> }> = []
/** Make the next email fail, as a provider outage would. */
let failNext = false
const email = {
  sendTemplate: vi.fn(async (_ctx: unknown, name: string, data: Record<string, unknown>, options: Record<string, unknown> = {}) => {
    if (failNext) {
      failNext = false
      throw new Error('The email provider answered 503.')
    }
    sent.push({ name, data, options })
    return null
  }),
}

const reports: ReportsOptions = {
  describe: async (ctx, { table, id }) => {
    // A table whose describe breaks: the tab shows its rows as gone.
    if (table === 'drafts') throw new Error('describe broke')
    if (table !== 'strips') return null
    const strip = await ctx.db.get(id) as { idea: string, authorId?: string } | null
    return strip && { title: strip.idea, url: `/strips/${id}`, ...(strip.authorId ? { authorId: strip.authorId } : {}) }
  },
  hide: async (ctx, { id }) => ctx.db.patch(id, { hidden: true }),
  locate: (_ctx, url) => {
    if (url.pathname === '/boom') throw new Error('locate broke')
    const match = /^\/strips\/(.+)$/.exec(url.pathname)
    return match ? { table: 'strips', id: match[1]! } : null
  },
}
const admin = setupAdmin(components as never, { email: email as never, reports })
// The same duties for an app that gives no `locate`.
const unlocated = setupAdmin(components as never, { email: email as never, reports: { describe: reports.describe, hide: reports.hide } })
const audit = setupAudit(components as never)

const appSchema = defineSchema({
  strips: defineTable({ idea: v.string(), authorId: v.optional(v.string()), hidden: v.optional(v.boolean()) }),
  drafts: defineTable({ idea: v.string() }),
})

const createStrip = mutationGeneric({
  args: { idea: v.string(), anonymous: v.optional(v.boolean()) },
  handler: async (ctx, { idea, anonymous }) => {
    const identity = (await ctx.auth.getUserIdentity())!
    return ctx.db.insert('strips', { idea, ...(anonymous ? {} : { authorId: identity.subject }) })
  },
})
const createDraft = mutationGeneric({ args: {}, handler: async ctx => ctx.db.insert('drafts', { idea: 'A draft' }) })
const ban = mutationGeneric({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    await ctx.runMutation(components.backend.adapter.updateOne, { input: { model: 'user', where: [{ field: '_id', value: userId }], update: { banned: true } } } as never)
  },
})

const testApp = defineBackendTestApp(appSchema, {
  './_generated/api.js': () => Promise.resolve({}),
  './admin.js': () => Promise.resolve(admin.api),
  './plain.js': () => Promise.resolve(unlocated.api),
  './audit.js': () => Promise.resolve(audit.api),
  './strips.js': () => Promise.resolve({ createStrip, createDraft, ban }),
})

type Subject = { table: string, id: string }
const refsOf = (module: string) => ({
  reportContent: makeFunctionReference<'mutation', { subject: Subject, reason: string, details?: string }, null>(`${module}:reportContent`),
  sendNotice: makeFunctionReference<'action', Record<string, unknown>, null>(`${module}:sendNotice`),
  getReports: makeFunctionReference<'query', Record<string, never>, ReportsConsole | null>(`${module}:getReports`),
  decideReport: makeFunctionReference<'mutation', { subject?: Subject, notice?: string, action: 'hide' | 'dismiss', reason: string, ground?: 'illegal' | 'terms' }, null>(`${module}:decideReport`),
  flagCrime: makeFunctionReference<'mutation', { subject?: Subject, notice?: string, note?: string }, null>(`${module}:flagCrime`),
  getAppeal: makeFunctionReference<'query', { token: string }, AppealView | null>(`${module}:getAppeal`),
  appealDecision: makeFunctionReference<'mutation', { token: string, text: string }, null>(`${module}:appealDecision`),
  decideAppeal: makeFunctionReference<'mutation', { appealId: string, outcome: 'uphold' | 'reverse', reason: string }, null>(`${module}:decideAppeal`),
})
const ref = refsOf('admin')
const plain = refsOf('plain')
const strips = {
  create: makeFunctionReference<'mutation', { idea: string, anonymous?: boolean }, string>('strips:createStrip'),
  draft: makeFunctionReference<'mutation', Record<string, never>, string>('strips:createDraft'),
  ban: makeFunctionReference<'mutation', { userId: string }, null>('strips:ban'),
}
const listAllActivity = makeFunctionReference<'query', { paginationOpts: { numItems: number, cursor: string | null } }, { page: Array<{ type: string, data: Record<string, unknown> }> } | null>('audit:listAllActivity')

async function refusal(call: Promise<unknown>) {
  return getBackendError(await call.then(() => null, (error: unknown) => error))
}

const notice = (fields: Record<string, unknown> = {}) => ({
  url: 'https://app.example.com/strips/unknown',
  reason: 'illegal',
  details: 'It shows my home address.',
  name: 'Grace Hopper',
  email: 'grace@example.com',
  goodFaith: true,
  ...fields,
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  sent.length = 0
  failNext = false
  email.sendTemplate.mockClear()
  vi.stubEnv('SITE_URL', 'https://app.example.com')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('setupAdmin({ reports })', () => {
  test('refuses duties it could not carry out: no describe or hide, or no email to send them with', () => {
    expect(() => setupAdmin(components as never, { email: email as never, reports: { describe: reports.describe } as never })).toThrow(/`describe` and `hide` are functions/)
    expect(() => setupAdmin(components as never, { reports } as never)).toThrow(/pass the app's setupEmail instance as `email`/)
  })
})

describe('what a person types', () => {
  test('a notice is refused for a field past its length, an address that is none, and a subject that names no table', async () => {
    const t = testApp()
    expect(await refusal(t.action(ref.sendNotice, notice({ details: 'x'.repeat(4001) })))).toMatchObject({ code: 'invalid_input', data: { field: 'details', reason: 'too_long' } })
    expect(await refusal(t.action(ref.sendNotice, notice({ email: 'grace@localhost' })))).toMatchObject({ code: 'invalid_input', data: { field: 'email' } })
    expect(await refusal(t.action(ref.sendNotice, notice({ subject: { table: 'strips; drop', id: 'x' } })))).toMatchObject({ code: 'invalid_input', data: { field: 'subject' } })
    expect(sent).toEqual([])
  })

  test('a decision is refused without one target, and for a reason past its length', async () => {
    const t = testApp()
    const root = await asUser(t, { role: 'admin' })
    const id = await (await asUser(t)).mutation(strips.create, { idea: 'A fox' })
    expect(await refusal(root.mutation(ref.decideReport, { action: 'dismiss', reason: 'Fine.' }))).toMatchObject({ code: 'invalid_input', data: { field: 'subject' } })
    expect(await refusal(root.mutation(ref.decideReport, { subject: { table: 'strips', id }, notice: 'n1', action: 'dismiss', reason: 'Fine.' }))).toMatchObject({ code: 'invalid_input', data: { field: 'subject' } })
    expect(await refusal(root.mutation(ref.decideReport, { subject: { table: 'strips', id }, action: 'dismiss', reason: 'x'.repeat(2001) }))).toMatchObject({ code: 'invalid_input', data: { field: 'reason', reason: 'too_long' } })
    // A thing nobody reported has nothing open to decide.
    expect(await refusal(root.mutation(ref.decideReport, { subject: { table: 'strips', id }, action: 'dismiss', reason: 'Fine.' }))).toMatchObject({ code: 'invalid_input', data: { field: 'subject' } })
  })

  test('a crime flag is refused without one target, and where nothing was reported', async () => {
    const t = testApp()
    const root = await asUser(t, { role: 'admin' })
    const id = await (await asUser(t)).mutation(strips.create, { idea: 'A fox' })
    expect(await refusal(root.mutation(ref.flagCrime, {}))).toMatchObject({ code: 'invalid_input', data: { field: 'subject' } })
    expect(await refusal(root.mutation(ref.flagCrime, { subject: { table: 'strips', id } }))).toMatchObject({ code: 'invalid_input', data: { field: 'subject' } })
    expect(await refusal(root.mutation(ref.flagCrime, { notice: 'n1' }))).toMatchObject({ code: 'invalid_input', data: { field: 'notice' } })
  })

  test('an appeal link of the wrong length names no decision, read or sent, and an unknown appeal is refused', async () => {
    const t = testApp()
    const root = await asUser(t, { role: 'admin' })
    expect(await t.query(ref.getAppeal, { token: 'short' })).toBeNull()
    expect(await t.query(ref.getAppeal, { token: 'x'.repeat(129) })).toBeNull()
    expect(await refusal(t.mutation(ref.appealDecision, { token: 'short', text: 'Please.' }))).toMatchObject({ code: 'invalid_input', data: { field: 'token' } })
    expect(await refusal(t.mutation(ref.appealDecision, { token: 'x'.repeat(43), text: 'Please.' }))).toMatchObject({ code: 'invalid_input', data: { field: 'token' } })
    expect(await refusal(root.mutation(ref.decideAppeal, { appealId: 'a1', outcome: 'uphold', reason: 'Kept.' }))).toMatchObject({ code: 'invalid_input', data: { field: 'appealId' } })
  })
})

describe('who may report', () => {
  test('a banned account cannot, and neither can an administrator acting as an account', async () => {
    const t = testApp()
    const author = await asUser(t)
    const ada = await asUser(t)
    const root = await asUser(t, { role: 'admin' })
    const visit = await asUser(t, { impersonatedBy: root.userId })
    const id = await author.mutation(strips.create, { idea: 'A fox' })
    expect(await refusal(visit.mutation(ref.reportContent, { subject: { table: 'strips', id }, reason: 'abuse' }))).toMatchObject({ code: 'forbidden', data: { reason: 'impersonating' } })
    await t.mutation(strips.ban, { userId: ada.userId })
    expect(await refusal(ada.mutation(ref.reportContent, { subject: { table: 'strips', id }, reason: 'abuse' }))).toMatchObject({ code: 'forbidden', data: { reason: 'banned' } })
    expect((await root.query(ref.getReports, {}))!.subjects).toEqual([])
  })
})

describe('the Reports tab', () => {
  test('lists an intimate-image request first, then the most reported, then the latest', async () => {
    const t = testApp()
    const author = await asUser(t)
    const root = await asUser(t, { role: 'admin' })
    const reporters = [await asUser(t), await asUser(t), await asUser(t)]
    const [older, busy, latest, intimate] = [await author.mutation(strips.create, { idea: 'Older' }), await author.mutation(strips.create, { idea: 'Busy' }), await author.mutation(strips.create, { idea: 'Latest' }), await author.mutation(strips.create, { idea: 'Intimate' })]
    await reporters[0]!.mutation(ref.reportContent, { subject: { table: 'strips', id: older }, reason: 'spam' })
    vi.advanceTimersByTime(1000)
    for (const reporter of reporters) await reporter.mutation(ref.reportContent, { subject: { table: 'strips', id: busy }, reason: 'abuse' })
    vi.advanceTimersByTime(1000)
    await reporters[1]!.mutation(ref.reportContent, { subject: { table: 'strips', id: latest }, reason: 'spam' })
    vi.advanceTimersByTime(1000)
    await t.action(ref.sendNotice, notice({ subject: { table: 'strips', id: intimate }, reason: 'intimate', signature: 'Grace Hopper' }))
    const order = (await root.query(ref.getReports, {}))!.subjects.map(entry => entry.described?.title)
    expect(order).toEqual(['Intimate', 'Busy', 'Latest', 'Older'])
  })

  test('shows a thing describe throws on as gone and logs it, and a thing with no author with none', async () => {
    const t = testApp()
    const ada = await asUser(t)
    const root = await asUser(t, { role: 'admin' })
    const draft = await t.mutation(strips.draft, {})
    const orphan = await ada.mutation(strips.create, { idea: 'Nobody\'s', anonymous: true })
    // A notice may name any table: describe decides what it is.
    await t.action(ref.sendNotice, notice({ subject: { table: 'drafts', id: draft } }))
    await ada.mutation(ref.reportContent, { subject: { table: 'strips', id: orphan }, reason: 'spam' })
    const { subjects, notices } = (await root.query(ref.getReports, {}))!
    expect(subjects).toEqual([expect.objectContaining({ subject: { table: 'strips', id: orphan }, described: { title: 'Nobody\'s', url: `/strips/${orphan}` }, author: null })])
    // The notice describe threw on stays on its own, as one the app could not place.
    expect(notices).toEqual([expect.objectContaining({ details: 'It shows my home address.' })])
    expect(vi.mocked(console.warn).mock.calls.flat().join(' ')).toContain('reports.describe_failed')
  })

  test('files a notice locate places on a thing already reported under that thing, and keeps one locate throws on apart', async () => {
    const t = testApp()
    const author = await asUser(t)
    const ada = await asUser(t)
    const root = await asUser(t, { role: 'admin' })
    const id = await author.mutation(strips.create, { idea: 'A fox' })
    await ada.mutation(ref.reportContent, { subject: { table: 'strips', id }, reason: 'abuse' })
    await t.action(ref.sendNotice, notice({ url: `https://app.example.com/strips/${id}` }))
    await t.action(ref.sendNotice, notice({ url: 'https://app.example.com/boom', email: 'linus@example.com' }))
    const { subjects, notices } = (await root.query(ref.getReports, {}))!
    expect(subjects).toEqual([expect.objectContaining({ subject: { table: 'strips', id }, open: 2, reasons: { abuse: 1, illegal: 1 }, notices: [expect.objectContaining({ url: `https://app.example.com/strips/${id}` })] })])
    expect(notices).toEqual([expect.objectContaining({ url: 'https://app.example.com/boom' })])
  })

  test('without locate, a notice sent without its thing stays on its own, and deciding the thing leaves it open', async () => {
    const t = testApp()
    const author = await asUser(t)
    const ada = await asUser(t)
    const root = await asUser(t, { role: 'admin' })
    const id = await author.mutation(strips.create, { idea: 'A fox' })
    await ada.mutation(plain.reportContent, { subject: { table: 'strips', id }, reason: 'abuse' })
    await t.action(plain.sendNotice, notice({ url: `https://app.example.com/strips/${id}` }))
    expect((await root.query(plain.getReports, {}))!.notices).toEqual([expect.objectContaining({ url: `https://app.example.com/strips/${id}` })])
    await root.mutation(plain.decideReport, { subject: { table: 'strips', id }, action: 'dismiss', reason: 'Fine.' })
    const after = (await root.query(plain.getReports, {}))!
    expect(after.subjects).toEqual([])
    expect(after.notices).toHaveLength(1)
  })
})

describe('the duty emails', () => {
  test('go in the notifier\'s language, and the outcome links where describe shows the thing when the notifier\'s link leaves the app', async () => {
    const t = testApp()
    const author = await asUser(t)
    const root = await asUser(t, { role: 'admin' })
    const id = await author.mutation(strips.create, { idea: 'A fox' })
    await t.action(ref.sendNotice, notice({ subject: { table: 'strips', id }, url: 'https://mirror.example.net/fox', locale: ' de ' }))
    expect(sent).toEqual([{ name: 'noticeReceived', data: { email: 'grace@example.com', intimate: false }, options: expect.objectContaining({ locale: 'de' }) }])
    await root.mutation(ref.decideReport, { subject: { table: 'strips', id }, action: 'dismiss', reason: 'Satire.' })
    expect(sent[1]).toEqual({ name: 'noticeDecided', data: { email: 'grace@example.com', url: `/strips/${id}`, outcome: 'kept', reason: 'Satire.' }, options: expect.objectContaining({ locale: 'de' }) })
  })

  test('a receipt that cannot be sent is logged, and the notice is filed all the same', async () => {
    const t = testApp()
    const root = await asUser(t, { role: 'admin' })
    failNext = true
    await t.action(ref.sendNotice, notice({ url: 'https://elsewhere.example.com/page' }))
    expect(vi.mocked(console.error).mock.calls.flat().join(' ')).toContain('reports.email_unsent')
    expect((await root.query(ref.getReports, {}))!.notices).toHaveLength(1)
  })

  test('carry no link at all while SITE_URL is unset, so none of a stranger\'s choosing goes out', async () => {
    vi.stubEnv('SITE_URL', '')
    const t = testApp()
    await t.action(ref.sendNotice, notice({ url: 'https://app.example.com/strips/unknown' }))
    expect(sent).toEqual([{ name: 'noticeReceived', data: { email: 'grace@example.com', intimate: false }, options: expect.any(Object) }])
  })
})

describe('an appeal on a thing since deleted', () => {
  test('reads without its title, and its outcome still reaches the author', async () => {
    const t = testApp()
    const author = await asUser(t, { email: 'ada@example.com' })
    const ada = await asUser(t)
    const root = await asUser(t, { role: 'admin' })
    const id = await author.mutation(strips.create, { idea: 'A fox' })
    await ada.mutation(ref.reportContent, { subject: { table: 'strips', id }, reason: 'abuse' })
    await root.mutation(ref.decideReport, { subject: { table: 'strips', id }, action: 'hide', reason: 'Harassment.' })
    const url = sent.find(mail => mail.name === 'contentRestricted')!.data.appealUrl as string
    const token = url.slice(url.indexOf('#appeal=') + '#appeal='.length)
    await t.mutation(ref.appealDecision, { token, text: 'It is my own character.' })
    await t.run(ctx => ctx.db.delete(id as never))

    expect(await t.query(ref.getAppeal, { token })).toMatchObject({ title: null, action: 'hidden', appeal: { status: 'open' } })
    const [appeal] = (await root.query(ref.getReports, {}))!.appeals
    expect(appeal).toMatchObject({ subject: { table: 'strips', id }, described: null })
    sent.length = 0
    await root.mutation(ref.decideAppeal, { appealId: appeal!.id, outcome: 'uphold', reason: 'Kept.' })
    expect(sent).toEqual([{ name: 'appealDecided', data: { email: 'ada@example.com', title: '', outcome: 'upheld', reason: 'Kept.' }, options: expect.any(Object) }])
  })
})

describe('the activity trail', () => {
  test('records who decided what and why, never who reported it', async () => {
    const t = testApp()
    const author = await asUser(t)
    const ada = await asUser(t)
    const root = await asUser(t, { role: 'admin' })
    const id = await author.mutation(strips.create, { idea: 'A fox' })
    await ada.mutation(ref.reportContent, { subject: { table: 'strips', id }, reason: 'abuse', details: 'Ada finds it cruel.' })
    await root.mutation(ref.decideReport, { subject: { table: 'strips', id }, action: 'hide', reason: 'Harassment of a named person.' })
    const page = (await root.query(listAllActivity, { paginationOpts: { numItems: 20, cursor: null } }))!.page
    const decided = page.find(row => row.type === 'report.decided')!
    expect(decided).toMatchObject({ targetId: id, data: { action: 'hidden', ground: 'terms', reports: 1, reason: 'Harassment of a named person.', table: 'strips' } })
    expect(JSON.stringify(page)).not.toContain(ada.userId)
    expect(JSON.stringify(page)).not.toContain('Ada finds it cruel.')
  })

  test('records a decision and an appeal\'s outcome whose reason is longer than a row takes, cut to its start, never half a character', async () => {
    const t = testApp()
    const author = await asUser(t, { email: 'ada@example.com' })
    const ada = await asUser(t)
    const root = await asUser(t, { role: 'admin' })
    const id = await author.mutation(strips.create, { idea: 'A fox' })
    await ada.mutation(ref.reportContent, { subject: { table: 'strips', id }, reason: 'abuse' })
    const long = 'Harassment of a named person, repeated across the comments and the strip itself. '.repeat(3)
    await root.mutation(ref.decideReport, { subject: { table: 'strips', id }, action: 'hide', reason: long })
    const url = sent.find(mail => mail.name === 'contentRestricted')!.data.appealUrl as string
    await t.mutation(ref.appealDecision, { token: url.slice(url.indexOf('#appeal=') + '#appeal='.length), text: 'It is my own character.' })
    const [appeal] = (await root.query(ref.getReports, {}))!.appeals
    // Two code units a fox: a cut at an odd length would leave half of one.
    const foxes = '🦊'.repeat(100)
    await root.mutation(ref.decideAppeal, { appealId: appeal!.id, outcome: 'uphold', reason: foxes })
    const page = (await root.query(listAllActivity, { paginationOpts: { numItems: 20, cursor: null } }))!.page
    expect(page.find(row => row.type === 'report.decided')).toMatchObject({ data: { action: 'hidden', reason: `${long.slice(0, EVENT_VALUE_MAX - 1)}…` } })
    expect(page.find(row => row.type === 'report.appeal_decided')).toMatchObject({ data: { outcome: 'upheld', reason: `${'🦊'.repeat((EVENT_VALUE_MAX - 2) / 2)}…` } })
    expect(vi.mocked(console.warn).mock.calls.flat().join(' ')).not.toContain('audit.record_failed')
  })
})
