/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, defineTable, makeFunctionReference, mutationGeneric } from 'convex/server'
import { v } from 'convex/values'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { getBackendError } from '../../src/convex/errors'
import { type AppealView, type ReportsConsole, setupAdmin } from '../../src/convex/integrations/admin'
import { setupStorage } from '../../src/convex/integrations/storage'
import { REPORTS_CONSOLE_ROWS } from '../../src/convex/components/backend/reports'

// Content duties the way backend/admin.ts turns them on: a signed-in
// person's one-click report, the public notice form (DSA Art. 16, with the
// TAKE IT DOWN Act's intimate-image request), the Reports tab's decisions
// with their emails (the notifier's outcome, the author's statement of
// reasons with an appeal link), the appeal, the Art. 18 flag, and the
// removal of a removed intimate image's identical copies by hash.

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), char => char.charCodeAt(0))

/** The emails the duties sent, by template. */
const sent: Array<{ name: string, data: Record<string, unknown> }> = []
const email = {
  sendTemplate: vi.fn(async (_ctx: unknown, name: string, data: Record<string, unknown>) => {
    sent.push({ name, data })
    return null
  }),
}
const restored: string[] = []

// The app moved the report page: the appeal link follows nuxt.config.
const admin = setupAdmin(components as never, {
  email: email as never,
  paths: { report: '/help/report' },
  reports: {
    describe: async (ctx, { table, id }) => {
      if (table !== 'strips') return null
      const strip = await ctx.db.get(id) as { idea: string, authorId: string, photoId?: string } | null
      return strip && { title: strip.idea, url: `/strips/${id}`, authorId: strip.authorId, ...(strip.photoId ? { files: [strip.photoId] } : {}) }
    },
    hide: async (ctx, { id }) => ctx.db.patch(id, { hidden: true }),
    restore: async (ctx, { id }) => {
      restored.push(id)
      await ctx.db.patch(id, { hidden: false })
    },
    locate: (_ctx, url) => {
      const match = /^\/strips\/(.+)$/.exec(url.pathname)
      return match ? { table: 'strips', id: match[1]! } : null
    },
  },
})
const storage = setupStorage(components as never)

const appSchema = defineSchema({
  strips: defineTable({ idea: v.string(), authorId: v.string(), photoId: v.optional(v.string()), hidden: v.optional(v.boolean()) }),
})

const createStrip = mutationGeneric({
  args: { idea: v.string(), photo: v.optional(v.boolean()) },
  handler: async (ctx, { idea, photo }) => {
    const identity = (await ctx.auth.getUserIdentity())!
    const photoId = photo ? (await storage.store(ctx, PNG.slice().buffer as ArrayBuffer, { userId: identity.subject })).storageId : undefined
    return ctx.db.insert('strips', { idea, authorId: identity.subject, ...(photoId ? { photoId } : {}) })
  },
})
const uploadCopy = mutationGeneric({
  args: {},
  handler: async (ctx) => {
    const identity = (await ctx.auth.getUserIdentity())!
    return (await storage.store(ctx, PNG.slice().buffer as ArrayBuffer, { userId: identity.subject })).storageId
  },
})

const testApp = defineBackendTestApp(appSchema, {
  './_generated/api.js': () => Promise.resolve({}),
  './admin.js': () => Promise.resolve(admin.api),
  './strips.js': () => Promise.resolve({ createStrip, uploadCopy }),
})
type App = ReturnType<typeof testApp>

type Subject = { table: string, id: string }
const ref = {
  reportContent: makeFunctionReference<'mutation', { subject: Subject, reason: string, details?: string }, null>('admin:reportContent'),
  sendNotice: makeFunctionReference<'action', Record<string, unknown>, null>('admin:sendNotice'),
  getReports: makeFunctionReference<'query', Record<string, never>, ReportsConsole | null>('admin:getReports'),
  decideReport: makeFunctionReference<'mutation', { subject?: Subject, notice?: string, action: 'hide' | 'dismiss', reason: string, ground?: 'illegal' | 'terms' }, null>('admin:decideReport'),
  flagCrime: makeFunctionReference<'mutation', { subject?: Subject, notice?: string, note?: string }, null>('admin:flagCrime'),
  getAppeal: makeFunctionReference<'query', { token: string }, AppealView | null>('admin:getAppeal'),
  appealDecision: makeFunctionReference<'mutation', { token: string, text: string }, null>('admin:appealDecision'),
  decideAppeal: makeFunctionReference<'mutation', { appealId: string, outcome: 'uphold' | 'reverse', reason: string }, null>('admin:decideAppeal'),
  createStrip: makeFunctionReference<'mutation', { idea: string, photo?: boolean }, string>('strips:createStrip'),
  uploadCopy: makeFunctionReference<'mutation', Record<string, never>, string>('strips:uploadCopy'),
}

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

/** The appeal token a statement of reasons links to. */
function appealToken(): string {
  const url = sent.find(mail => mail.name === 'contentRestricted')!.data.appealUrl as string
  return url.slice(url.indexOf('#appeal=') + '#appeal='.length)
}

const strip = (t: App, id: string) => t.run(ctx => ctx.db.get(id as never)) as Promise<{ hidden?: boolean } | null>

beforeEach(() => {
  sent.length = 0
  restored.length = 0
  email.sendTemplate.mockClear()
  vi.stubEnv('SITE_URL', 'https://app.example.com')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('reportContent', () => {
  test('files one open report per person and thing, and refuses what describe does not describe', async () => {
    const t = testApp()
    const author = await asUser(t)
    const ada = await asUser(t)
    const root = await asUser(t, { role: 'admin' })
    const id = await author.mutation(ref.createStrip, { idea: 'A fox who wants to fly' })
    await ada.mutation(ref.reportContent, { subject: { table: 'strips', id }, reason: 'abuse' })
    await ada.mutation(ref.reportContent, { subject: { table: 'strips', id }, reason: 'spam' })
    const reports = await root.query(ref.getReports, {})
    expect(reports?.subjects).toEqual([expect.objectContaining({ subject: { table: 'strips', id }, open: 1, reasons: { spam: 1 }, notices: [], described: { title: 'A fox who wants to fly', url: `/strips/${id}`, authorId: author.userId } })])
    expect(await refusal(ada.mutation(ref.reportContent, { subject: { table: 'users', id }, reason: 'abuse' }))).toMatchObject({ code: 'invalid_input', data: { field: 'subject' } })
    expect(await refusal(ada.mutation(ref.reportContent, { subject: { table: 'strips', id: 'nope' }, reason: 'abuse' }))).toMatchObject({ code: 'invalid_input', data: { field: 'subject' } })
    expect(await refusal(t.mutation(ref.reportContent, { subject: { table: 'strips', id }, reason: 'abuse' }))).toMatchObject({ code: 'unauthenticated' })
  })

  test('caps each person at 10 reports an hour', async () => {
    const t = testApp()
    const ada = await asUser(t)
    const ids: string[] = []
    for (let index = 0; index < 11; index++) ids.push(await ada.mutation(ref.createStrip, { idea: `Strip ${index}` }))
    for (const id of ids.slice(0, 10)) await ada.mutation(ref.reportContent, { subject: { table: 'strips', id }, reason: 'spam' })
    expect(await refusal(ada.mutation(ref.reportContent, { subject: { table: 'strips', id: ids[10]! }, reason: 'spam' }))).toMatchObject({ code: 'rate_limited', data: { limit: 'report' } })
  })
})

describe('the notice form', () => {
  test('takes a notice with what Art. 16 asks for, confirms it by email, and files it under the thing', async () => {
    const t = testApp()
    const author = await asUser(t)
    const root = await asUser(t, { role: 'admin' })
    const id = await author.mutation(ref.createStrip, { idea: 'A fox' })
    await t.action(ref.sendNotice, notice({ subject: { table: 'strips', id } }))
    expect(sent).toEqual([{ name: 'noticeReceived', data: { email: 'grace@example.com', url: 'https://app.example.com/strips/unknown', intimate: false } }])
    const reports = (await root.query(ref.getReports, {}))!
    expect(reports.subjects[0]).toMatchObject({ open: 1, reasons: { illegal: 1 }, deadline: null, notices: [expect.objectContaining({ reason: 'illegal', notifier: { name: 'Grace Hopper', email: 'grace@example.com' } })] })
  })

  test('refuses a notice without the fields the law asks for', async () => {
    const t = testApp()
    expect(await refusal(t.action(ref.sendNotice, notice({ goodFaith: false })))).toMatchObject({ code: 'invalid_input', data: { field: 'goodFaith' } })
    expect(await refusal(t.action(ref.sendNotice, notice({ email: undefined })))).toMatchObject({ code: 'invalid_input', data: { field: 'email' } })
    expect(await refusal(t.action(ref.sendNotice, notice({ url: 'javascript:alert(1)' })))).toMatchObject({ code: 'invalid_input', data: { field: 'url' } })
    expect(await refusal(t.action(ref.sendNotice, notice({ details: ' ' })))).toMatchObject({ code: 'invalid_input', data: { field: 'details' } })
    // The TAKE IT DOWN Act's request is signed.
    expect(await refusal(t.action(ref.sendNotice, notice({ reason: 'intimate' })))).toMatchObject({ code: 'invalid_input', data: { field: 'signature' } })
    // A notice of child sexual abuse material may come without a name or an address.
    await t.action(ref.sendNotice, notice({ reason: 'child_abuse', name: undefined, email: undefined }))
    expect(sent).toEqual([])
  })

  test('a notice makes no subject of a thing describe does not know, and hide never reaches one', async () => {
    const t = testApp()
    const author = await asUser(t)
    const ada = await asUser(t)
    const root = await asUser(t, { role: 'admin' })
    // The form's subject comes from anyone: any table, any id.
    await t.action(ref.sendNotice, notice({ reason: 'intimate', signature: 'Grace Hopper', subject: { table: 'x', id: 'fake1' } }))
    const reports = (await root.query(ref.getReports, {}))!
    expect(reports.subjects).toEqual([])
    expect(reports.notices).toEqual([expect.objectContaining({ reason: 'intimate' })])
    expect(reports.notices[0]).not.toHaveProperty('hint')
    expect(await refusal(root.mutation(ref.decideReport, { subject: { table: 'x', id: 'fake1' }, action: 'hide', reason: 'No.' }))).toMatchObject({ code: 'invalid_input', data: { field: 'subject' } })

    // A notice naming a real thing is filed under it, and flagged there.
    const id = await author.mutation(ref.createStrip, { idea: 'A fox' })
    await t.action(ref.sendNotice, notice({ subject: { table: 'strips', id } }))
    await root.mutation(ref.flagCrime, { subject: { table: 'strips', id }, note: 'A threat.' })
    expect((await root.query(ref.getReports, {}))!.subjects).toEqual([expect.objectContaining({ subject: { table: 'strips', id }, open: 1, notices: [expect.objectContaining({ crime: expect.objectContaining({ note: 'A threat.' }) })] })])

    // Once the thing is gone it is dismissed, never hidden.
    await ada.mutation(ref.reportContent, { subject: { table: 'strips', id }, reason: 'abuse' })
    await t.run(ctx => ctx.db.delete(id as never))
    expect(await refusal(root.mutation(ref.decideReport, { subject: { table: 'strips', id }, action: 'hide', reason: 'Gone.' }))).toMatchObject({ code: 'invalid_input', data: { field: 'subject' } })
    await root.mutation(ref.decideReport, { subject: { table: 'strips', id }, action: 'dismiss', reason: 'It was deleted.' })
    expect((await root.query(ref.getReports, {}))!.subjects).toEqual([])
  })

  test('limits notices per mailbox, never anonymous ones as one, and mails no link outside the app', async () => {
    const t = testApp()
    for (let index = 0; index < 10; index++) await t.action(ref.sendNotice, notice({ email: `grace+${index}@example.com` }))
    expect(await refusal(t.action(ref.sendNotice, notice({ email: 'g.r.a.c.e@example.com' })))).toMatchObject({ code: 'rate_limited', data: { limit: 'report' } })
    for (let index = 0; index < 11; index++) await t.action(ref.sendNotice, notice({ reason: 'child_abuse', name: undefined, email: undefined }))

    sent.length = 0
    await t.action(ref.sendNotice, notice({ email: 'ada@example.com', url: 'https://phish.example/login' }))
    expect(sent).toEqual([{ name: 'noticeReceived', data: { email: 'ada@example.com', intimate: false } }])
  })

  test('places a notice sent without its thing where locate says its link points', async () => {
    const t = testApp()
    const author = await asUser(t)
    const root = await asUser(t, { role: 'admin' })
    const id = await author.mutation(ref.createStrip, { idea: 'A fox' })
    await t.action(ref.sendNotice, notice({ url: `https://app.example.com/strips/${id}`, reason: 'intimate', signature: 'Grace Hopper' }))
    await t.action(ref.sendNotice, notice({ url: 'https://elsewhere.example.com/page' }))
    const reports = (await root.query(ref.getReports, {}))!
    expect(reports.subjects).toEqual([expect.objectContaining({ subject: { table: 'strips', id }, open: 1, reasons: { intimate: 1 }, deadline: expect.any(Number) })])
    expect(reports.notices).toEqual([expect.objectContaining({ url: 'https://elsewhere.example.com/page' })])
    expect(sent[0]).toMatchObject({ name: 'noticeReceived', data: { intimate: true } })

    // Deciding the thing closes the notice placed on it.
    await root.mutation(ref.decideReport, { subject: { table: 'strips', id }, action: 'hide', reason: 'Shared without consent.' })
    expect((await root.query(ref.getReports, {}))!.subjects).toEqual([])
    expect(sent.filter(mail => mail.name === 'noticeDecided')).toEqual([expect.objectContaining({ data: expect.objectContaining({ email: 'grace@example.com', outcome: 'removed' }) })])
  })
})

describe('the Reports tab', () => {
  test('is for administrators only', async () => {
    const t = testApp()
    const ada = await asUser(t)
    expect(await ada.query(ref.getReports, {})).toBeNull()
    expect(await refusal(ada.mutation(ref.decideReport, { notice: 'x', action: 'dismiss', reason: 'Fine.' }))).toMatchObject({ code: 'forbidden', data: { reason: 'admin_only' } })
    const stale = await asUser(t, { role: 'admin', signedInAt: Date.now() - 60 * 60 * 1000 })
    expect(await refusal(stale.mutation(ref.decideReport, { notice: 'x', action: 'dismiss', reason: 'Fine.' }))).toMatchObject({ code: 'reauthentication_required' })
  })

  test('hiding a thing runs hide, tells the notifier, and sends the author a statement of reasons with an appeal link', async () => {
    const t = testApp()
    const author = await asUser(t, { email: 'ada@example.com' })
    const ada = await asUser(t)
    const root = await asUser(t, { role: 'admin' })
    const id = await author.mutation(ref.createStrip, { idea: 'A fox' })
    await ada.mutation(ref.reportContent, { subject: { table: 'strips', id }, reason: 'abuse' })
    await t.action(ref.sendNotice, notice({ subject: { table: 'strips', id } }))
    sent.length = 0

    await root.mutation(ref.decideReport, { subject: { table: 'strips', id }, action: 'hide', reason: 'It shows a home address, which section 4 of our terms forbids.' })
    expect(await strip(t, id)).toMatchObject({ hidden: true })
    expect(sent.map(mail => mail.name)).toEqual(['noticeDecided', 'contentRestricted'])
    expect(sent[0]!.data).toEqual({ email: 'grace@example.com', url: 'https://app.example.com/strips/unknown', outcome: 'removed', reason: 'It shows a home address, which section 4 of our terms forbids.' })
    expect(sent[1]!.data).toMatchObject({ email: 'ada@example.com', title: 'A fox', ground: 'terms', notice: true, appealUrl: expect.stringMatching(/^https:\/\/app\.example\.com\/help\/report#appeal=/), appealUntil: expect.any(Number) })
    expect((await root.query(ref.getReports, {}))!.subjects).toEqual([])
  })

  test('dismissing tells the notifier the content stays, and the author nothing', async () => {
    const t = testApp()
    const author = await asUser(t)
    const root = await asUser(t, { role: 'admin' })
    const id = await author.mutation(ref.createStrip, { idea: 'A fox' })
    await t.action(ref.sendNotice, notice({ subject: { table: 'strips', id } }))
    sent.length = 0
    await root.mutation(ref.decideReport, { subject: { table: 'strips', id }, action: 'dismiss', reason: 'The address is a public landmark.' })
    expect(await strip(t, id)).not.toMatchObject({ hidden: true })
    expect(sent).toEqual([{ name: 'noticeDecided', data: expect.objectContaining({ outcome: 'kept' }) }])
  })

  test('decides a notice it could not place, telling its sender it was acted on, never removed, and flags a suspected crime', async () => {
    const t = testApp()
    const root = await asUser(t, { role: 'admin' })
    await t.action(ref.sendNotice, notice({ url: 'https://elsewhere.example.com/page' }))
    const [open] = (await root.query(ref.getReports, {}))!.notices
    await root.mutation(ref.flagCrime, { notice: open!.id, note: 'A threat against a named person.' })
    expect((await root.query(ref.getReports, {}))!.notices[0]).toMatchObject({ crime: { by: root.userId, note: 'A threat against a named person.' } })
    sent.length = 0
    await root.mutation(ref.decideReport, { notice: open!.id, action: 'hide', reason: 'Removed by hand.' })
    expect((await root.query(ref.getReports, {}))!.notices).toEqual([])
    // Nothing of the app's was hidden or matched for it: the sender hears it was acted on.
    expect(sent.filter(mail => mail.name === 'noticeDecided')).toEqual([{ name: 'noticeDecided', data: expect.objectContaining({ outcome: 'handled' }) }])
    expect(await refusal(root.mutation(ref.decideReport, { notice: open!.id, action: 'hide', reason: 'Again.' }))).toMatchObject({ code: 'invalid_input', data: { field: 'notice' } })
  })

  test('an intimate-image request it could not place comes first with its deadline, however many notices follow it', async () => {
    const t = testApp()
    const root = await asUser(t, { role: 'admin' })
    await t.action(ref.sendNotice, notice({ url: 'https://elsewhere.example.com/photo', reason: 'intimate', signature: 'Grace Hopper' }))
    for (let index = 0; index < REPORTS_CONSOLE_ROWS; index++) await t.action(ref.sendNotice, notice({ url: `https://elsewhere.example.com/${index}`, email: `notifier-${index}@example.com` }))
    const { notices } = (await root.query(ref.getReports, {}))!
    expect(notices).toHaveLength(REPORTS_CONSOLE_ROWS + 1)
    expect(notices[0]).toMatchObject({ reason: 'intimate', deadline: notices[0]!.createdAt + 48 * 60 * 60 * 1000 })
    expect(notices[1]).toMatchObject({ url: `https://elsewhere.example.com/${REPORTS_CONSOLE_ROWS - 1}`, deadline: null })
  })

  test('removing an intimate image removes its identical copies, and the same bytes are never kept again', async () => {
    const t = testApp()
    const author = await asUser(t)
    const other = await asUser(t)
    const root = await asUser(t, { role: 'admin' })
    const id = await author.mutation(ref.createStrip, { idea: 'A photo', photo: true })
    const copy = await other.mutation(ref.uploadCopy, {})
    await t.action(ref.sendNotice, notice({ subject: { table: 'strips', id }, reason: 'intimate', signature: 'Grace Hopper' }))
    await root.mutation(ref.decideReport, { subject: { table: 'strips', id }, action: 'hide', reason: 'An intimate image shared without consent.', ground: 'illegal' })
    const files = await t.run(ctx => ctx.db.system.query('_storage').collect())
    expect(files).toEqual([])
    expect(copy).toEqual(expect.any(String))
    expect(await refusal(other.mutation(ref.uploadCopy, {}))).toMatchObject({ code: 'invalid_input', data: { field: 'file', reason: 'removed_copy' } })
  })
})

describe('appeals', () => {
  test('the author appeals once through the link; reversing restores the content and tells them', async () => {
    const t = testApp()
    const author = await asUser(t, { email: 'ada@example.com' })
    const ada = await asUser(t)
    const root = await asUser(t, { role: 'admin' })
    const id = await author.mutation(ref.createStrip, { idea: 'A fox' })
    await ada.mutation(ref.reportContent, { subject: { table: 'strips', id }, reason: 'abuse' })
    await root.mutation(ref.decideReport, { subject: { table: 'strips', id }, action: 'hide', reason: 'Looks like harassment.' })
    const token = appealToken()

    expect(await t.query(ref.getAppeal, { token })).toMatchObject({ title: 'A fox', action: 'hidden', reason: 'Looks like harassment.', ground: 'terms', appeal: null })
    expect(await t.query(ref.getAppeal, { token: 'x'.repeat(43) })).toBeNull()
    await t.mutation(ref.appealDecision, { token, text: 'The fox is my own character.' })
    expect(await refusal(t.mutation(ref.appealDecision, { token, text: 'Again.' }))).toMatchObject({ code: 'invalid_input', data: { field: 'token', reason: 'appealed_already' } })
    expect(await t.query(ref.getAppeal, { token })).toMatchObject({ appeal: { status: 'open' } })

    const [appeal] = (await root.query(ref.getReports, {}))!.appeals
    expect(appeal).toMatchObject({ text: 'The fox is my own character.', subject: { table: 'strips', id }, described: { title: 'A fox' } })
    sent.length = 0
    await root.mutation(ref.decideAppeal, { appealId: appeal!.id, outcome: 'reverse', reason: 'It is the author\'s own character.' })
    expect(restored).toEqual([id])
    expect(await strip(t, id)).toMatchObject({ hidden: false })
    expect(sent).toEqual([{ name: 'appealDecided', data: { email: 'ada@example.com', title: 'A fox', outcome: 'reversed', reason: 'It is the author\'s own character.' } }])
    expect(await t.query(ref.getAppeal, { token })).toMatchObject({ appeal: { status: 'reversed', reason: 'It is the author\'s own character.' } })
    expect((await root.query(ref.getReports, {}))!.appeals).toEqual([])
  })

  test('reversing a decision leaves a subject reported again since open, its clock running and its content hidden', async () => {
    const t = testApp()
    const author = await asUser(t, { email: 'ada@example.com' })
    const ada = await asUser(t)
    const root = await asUser(t, { role: 'admin' })
    const id = await author.mutation(ref.createStrip, { idea: 'A fox' })
    await ada.mutation(ref.reportContent, { subject: { table: 'strips', id }, reason: 'abuse' })
    await root.mutation(ref.decideReport, { subject: { table: 'strips', id }, action: 'hide', reason: 'Looks like harassment.' })
    await t.mutation(ref.appealDecision, { token: appealToken(), text: 'It is my own character.' })
    await t.action(ref.sendNotice, notice({ subject: { table: 'strips', id }, reason: 'intimate', signature: 'Grace Hopper' }))

    const [appeal] = (await root.query(ref.getReports, {}))!.appeals
    await root.mutation(ref.decideAppeal, { appealId: appeal!.id, outcome: 'reverse', reason: 'It is the author\'s own character.' })
    expect(restored).toEqual([])
    expect(await strip(t, id)).toMatchObject({ hidden: true })
    expect((await root.query(ref.getReports, {}))!.subjects).toEqual([expect.objectContaining({ subject: { table: 'strips', id }, open: 1, reasons: { intimate: 1 }, deadline: expect.any(Number) })])
  })

  test('reversing an intimate-image removal lets the same bytes be uploaded again', async () => {
    const t = testApp()
    const author = await asUser(t)
    const root = await asUser(t, { role: 'admin' })
    const id = await author.mutation(ref.createStrip, { idea: 'A photo', photo: true })
    await t.action(ref.sendNotice, notice({ subject: { table: 'strips', id }, reason: 'intimate', signature: 'Grace Hopper' }))
    await root.mutation(ref.decideReport, { subject: { table: 'strips', id }, action: 'hide', reason: 'An intimate image shared without consent.', ground: 'illegal' })
    expect(await refusal(author.mutation(ref.uploadCopy, {}))).toMatchObject({ code: 'invalid_input', data: { reason: 'removed_copy' } })
    await t.mutation(ref.appealDecision, { token: appealToken(), text: 'It is a photo of me, shared by me.' })
    const [appeal] = (await root.query(ref.getReports, {}))!.appeals
    await root.mutation(ref.decideAppeal, { appealId: appeal!.id, outcome: 'reverse', reason: 'The author showed it is their own.' })
    expect(restored).toEqual([id])
    expect(await author.mutation(ref.uploadCopy, {})).toEqual(expect.any(String))
  })

  test('a decision can no longer be appealed after six months', async () => {
    vi.useFakeTimers()
    try {
      const t = testApp()
      const author = await asUser(t)
      const root = await asUser(t, { role: 'admin' })
      const id = await author.mutation(ref.createStrip, { idea: 'A fox' })
      await t.action(ref.sendNotice, notice({ subject: { table: 'strips', id } }))
      await root.mutation(ref.decideReport, { subject: { table: 'strips', id }, action: 'hide', reason: 'Harassment.' })
      vi.advanceTimersByTime(184 * 24 * 60 * 60 * 1000)
      expect(await refusal(t.mutation(ref.appealDecision, { token: appealToken(), text: 'Late.' }))).toMatchObject({ code: 'invalid_input', data: { field: 'token', reason: 'appeal_expired' } })
    }
    finally {
      vi.useRealTimers()
    }
  })
})

describe('an erasure', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /** Erase an account, or an address without one, to the end. */
  async function forget(t: App, target: { userId?: string, email?: string }): Promise<void> {
    await t.mutation(components.backend.account.forget, target)
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
  }

  test('keeps an erased reporter\'s report and an erased notifier\'s notice for the decision, and tells nobody who is gone', async () => {
    const t = testApp()
    const author = await asUser(t)
    const ada = await asUser(t)
    const root = await asUser(t, { role: 'admin' })
    const id = await author.mutation(ref.createStrip, { idea: 'A fox' })
    await ada.mutation(ref.reportContent, { subject: { table: 'strips', id }, reason: 'abuse', details: 'Ada finds it cruel.' })
    await t.action(ref.sendNotice, notice({ subject: { table: 'strips', id }, reason: 'intimate', signature: 'Grace Hopper' }))
    await forget(t, { userId: ada.userId })
    await forget(t, { email: 'grace@example.com' })

    // Both still count, the 48-hour clock still runs, and the notice no longer says who sent it.
    const [subject] = (await root.query(ref.getReports, {}))!.subjects
    expect(subject).toMatchObject({ open: 2, reasons: { abuse: 1, intimate: 1 }, deadline: expect.any(Number) })
    expect(subject!.notices).toEqual([expect.objectContaining({ reason: 'intimate', details: 'It shows my home address.', notifier: { name: null, email: null }, signature: null })])
    sent.length = 0
    await root.mutation(ref.decideReport, { subject: { table: 'strips', id }, action: 'hide', reason: 'Shared without consent.', ground: 'illegal' })
    // The notifier is gone, so no outcome email; the author still gets the statement of reasons.
    expect(sent.map(mail => mail.name)).toEqual(['contentRestricted'])
  })

  test('keeps a decision on an erased author\'s content, drops the appeal\'s text, and lets an administrator still answer it', async () => {
    const t = testApp()
    const author = await asUser(t, { email: 'ada@example.com' })
    const ada = await asUser(t)
    const root = await asUser(t, { role: 'admin' })
    const id = await author.mutation(ref.createStrip, { idea: 'A fox' })
    await ada.mutation(ref.reportContent, { subject: { table: 'strips', id }, reason: 'abuse' })
    await root.mutation(ref.decideReport, { subject: { table: 'strips', id }, action: 'hide', reason: 'Looks like harassment.' })
    const token = appealToken()
    await t.mutation(ref.appealDecision, { token, text: 'The fox is my own character.' })
    await forget(t, { userId: author.userId })

    const [appeal] = (await root.query(ref.getReports, {}))!.appeals
    expect(appeal).toMatchObject({ text: '', decision: { action: 'hidden', reason: 'Looks like harassment.' } })
    sent.length = 0
    await root.mutation(ref.decideAppeal, { appealId: appeal!.id, outcome: 'uphold', reason: 'Section 4 of the terms forbids it.' })
    expect(sent).toEqual([])
    expect(await t.query(ref.getAppeal, { token })).toMatchObject({ action: 'hidden', reason: 'Looks like harassment.', appeal: { status: 'upheld', reason: 'Section 4 of the terms forbids it.' } })
  })

  test('keeps the crime an erased administrator flagged, under the pseudonym', async () => {
    const t = testApp()
    const author = await asUser(t)
    const root = await asUser(t, { role: 'admin' })
    const other = await asUser(t, { role: 'admin' })
    const id = await author.mutation(ref.createStrip, { idea: 'A fox' })
    await t.action(ref.sendNotice, notice({ subject: { table: 'strips', id } }))
    await root.mutation(ref.flagCrime, { subject: { table: 'strips', id }, note: 'A threat.' })
    await forget(t, { userId: root.userId })
    expect((await other.query(ref.getReports, {}))!.subjects).toEqual([expect.objectContaining({ notices: [expect.objectContaining({ crime: { at: expect.any(Number), by: expect.stringMatching(/^erased:/), note: 'A threat.' } })] })])
  })
})
