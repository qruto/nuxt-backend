/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, makeFunctionReference, mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { getBackendError } from '../../src/convex/errors'
import { setupAccount } from '../../src/convex/integrations/account'
import { setupAudit } from '../../src/convex/integrations/audit'
import { LAUNCH_NEWS_KIND } from '../../src/convex/consent-rules'

// The consent ledger through `setupAccount({ consents, minimumAge })`: what
// sign-up records, what a person grants and withdraws, what a function reads,
// the age check's single row, and the consents an address gave before it had
// an account. The auth routes that call the sign-up gate run in
// test/unit/consent-auth-flow.test.ts.

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const audit = setupAudit(components as never)
const account = setupAccount(components as never, {
  audit,
  minimumAge: 16,
  consents: {
    terms: { version: '2026-10-01', url: '/terms', required: true },
    privacy: { version: '2026-10-01', url: '/privacy', required: true },
    gallery: { version: '2026-10-01', url: '/gallery-rules' },
  },
})

const consentedFn = queryGeneric({ args: { userId: v.string(), kind: v.string() }, handler: async (ctx, args) => account.consented(ctx as never, args) })
const requireFn = mutationGeneric({ args: { userId: v.string() }, handler: async (ctx, args) => account.requireConsent(ctx as never, args) })
const signUpFn = mutationGeneric({ args: { userId: v.string(), email: v.string(), agreed: v.optional(v.boolean()) }, handler: async (ctx, args) => account.gate.signUp(ctx as never, args) })
const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './account.js': () => Promise.resolve({ ...account.api, consented: consentedFn, requireConsent: requireFn, signUp: signUpFn }),
})

const query = (name: string) => makeFunctionReference<'query', any, any>(`account:${name}`)

const mutation = (name: string) => makeFunctionReference<'mutation', any, any>(`account:${name}`)
const getConsents = query('getConsents')
const grantConsent = mutation('grantConsent')
const withdrawConsent = mutation('withdrawConsent')
const chooseStorage = mutation('chooseStorage')

describe('the consent ledger', () => {
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

  const activity = () => t.query(components.backend.audit.list, { view: { kind: 'all', viewerId: 'reader' }, paginationOpts: { numItems: 50, cursor: null } })
  /** An account's decisions, oldest first. */
  const ledger = (userId: string) => t.query(components.backend.consents.history, { userId }) as Promise<Array<Record<string, unknown>>>

  test('records each required kind at its version, and the age check at the minimum, when the account is created', async () => {
    const ada = await asUser(t)
    await t.mutation(mutation('signUp'), { userId: ada.userId, email: ada.email })
    expect(await ledger(ada.userId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'terms', version: '2026-10-01', granted: true, source: 'sign-up' }),
      expect.objectContaining({ kind: 'privacy', version: '2026-10-01', granted: true, source: 'sign-up' }),
      expect.objectContaining({ kind: 'age', version: '16', granted: true, source: 'sign-up' }),
    ]))
    expect(await ledger(ada.userId)).toHaveLength(3)
    // Not an optional kind.
    expect(JSON.stringify(await ledger(ada.userId))).not.toContain('gallery')
    const view = await ada.query(getConsents, {})
    expect(view).toMatchObject({ missing: [], storage: null, minimumAge: 16 })
    expect(view.consents.map((consent: { kind: string }) => consent.kind)).toEqual(['terms', 'privacy', 'gallery'])
    expect(view.consents[0]).toMatchObject({ kind: 'terms', version: '2026-10-01', url: '/terms', required: true, current: true, grantedVersion: '2026-10-01' })
    expect(view.consents[2]).toMatchObject({ kind: 'gallery', required: false, current: false, grantedVersion: null, grantedAt: null })
    // Each decision lands on the trail, without the account's address.
    const types = (await activity()).page.map((event: { type: string }) => event.type)
    expect(types.filter((type: string) => type === 'consent.granted')).toHaveLength(3)
    // A second run records nothing new.
    await t.mutation(mutation('signUp'), { userId: ada.userId, email: ada.email })
    expect(await ledger(ada.userId)).toHaveLength(3)
  })

  test('records nothing for an account an administrator created, which is asked at its first visit', async () => {
    const grace = await asUser(t)
    await t.mutation(mutation('signUp'), { userId: grace.userId, email: grace.email, agreed: false })
    expect(await ledger(grace.userId)).toEqual([])
    expect(await grace.query(getConsents, {})).toMatchObject({ missing: ['terms', 'privacy', 'age'] })
  })

  test('asks again after a version rises, and not for an optional kind', async () => {
    const ada = await asUser(t)
    await t.mutation(mutation('signUp'), { userId: ada.userId, email: ada.email })
    // The terms were accepted at an earlier version (a decision after sign-up, as an older deployment wrote it).
    vi.advanceTimersByTime(1000)
    await t.mutation(components.backend.consents.record, { userId: ada.userId, entries: [{ kind: 'terms', version: '2025-01-01', granted: true, source: 'prompt' }] })
    expect(await ada.query(getConsents, {})).toMatchObject({ missing: ['terms'] })
    await ada.mutation(grantConsent, { kind: 'terms', source: 'prompt' })
    expect(await ada.query(getConsents, {})).toMatchObject({ missing: [] })
    // The history keeps both decisions.
    expect((await ledger(ada.userId)).filter(row => row.kind === 'terms').map(row => row.version)).toEqual(['2026-10-01', '2025-01-01', '2026-10-01'])
  })

  test('grants and withdraws an opt-in, one row each, and a required kind can\'t be withdrawn', async () => {
    const ada = await asUser(t)
    await ada.mutation(grantConsent, { kind: 'gallery' })
    await ada.mutation(grantConsent, { kind: 'gallery' })
    expect((await ada.query(getConsents, {})).consents.find((consent: { kind: string }) => consent.kind === 'gallery')).toMatchObject({ current: true })
    expect(await t.query(query('consented'), { userId: ada.userId, kind: 'gallery' })).toBe(true)
    await ada.mutation(withdrawConsent, { kind: 'gallery' })
    await ada.mutation(withdrawConsent, { kind: 'gallery' })
    expect(await t.query(query('consented'), { userId: ada.userId, kind: 'gallery' })).toBe(false)
    expect((await ledger(ada.userId)).filter(row => row.kind === 'gallery').map(row => [row.granted, row.source])).toEqual([[true, 'settings'], [false, 'settings']])
    expect((await activity()).page.map((event: { type: string }) => event.type).sort()).toEqual(['consent.granted', 'consent.withdrawn'])

    expect(await ada.mutation(withdrawConsent, { kind: 'terms' }).then(() => null, getBackendError)).toMatchObject({ code: 'invalid_input', data: { field: 'kind', reason: 'required' } })
    expect(await ada.mutation(grantConsent, { kind: 'newsletter' }).then(() => null, getBackendError)).toMatchObject({ code: 'invalid_input', data: { field: 'kind' } })
    // A package kind is no kind of the app's to grant by name.
    expect(await ada.mutation(grantConsent, { kind: 'storage' }).then(() => null, getBackendError)).toMatchObject({ code: 'invalid_input', data: { field: 'kind' } })
    expect(await t.query(query('consented'), { userId: ada.userId, kind: 'typo' }).then(() => null, getBackendError)).toMatchObject({ code: 'invalid_input', data: { field: 'kind' } })
  })

  test('refuses an administrator acting as the account, and nobody signed in', async () => {
    const admin = await asUser(t, { role: 'admin', workspace: false })
    const visited = await asUser(t, { impersonatedBy: admin.userId })
    expect(await visited.mutation(grantConsent, { kind: 'terms' }).then(() => null, getBackendError)).toMatchObject({ code: 'forbidden', data: { reason: 'impersonating' } })
    expect(await visited.mutation(withdrawConsent, { kind: 'gallery' }).then(() => null, getBackendError)).toMatchObject({ code: 'forbidden', data: { reason: 'impersonating' } })
    expect(await visited.mutation(chooseStorage, { purposes: ['analytics'] }).then(() => null, getBackendError)).toMatchObject({ code: 'forbidden', data: { reason: 'impersonating' } })
    expect(await visited.query(getConsents, {})).toBeNull()
    expect(await t.mutation(grantConsent, { kind: 'terms' }).then(() => null, getBackendError)).toMatchObject({ code: 'unauthenticated' })
    expect(await t.query(getConsents, {})).toBeNull()
    expect(await ledger(visited.userId)).toEqual([])
  })

  test('refuses a function until every required kind is accepted at its latest version', async () => {
    const ada = await asUser(t)
    expect(await t.mutation(mutation('requireConsent'), { userId: ada.userId }).then(() => null, getBackendError)).toMatchObject({ code: 'forbidden', data: { reason: 'consent_required', kind: 'terms' } })
    await t.mutation(mutation('signUp'), { userId: ada.userId, email: ada.email })
    await expect(t.mutation(mutation('requireConsent'), { userId: ada.userId })).resolves.toBeNull()
  })

  test('keeps the choice of optional storage as one row each time, and only for purposes that exist', async () => {
    const ada = await asUser(t)
    await ada.mutation(chooseStorage, { purposes: ['replay', 'preferences'] })
    expect(await ada.query(getConsents, {})).toMatchObject({ storage: ['preferences', 'replay'] })
    await ada.mutation(chooseStorage, { purposes: [] })
    expect(await ada.query(getConsents, {})).toMatchObject({ storage: [] })
    await ada.mutation(chooseStorage, { purposes: [] })
    expect((await ledger(ada.userId)).filter(row => row.kind === 'storage').map(row => [row.version, row.granted])).toEqual([['preferences,replay', true], ['none', false]])
    expect(await ada.mutation(chooseStorage, { purposes: ['tracking'] }).then(() => null, getBackendError)).toMatchObject({ code: 'invalid_input', data: { field: 'purposes' } })
    const types = (await activity()).page.map((event: { type: string }) => event.type)
    expect(types.sort()).toEqual(['consent.granted', 'consent.withdrawn'])
  })

  test('asks an existing account its age once, keeps only that it passed the minimum, and refuses an age under it', async () => {
    const ada = await asUser(t)
    await ada.mutation(grantConsent, { kind: 'terms' })
    await ada.mutation(grantConsent, { kind: 'privacy' })
    expect(await ada.query(getConsents, {})).toMatchObject({ missing: ['age'] })
    expect(await ada.mutation(grantConsent, { kind: 'age', age: 15 }).then(() => null, getBackendError)).toMatchObject({ code: 'forbidden', data: { reason: 'under_age' } })
    expect(await ada.mutation(grantConsent, { kind: 'age', age: 200 }).then(() => null, getBackendError)).toMatchObject({ code: 'invalid_input', data: { field: 'age' } })
    expect((await ledger(ada.userId)).filter(row => row.kind === 'age')).toEqual([])
    await ada.mutation(grantConsent, { kind: 'age', age: 34 })
    expect((await ledger(ada.userId)).filter(row => row.kind === 'age')).toEqual([expect.objectContaining({ version: '16', granted: true, source: 'prompt' })])
    // The age itself is never kept: no field of any row holds it (timestamps may contain its digits).
    expect((await ledger(ada.userId)).flatMap(row => Object.values(row))).not.toContain(34)
    expect((await ledger(ada.userId)).flatMap(row => Object.values(row))).not.toContain('34')
    expect(await ada.query(getConsents, {})).toMatchObject({ missing: [] })
    // Raising the minimum asks again; lowering it does not.
    const raised = setupAccount(components as never, { minimumAge: 18 })
    expect(raised.gate.minimumAge).toBe(18)
  })

  test('carries what an address agreed to before sign-up over to the account', async () => {
    const email = 'friend@example.com'
    await t.mutation(components.backend.consents.record, { email, entries: [{ kind: LAUNCH_NEWS_KIND, version: 'waitlist', granted: true, source: 'waitlist', text: 'Email me when it launches' }] })
    const friend = await asUser(t, { email })
    expect(await ledger(friend.userId)).toEqual([])
    await t.mutation(mutation('signUp'), { userId: friend.userId, email: 'Friend@Example.com' })
    const mine = await ledger(friend.userId)
    expect(mine.map(row => row.kind).sort()).toEqual(['age', 'launch-news', 'privacy', 'terms'])
    expect(mine.find(row => row.kind === 'launch-news')).toMatchObject({ source: 'waitlist', text: 'Email me when it launches' })
    // The first row stays the first: what the address gave comes before what the account agreed to.
    expect(mine[0]).toMatchObject({ kind: 'launch-news' })
  })

  test('exports the account\'s rows, oldest first', async () => {
    const ada = await asUser(t)
    await t.mutation(mutation('signUp'), { userId: ada.userId, email: ada.email })
    vi.advanceTimersByTime(1000)
    await ada.mutation(grantConsent, { kind: 'gallery' })
    const data = await t.query(components.backend.account.exportData, { userId: ada.userId }) as { consents: Array<{ kind: string }> }
    expect(data.consents.map(row => row.kind).sort()).toEqual(['age', 'gallery', 'privacy', 'terms'])
    expect(data.consents.at(-1)!.kind).toBe('gallery')
    expect(data.consents[0]).not.toHaveProperty('userId')
  })

  test('refuses a declaration that is no kind, or names one the package keeps', () => {
    expect(() => setupAccount(components as never, { consents: { Terms: { version: '1' } } })).toThrow(/no kind name/)
    expect(() => setupAccount(components as never, { consents: { storage: { version: '1' } } })).toThrow(/keeps for its own/)
    expect(() => setupAccount(components as never, { consents: { terms: { version: '' } } })).toThrow(/needs a `version`/)
    expect(() => setupAccount(components as never, { minimumAge: 0 })).toThrow(/whole number of years/)
  })
})
