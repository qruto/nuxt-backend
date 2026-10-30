/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, makeFunctionReference } from 'convex/server'
import { defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { PERSONAS } from '../../scripts/try/personas.mjs'
import { fixturePanels } from '../../scripts/try/seeds.mjs'
import schema from '../../website/backend/schema'

// The try kit's persona functions write accounts and strips outside every
// sign-in check. They are internal, and refuse every deployment but a local
// one: a loopback URL that the try kit marked local. The website's
// functions deploy to its cloud and production deployments too, so each
// function must ask. On a local deployment they give Panels the states the
// guide walks: a drawn strip with its notification, one in line, one
// reported, an experiment, an answer, and the canned ideas queued through
// Panels' own internal entry.

const testApp = defineBackendTestApp(schema, import.meta.glob(['../../website/backend/**/*.ts', '../../website/backend/_generated/*.js', '!**/*.d.ts']))
const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }

type Seeded = { key: string, userId: string, workspaceId: string, created: boolean }
type StripSpec = { authorId: string, authorEmail: string, workspaceId: string, idea: string, status: 'ready' | 'queued', captions?: string[], reporterId?: string }

const seed = makeFunctionReference<'mutation', { personas: unknown[] }, Seeded[]>('personas:seed')
const seedStrips = makeFunctionReference<'mutation', { strips: StripSpec[], panels: string[] }, string[]>('personas:seedStrips')
const seedExperiments = makeFunctionReference<'mutation', { userId: string, keys: string[] }, Array<{ key: string, variant: string }>>('personas:seedExperiments')
const seedSource = makeFunctionReference<'mutation', { userId: string, answer: string }, string | null>('personas:seedSource')
const seedCache = makeFunctionReference<'mutation', Record<string, never>, { queued: number }>('demo:seedInternal')

/** The account fields the kit sends (scripts/try/seeds.mjs). */
const accounts = PERSONAS.map(({ key, email, name, role, passkeyOnly, locale, workspace, joins }) => ({ key, email, name, ...(role ? { role } : {}), ...(passkeyOnly ? { passkeyOnly } : {}), ...(locale ? { locale } : {}), ...(workspace ? { workspace } : {}), ...(joins ? { joins } : {}) }))

let t: ReturnType<typeof testApp>

beforeEach(() => {
  // A seeded strip notifies its author, whose email goes out from a
  // scheduled function: the clock is ours so each test runs that work out
  // before it ends, and the site's origin makes the email's link absolute.
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
  vi.stubEnv('SITE_URL', 'https://app.example.com')
  t = testApp()
})

afterEach(async () => {
  await t.finishAllScheduledFunctions(() => vi.runAllTimers())
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

function onLocalDeployment() {
  vi.stubEnv('CONVEX_CLOUD_URL', 'http://127.0.0.1:3210')
  vi.stubEnv('TRY_KIT_LOCAL', '1')
}

/** The strips the kit sends for the seeded accounts, as scripts/try/seeds.mjs builds them. */
function stripsOf(byKey: Map<string, Seeded>): StripSpec[] {
  return PERSONAS.flatMap(persona => (persona.strips ?? []).map(({ idea, status, captions, reportedBy }) => ({
    authorId: byKey.get(persona.key)!.userId,
    authorEmail: persona.email,
    workspaceId: byKey.get(persona.key)!.workspaceId,
    idea,
    status,
    ...(captions ? { captions } : {}),
    ...(reportedBy ? { reporterId: byKey.get(reportedBy)!.userId } : {}),
  })))
}

async function seedAccounts(): Promise<Map<string, Seeded>> {
  const seeded = await t.mutation(seed, { personas: accounts })
  return new Map(seeded.map(account => [account.key, account]))
}

describe('the persona functions', () => {
  test.each([
    ['a cloud deployment', { CONVEX_CLOUD_URL: 'https://happy-otter-123.convex.cloud', TRY_KIT_LOCAL: '1' }],
    ['a loopback one the try kit never marked (self-hosted)', { CONVEX_CLOUD_URL: 'http://127.0.0.1:3210', TRY_KIT_LOCAL: '' }],
  ])('refuse %s, writing nothing', async (_, env) => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value)
    await expect(t.mutation(seed, { personas: accounts })).rejects.toThrow(/local deployments only/)
    const strip: StripSpec = { authorId: 'user_1', authorEmail: 'a@b.c', workspaceId: 'ws_1', idea: 'An idea', status: 'queued' }
    await expect(t.mutation(seedStrips, { strips: [strip], panels: [] })).rejects.toThrow(/local deployments only/)
    await expect(t.mutation(seedExperiments, { userId: 'user_1', keys: ['ideaExamples'] })).rejects.toThrow(/local deployments only/)
    await expect(t.mutation(seedSource, { userId: 'user_1', answer: 'podcast' })).rejects.toThrow(/local deployments only/)
    const users = await t.query(components.backend.adapter.findMany, { model: 'user', paginationOpts: { numItems: 10, cursor: null } } as never) as { page: unknown[] }
    expect(users.page).toEqual([])
    expect(await t.run(ctx => ctx.db.query('strips').take(1))).toEqual([])
  })

  test('seed the personas on a local deployment, once', async () => {
    onLocalDeployment()
    const first = await t.mutation(seed, { personas: accounts })
    expect(first.map(account => account.created)).toEqual(PERSONAS.map(() => true))
    const byKey = new Map(first.map(account => [account.key, account]))
    // The member opens in the owner's workspace; everyone else in one of their own.
    expect(byKey.get('member')!.workspaceId).toBe(byKey.get('owner')!.workspaceId)
    expect(new Set(first.map(account => account.workspaceId)).size).toBe(PERSONAS.length - 1)
    const again = await t.mutation(seed, { personas: accounts })
    expect(again).toEqual(first.map(account => ({ ...account, created: false })))
    // The passkey-only administrator: an admin whose account takes no code.
    const passkeyAdmin = await t.query(components.backend.adapter.findOne, { model: 'user', where: [{ field: '_id', value: byKey.get('passkeyAdmin')!.userId }] } as never) as { role: string, passkeyOnly?: boolean }
    expect(passkeyAdmin).toMatchObject({ role: 'admin', passkeyOnly: true })
    // Acme's trail reads as the real flows would have left it, once.
    const owner = byKey.get('owner')!
    const trail = await t.query(components.backend.audit.list, { view: { kind: 'workspace', workspaceId: owner.workspaceId, viewerId: owner.userId }, paginationOpts: { numItems: 10, cursor: null } })
    expect(trail.page.map(entry => [entry.type, entry.actor.kind])).toEqual([
      ['workspace.invitation_accepted', 'user'],
      ['workspace.member_invited', 'you'],
      ['workspace.created', 'you'],
    ])
  })

  test('give Panels a drawn strip with its notification, one in line and one reported, once', async () => {
    onLocalDeployment()
    const byKey = await seedAccounts()
    const owner = byKey.get('owner')!
    const free = byKey.get('free')!
    const strips = stripsOf(byKey)
    expect(await t.mutation(seedStrips, { strips, panels: fixturePanels() })).toEqual(strips.map(strip => strip.idea))
    // A second run finds them and adds none.
    expect(await t.mutation(seedStrips, { strips, panels: fixturePanels() })).toEqual([])

    const rows = await t.run(ctx => ctx.db.query('strips').take(10))
    const acme = rows.filter(row => row.workspaceId === owner.workspaceId)
    expect(acme.map(row => [row.authorId, row.status])).toEqual([[owner.userId, 'ready'], [byKey.get('member')!.userId, 'queued']])
    // The drawn strip's panels are the workspace's files: its members read them, nobody else does.
    const drawn = acme[0]!
    expect(drawn.panels.map(panel => panel.caption)).toEqual(PERSONAS.find(persona => persona.key === 'owner')!.strips![0]!.captions)
    for (const panel of drawn.panels) {
      expect(await t.query(components.backend.storage.url, { storageId: panel.imageId, userId: byKey.get('member')!.userId })).toEqual(expect.any(String))
      expect(await t.query(components.backend.storage.url, { storageId: panel.imageId, userId: free.userId })).toBeNull()
    }
    // Its author heard, through Panels' own notification kind, linking to the strip.
    const inbox = await t.query(components.backend.notifications.list, { userId: owner.userId, paginationOpts: { numItems: 5, cursor: null } })
    expect(inbox.page.filter(item => item.type === 'app.strip_ready').map(item => item.link)).toEqual([`/playground/strips/${drawn._id}`])
    // The free user's strip has the owner's open report, which the Reports tab lists.
    const reported = rows.find(row => row.authorId === free.userId)!
    const reports = await t.query(components.backend.reports.reportsConsole, {})
    expect(reports.subjects.map(subject => [subject.table, subject.id, subject.open])).toEqual([['strips', reported._id, 1]])
  })

  test('put a persona in the experiment once, on the variant its page reads, and keep its answer', async () => {
    onLocalDeployment()
    const free = (await seedAccounts()).get('free')!
    const [assigned] = await t.mutation(seedExperiments, { userId: free.userId, keys: ['ideaExamples'] })
    expect(assigned).toEqual({ key: 'ideaExamples', variant: expect.stringMatching(/^(plain|examples)$/) })
    expect(await t.mutation(seedExperiments, { userId: free.userId, keys: ['ideaExamples'] })).toEqual([])
    // The flag runs for the account alone, and the experiment counts it once.
    expect((await t.query(components.backend.flags.get, { key: 'ideaExamples' }))?.override).toEqual({ users: [free.userId] })
    const counts = await t.query(components.backend.funnel.experimentCounts, { experiment: 'ideaExamples', variants: ['plain', 'examples'], kinds: [] })
    expect(counts.variants.map(variant => [variant.name, variant.exposed])).toEqual([['plain', 0], ['examples', 0]].map(([name]) => [name, name === assigned!.variant ? 1 : 0]))
    await expect(t.mutation(seedExperiments, { userId: free.userId, keys: ['maintenance'] })).rejects.toThrow(/no experiment/)

    expect(await t.mutation(seedSource, { userId: free.userId, answer: 'podcast' })).toBe('podcast')
    // The first answer stays.
    expect(await t.mutation(seedSource, { userId: free.userId, answer: 'friend' })).toBe('podcast')
    expect(await t.query(components.backend.funnel.source, { userId: free.userId })).toMatchObject({ asked: true, answer: 'podcast' })
  })

  test('queue the canned ideas through Panels\' internal entry, with no one signed in', async () => {
    expect(await t.mutation(seedCache, {})).toEqual({ queued: 4 })
    const cache = await t.run(ctx => ctx.db.query('cannedStrips').take(10))
    expect(cache.map(row => [row.ideaId, row.ready])).toEqual([['surfing-cat', false], ['moon-bus', false], ['robot-baker', false], ['lighthouse-whale', false]])
  })
})
