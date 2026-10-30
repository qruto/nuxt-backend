/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, makeFunctionReference, mutationGeneric } from 'convex/server'
import { v } from 'convex/values'
import { asUser, defineBackendTestApp, seedWorkspace } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { getBackendError } from '../../src/convex/errors'
import { setupAccount } from '../../src/convex/integrations/account'
import { defineActivation, setupAudit } from '../../src/convex/integrations/audit'

// The app shell's backend: the first run's mark on the account, and the
// activation checklist, whose tasks tick off from the events the audit trail
// records. The marks live on the account's own row, so an erasure removes them.

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }

const checklist = defineActivation([
  { key: 'photo', label: 'Upload a photo', done: 'app.photo_uploaded', to: '/studio/photos' },
  { key: 'strip', label: 'activation.strip', done: 'app.strip_generated' },
  { key: 'invite', label: 'Invite a co-author', done: 'workspace.member_invited', scope: 'workspace' },
])
const audit = setupAudit(components as never, { checklist })
const account = setupAccount(components as never, { audit })
const plain = setupAudit(components as never)

const recorder = mutationGeneric({
  args: { event: v.any() },
  handler: async (ctx, { event }) => audit.recordBackendEvent(ctx as never, event),
})

const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './account.js': () => Promise.resolve({ ...account.api }),
  './audit.js': () => Promise.resolve({ ...audit.api, recorder }),
  './plain.js': () => Promise.resolve({ ...plain.api }),
})

const ref = <K extends 'query' | 'mutation'>(kind: K, path: string) => makeFunctionReference<K, any, any>(path)

describe('the first run', () => {
  let t: ReturnType<typeof testApp>

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    t = testApp()
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('is not done for a new account, and completing it stamps the time once', async () => {
    const ada = await asUser(t)
    expect(await ada.query(ref('query', 'account:getOnboarding'), {})).toEqual({ onboardedAt: null })
    const first = await ada.mutation(ref('mutation', 'account:completeOnboarding'), {}) as { onboardedAt: number }
    expect(first.onboardedAt).toBeCloseTo(Date.now(), -2)
    vi.advanceTimersByTime(60_000)
    // Skipping after finishing keeps the first time.
    expect(await ada.mutation(ref('mutation', 'account:completeOnboarding'), {})).toEqual(first)
    expect(await ada.query(ref('query', 'account:getOnboarding'), {})).toEqual(first)
  })

  test('is each account\'s own: another account is still to be onboarded', async () => {
    const ada = await asUser(t)
    const grace = await asUser(t)
    await ada.mutation(ref('mutation', 'account:completeOnboarding'), {})
    expect(await grace.query(ref('query', 'account:getOnboarding'), {})).toEqual({ onboardedAt: null })
  })

  test('reads nothing for a signed-out caller, and refuses to complete', async () => {
    expect(await t.query(ref('query', 'account:getOnboarding'), {})).toBeNull()
    const error = await t.mutation(ref('mutation', 'account:completeOnboarding'), {}).catch((caught: unknown) => caught)
    expect(getBackendError(error)).toMatchObject({ code: 'unauthenticated' })
  })

  test('an administrator acting as the account reads the state but cannot finish it', async () => {
    const admin = await asUser(t, { role: 'admin', workspace: false })
    const visited = await asUser(t, { impersonatedBy: admin.userId })
    expect(await visited.query(ref('query', 'account:getOnboarding'), {})).toEqual({ onboardedAt: null })
    const error = await visited.mutation(ref('mutation', 'account:completeOnboarding'), {}).catch((caught: unknown) => caught)
    expect(getBackendError(error)).toMatchObject({ code: 'forbidden', data: { reason: 'impersonating' } })
    expect(await visited.query(ref('query', 'account:getOnboarding'), {})).toEqual({ onboardedAt: null })
  })
})

describe('the activation checklist', () => {
  let t: ReturnType<typeof testApp>

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    t = testApp()
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const read = (caller: Pick<Awaited<ReturnType<typeof asUser>>, 'query'>) => caller.query(ref('query', 'audit:getActivation'), {}) as Promise<unknown>

  test('reads nothing without a sign-in, and no tasks without a checklist', async () => {
    expect(await t.query(ref('query', 'audit:getActivation'), {})).toBeNull()
    const ada = await asUser(t)
    expect(await ada.query(ref('query', 'plain:getActivation'), {})).toEqual({ tasks: [], done: 0, total: 0, progress: 0, isComplete: false, isDismissed: false, readOnly: false })
  })

  test('lists each task open, with its progress', async () => {
    const ada = await asUser(t)
    expect(await read(ada)).toEqual({
      tasks: [
        { key: 'photo', label: 'Upload a photo', to: '/studio/photos', scope: 'person', done: false, doneAt: null },
        { key: 'strip', label: 'activation.strip', to: null, scope: 'person', done: false, doneAt: null },
        { key: 'invite', label: 'Invite a co-author', to: null, scope: 'workspace', done: false, doneAt: null },
      ],
      done: 0,
      total: 3,
      progress: 0,
      isComplete: false,
      isDismissed: false,
      readOnly: false,
    })
  })

  test('ticks a task off the first time its event is recorded for the person, and no one else\'s', async () => {
    const ada = await asUser(t)
    const grace = await asUser(t)
    await ada.mutation(ref('mutation', 'audit:recorder'), { event: { type: 'app.photo_uploaded' } })
    vi.advanceTimersByTime(5_000)
    await ada.mutation(ref('mutation', 'audit:recorder'), { event: { type: 'app.photo_uploaded' } })
    const view = await read(ada) as { tasks: Array<{ key: string, done: boolean, doneAt: number | null }>, done: number, progress: number }
    expect(view.done).toBe(1)
    expect(view.progress).toBeCloseTo(1 / 3)
    // The first recording counts, not the second.
    expect(view.tasks[0]).toMatchObject({ key: 'photo', done: true })
    expect(view.tasks[0]!.doneAt).toBeLessThan(Date.now())
    expect((await read(grace) as { done: number }).done).toBe(0)
  })

  test('a workspace task ticks for any member of the workspace they are in', async () => {
    const workspaceId = await seedWorkspace(t, { name: 'Acme' })
    const owner = await asUser(t, { workspace: workspaceId, workspaceRole: 'owner' })
    const member = await asUser(t, { workspace: workspaceId, workspaceRole: 'member' })
    const elsewhere = await asUser(t)
    await owner.mutation(ref('mutation', 'audit:recorder'), { event: { type: 'workspace.member_invited', entityId: workspaceId, data: { role: 'member' } } })
    const tasksOf = async (caller: typeof owner) => (await read(caller) as { tasks: Array<{ key: string, done: boolean }> }).tasks.find(task => task.key === 'invite')
    expect(await tasksOf(member)).toMatchObject({ done: true })
    expect(await tasksOf(owner)).toMatchObject({ done: true })
    expect(await tasksOf(elsewhere)).toMatchObject({ done: false })
    // Removed from the workspace, the member reads it open, though their token still names it.
    await t.mutation(components.backend.adapter.deleteOne, { input: { model: 'member', where: [{ field: 'organizationId', value: workspaceId }, { field: 'userId', value: member.userId }] } } as never)
    expect(await tasksOf(member)).toMatchObject({ done: false })
  })

  test('an event recorded while an administrator acted as the person does not tick a task', async () => {
    const admin = await asUser(t, { role: 'admin', workspace: false })
    const visited = await asUser(t, { impersonatedBy: admin.userId })
    await visited.mutation(ref('mutation', 'audit:recorder'), { event: { type: 'app.strip_generated' } })
    expect((await read(visited) as { done: number }).done).toBe(0)
    const ada = await asUser(t)
    await ada.mutation(ref('mutation', 'audit:recorder'), { event: { type: 'app.strip_generated' } })
    expect((await read(ada) as { done: number }).done).toBe(1)
  })

  test('is complete when every task is done', async () => {
    const workspaceId = await seedWorkspace(t, { name: 'Acme' })
    const ada = await asUser(t, { workspace: workspaceId, workspaceRole: 'owner' })
    for (const event of [{ type: 'app.photo_uploaded' }, { type: 'app.strip_generated' }, { type: 'workspace.member_invited', entityId: workspaceId, data: { role: 'member' } }]) {
      await ada.mutation(ref('mutation', 'audit:recorder'), { event })
    }
    expect(await read(ada)).toMatchObject({ done: 3, total: 3, progress: 1, isComplete: true, isDismissed: false })
  })

  test('dismissing keeps the checklist away for good, and twice changes nothing', async () => {
    const ada = await asUser(t)
    await ada.mutation(ref('mutation', 'audit:dismissActivation'), {})
    expect(await read(ada)).toMatchObject({ isDismissed: true })
    await ada.mutation(ref('mutation', 'audit:dismissActivation'), {})
    expect(await read(ada)).toMatchObject({ isDismissed: true })
    expect(await read(await asUser(t))).toMatchObject({ isDismissed: false })
  })

  test('an administrator\'s visit reads the progress read-only, and dismissing is refused', async () => {
    const admin = await asUser(t, { role: 'admin', workspace: false })
    const visited = await asUser(t, { impersonatedBy: admin.userId })
    expect(await read(visited)).toMatchObject({ readOnly: true, isDismissed: false })
    const error = await visited.mutation(ref('mutation', 'audit:dismissActivation'), {}).catch((caught: unknown) => caught)
    expect(getBackendError(error)).toMatchObject({ code: 'forbidden', data: { reason: 'impersonating' } })
    expect(await read(visited)).toMatchObject({ isDismissed: false })
  })

  test('refuses dismissing without a sign-in', async () => {
    const error = await t.mutation(ref('mutation', 'audit:dismissActivation'), {}).catch((caught: unknown) => caught)
    expect(getBackendError(error)).toMatchObject({ code: 'unauthenticated' })
  })
})

describe('defineActivation', () => {
  const task = (key: string, extra: Record<string, unknown> = {}) => ({ key, label: `Task ${key}`, done: 'app.did_it', ...extra })

  test('takes three to seven tasks and keeps their order', () => {
    expect(defineActivation([task('a'), task('b'), task('c')]).tasks.map(entry => entry.key)).toEqual(['a', 'b', 'c'])
    expect(defineActivation(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(key => task(key))).tasks).toHaveLength(7)
  })

  test.each([
    ['fewer than three', [task('a'), task('b')], /holds 3 to 7 tasks, and this one has 2/],
    ['more than seven', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(key => task(key)), /holds 3 to 7 tasks, and this one has 8/],
    ['a repeated key', [task('a'), task('b'), task('a')], /share the key `a`/],
    ['a kind that is neither the package\'s nor app.*', [task('a'), task('b'), task('c', { done: 'strip.published' })], /`done: strip\.published`/],
    ['a package kind that does not exist', [task('a'), task('b'), task('c', { done: 'workspace.member_invted' })], /`done: workspace\.member_invted`/],
    ['a link to a script', [task('a'), task('b'), task('c', { to: 'javascript:alert(1)' })], /`to` that is neither a path/],
    ['a link to another host without a scheme', [task('a'), task('b'), task('c', { to: '//example.test/x' })], /`to` that is neither a path/],
    ['a scope that is not one', [task('a'), task('b'), task('c', { scope: 'team' })], /`scope`/],
    ['an empty label', [task('a'), task('b'), task('c', { label: '  ' })], /needs a `label`/],
    ['a key with spaces', [task('a'), task('b'), task('not a key')], /needs a `key`/],
  ])('throws on %s, naming the problem', (_name, tasks, message) => {
    expect(() => defineActivation(tasks as never)).toThrow(message)
  })

  test('accepts an https link and a path', () => {
    expect(defineActivation([task('a', { to: '/studio' }), task('b', { to: 'https://example.com/guide' }), task('c')]).tasks).toHaveLength(3)
  })
})
