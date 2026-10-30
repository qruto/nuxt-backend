/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { actionGeneric, componentsGeneric, defineSchema, makeFunctionReference, mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import { asUser, defineBackendTestApp, seedWorkspace } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { RECENT_SIGN_IN_SECONDS } from '../../src/convex/constants'
import { FLAG_ROWS_MAX } from '../../src/convex/flags'
import { getBackendError } from '../../src/convex/errors'
import { setupAi } from '../../src/convex/integrations/ai'
import { type AuditPage, setupAudit } from '../../src/convex/integrations/audit'
import { setupBilling } from '../../src/convex/integrations/billing'
import { type AdminFlag, defineFlags, type FlagOverride, type FlagValues, flagBucket, setupFlags } from '../../src/convex/integrations/flags'

// Feature flags over the mounted component: the app's own instance (as
// `backend/flags.ts` builds it) evaluated inside queries and mutations for
// each kind of caller, the admin console's list and its one write, which
// takes an administrator in person with a recent sign-in and lands on the
// activity trail, and the kill switches the package honors on its own server
// paths: checkout, gift purchases and metered AI. Sign-ups are held on Better
// Auth's routes (test/unit/flags-auth-flow.test.ts). Who gets
// through each function is also held by the probe suite, through the
// scaffold's backend/flags.ts.

const SITE = 'http://localhost:3000'
const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const audit = setupAudit(components as never)
// A catalog with one plan in two intervals and a pack, as `billing sync` writes it.
const catalog = { sandbox: { products: { 'pro': 'prod_pro', 'pro:year': 'prod_pro_year', 'credits100': 'prod_pack' }, packs: ['credits100'] } }
const billing = setupBilling(components as never, { email: { sendTemplate: async () => 'email_1' } as never, catalog: catalog as never })
const ai = setupAi(components as never, { billing })
// Administrators named by id, as setupAdmin and setupAuth({ admin }) take them: filled as a test goes.
const namedAdministrators: string[] = []
const flags = setupFlags(components as never, {
  flags: defineFlags({
    newEditor: { default: false, description: 'The rewritten editor.' },
    boards: { default: false, description: 'Shared boards.', by: 'workspace' },
    tips: { default: true, description: 'The hints.' },
  }),
  audit,
  billing,
  adminUserIds: namedAdministrators,
})
// The same app after a release that dropped `newEditor` from its code.
const nextRelease = setupFlags(components as never, {
  flags: defineFlags({ tips: { default: true, description: 'The hints.' } }),
  audit,
})

const readFlag = queryGeneric({ args: { key: v.string() }, handler: async (ctx, { key }) => flags.isEnabled(ctx, key as 'newEditor') })
const readFor = queryGeneric({ args: { key: v.string(), userId: v.string() }, handler: async (ctx, { key, userId }) => flags.isEnabled(ctx, key as 'newEditor', { userId }) })
const guarded = mutationGeneric({ args: {}, handler: async (ctx) => {
  await flags.requireFlag(ctx, 'newEditor')
  return 'through'
} })
const checkout = actionGeneric({ args: {}, handler: async ctx => billing.checkout(ctx, { productIds: ['prod_pro'], origin: SITE, successUrl: `${SITE}/billing` }) })
const changePlan = actionGeneric({ args: {}, handler: async ctx => billing.updateSubscription(ctx, { productId: 'prod_pro_year' }) })
const cancelPlan = actionGeneric({ args: {}, handler: async ctx => billing.cancelSubscription(ctx) })
const generate = ai.meteredAction({ meter: false, args: {}, handler: async () => 'ran' })
// The same call on an app that caps what AI costs it a day.
const capped = setupAi(components as never, { billing, spendLimit: { usdPerDay: 5 } })
const generateCapped = capped.meteredAction({ meter: false, args: {}, handler: async () => 'ran' })

const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './flags.js': () => Promise.resolve({ ...flags.api, readFlag, readFor, guarded }),
  './next.js': () => Promise.resolve(nextRelease.api),
  './audit.js': () => Promise.resolve(audit.api),
  './billing.js': () => Promise.resolve({ checkout, changePlan, cancelPlan, giftCheckout: billing.api.giftCheckout }),
  './ai.js': () => Promise.resolve({ generate, generateCapped }),
})
type App = ReturnType<typeof testApp>

const getFlags = makeFunctionReference<'query', Record<string, never>, FlagValues>('flags:getFlags')
const listFlags = makeFunctionReference<'query', Record<string, never>, AdminFlag[] | null>('flags:listFlags')
const setFlag = makeFunctionReference<'mutation', { key: string, override: FlagOverride | null }, null>('flags:setFlag')
const readFlagRef = makeFunctionReference<'query', { key: string }, boolean>('flags:readFlag')
const readForRef = makeFunctionReference<'query', { key: string, userId: string }, boolean>('flags:readFor')
const guardedRef = makeFunctionReference<'mutation', Record<string, never>, string>('flags:guarded')
const listActivity = makeFunctionReference<'query', { paginationOpts: { numItems: number, cursor: string | null } }, AuditPage | null>('audit:listActivity')
const nextListFlags = makeFunctionReference<'query', Record<string, never>, AdminFlag[] | null>('next:listFlags')
const nextSetFlag = makeFunctionReference<'mutation', { key: string, override: FlagOverride | null }, null>('next:setFlag')
const checkoutRef = makeFunctionReference<'action', Record<string, never>, { url: string }>('billing:checkout')
const changePlanRef = makeFunctionReference<'action'>('billing:changePlan')
const cancelPlanRef = makeFunctionReference<'action'>('billing:cancelPlan')
const giftCheckoutRef = makeFunctionReference<'action'>('billing:giftCheckout')
const generateRef = makeFunctionReference<'action', Record<string, never>, string>('ai:generate')

let t: App

beforeEach(() => {
  t = testApp()
  // Nothing here reaches a provider: a call past its pause fails on the missing token.
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'NotPermitted' }, { status: 403 })))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  namedAdministrators.length = 0
})

/** An administrator, recently signed in. */
const administrator = (app: App = t) => asUser(app, { role: 'admin' })

/** Store an override as an administrator would, from the Flags tab. */
async function override(key: string, value: FlagOverride | null) {
  await (await administrator()).mutation(setFlag, { key, override: value })
}

/** The refusal a call threw, as the client reads it. */
async function refusalOf(call: Promise<unknown>) {
  try {
    await call
  }
  catch (error) {
    return getBackendError(error)
  }
  return null
}

describe('evaluation inside a function', () => {
  test('holds each flag at its default until an override is stored, for anyone, signed in or not', async () => {
    const ada = await asUser(t)
    expect(await ada.query(readFlagRef, { key: 'newEditor' })).toBe(false)
    expect(await ada.query(readFlagRef, { key: 'tips' })).toBe(true)
    expect(await t.query(readFlagRef, { key: 'tips' })).toBe(true)
    expect((await t.query(getFlags, {})).flags).toEqual({ pause_signups: false, pause_checkout: false, pause_ai: false, maintenance: false, newEditor: false, boards: false, tips: true })
  })

  test('turns a flag on for the account, the workspace and the plan it targets, and for no one else', async () => {
    const ada = await asUser(t)
    const acme = await seedWorkspace(t, { name: 'Acme' })
    const bob = await asUser(t, { workspace: acme })
    const cleo = await asUser(t)
    const dan = await asUser(t)
    // Dan's workspace is on Pro, yearly: the plan is `pro` whichever interval it was bought in.
    await t.mutation(components.backend.billing.upsert, { userId: dan.workspaceId!, activeProductIds: ['prod_pro_year', 'prod_pack'], benefits: [], meters: [] })
    await override('newEditor', { users: [ada.userId], workspaces: [acme], plans: ['pro'] })
    expect(await ada.query(readFlagRef, { key: 'newEditor' })).toBe(true)
    expect(await bob.query(readFlagRef, { key: 'newEditor' })).toBe(true)
    expect(await dan.query(readFlagRef, { key: 'newEditor' })).toBe(true)
    expect(await cleo.query(readFlagRef, { key: 'newEditor' })).toBe(false)
    expect(await t.query(readFlagRef, { key: 'newEditor' })).toBe(false)
    expect((await dan.query(getFlags, {})).flags.newEditor).toBe(true)
    // A subject the function names, outside any caller: its own targets, never the caller's.
    expect(await cleo.query(readForRef, { key: 'newEditor', userId: ada.userId })).toBe(true)
    expect(await ada.query(readForRef, { key: 'newEditor', userId: cleo.userId })).toBe(false)
  })

  test('rolls out to the accounts whose bucket is under the share, the same ones on every read', async () => {
    const users = await Promise.all(Array.from({ length: 12 }, () => asUser(t)))
    await override('newEditor', { rollout: 50 })
    for (const user of users) {
      const expected = flagBucket('newEditor', user.userId) < 5000
      expect(await user.query(readFlagRef, { key: 'newEditor' }), user.userId).toBe(expected)
      expect((await user.query(getFlags, {})).flags.newEditor).toBe(expected)
    }
  })

  test('rolls a workspace flag out by the active workspace', async () => {
    const acme = await seedWorkspace(t, { name: 'Acme' })
    const members = await Promise.all([asUser(t, { workspace: acme }), asUser(t, { workspace: acme }), asUser(t, { workspace: acme })])
    await override('boards', { rollout: flagBucket('boards', acme) < 5000 ? 50 : 100 })
    for (const member of members) expect(await member.query(readFlagRef, { key: 'boards' })).toBe(true)
  })

  test('reads the workspace only while the caller is still a member of it, whatever the token says', async () => {
    const acme = await seedWorkspace(t, { name: 'Acme' })
    const bob = await asUser(t, { workspace: acme })
    await override('newEditor', { workspaces: [acme] })
    await override('boards', { rollout: 100 })
    expect(await bob.query(readFlagRef, { key: 'newEditor' })).toBe(true)
    expect(await bob.query(readFlagRef, { key: 'boards' })).toBe(true)
    // Removed from Acme: the session still names it as the active workspace.
    await t.mutation(components.backend.adapter.deleteOne, { input: { model: 'member', where: [{ field: 'organizationId', value: acme }, { field: 'userId', value: bob.userId }] } } as never)
    expect(await bob.query(readFlagRef, { key: 'newEditor' })).toBe(false)
    expect(await bob.query(readFlagRef, { key: 'boards' })).toBe(false)
    expect((await bob.query(getFlags, {})).flags).toMatchObject({ newEditor: false, boards: false })
  })

  test('refuses a call behind a flag that is off for the caller as forbidden, flag_off, and lets it through once on', async () => {
    const ada = await asUser(t)
    expect(await refusalOf(ada.mutation(guardedRef, {}))).toMatchObject({ code: 'forbidden', data: { reason: 'flag_off' } })
    await override('newEditor', { users: [ada.userId] })
    expect(await ada.mutation(guardedRef, {})).toBe('through')
  })

  test('throws on a key the app never declared: a mistake in its code', async () => {
    const ada = await asUser(t)
    await expect(ada.query(readFlagRef, { key: 'oldEditor' })).rejects.toThrow(/`oldEditor` is no flag/)
  })
})

describe('the admin console\'s list and write', () => {
  test('lists the package\'s own flags first, then the app\'s, each with its override, for an administrator only', async () => {
    const root = await administrator()
    await root.mutation(setFlag, { key: 'newEditor', override: { enabled: true } })
    const list = await root.query(listFlags, {})
    expect(list?.map(flag => [flag.key, flag.builtIn])).toEqual([['pause_signups', true], ['pause_checkout', true], ['pause_ai', true], ['maintenance', true], ['newEditor', false], ['boards', false], ['tips', false]])
    expect(list?.find(flag => flag.key === 'newEditor')).toMatchObject({ default: false, by: 'user', override: { enabled: true }, updatedAt: expect.any(Number) })
    expect(list?.find(flag => flag.key === 'boards')).toMatchObject({ by: 'workspace', override: null, updatedAt: null })
    expect(await (await asUser(t)).query(listFlags, {})).toBeNull()
    expect(await t.query(listFlags, {})).toBeNull()
    const visit = await asUser(t, { role: 'admin', impersonatedBy: root.userId })
    expect(await visit.query(listFlags, {})).toBeNull()
  })

  test('takes a change from an administrator in person with a recent sign-in, and refuses everyone else', async () => {
    const change = { key: 'pause_checkout', override: { enabled: true } }
    expect(await refusalOf(t.mutation(setFlag, change))).toMatchObject({ code: 'unauthenticated' })
    expect(await refusalOf((await asUser(t)).mutation(setFlag, change))).toMatchObject({ code: 'forbidden', data: { reason: 'admin_only' } })
    const root = await administrator()
    expect(await refusalOf((await asUser(t, { role: 'admin', impersonatedBy: root.userId })).mutation(setFlag, change))).toMatchObject({ code: 'forbidden', data: { reason: 'impersonating' } })
    const stale = await asUser(t, { role: 'admin', signedInAt: Date.now() - (RECENT_SIGN_IN_SECONDS + 60) * 1000 })
    expect(await refusalOf(stale.mutation(setFlag, change))).toMatchObject({ code: 'reauthentication_required' })
    // Nothing of it was stored.
    expect((await t.query(getFlags, {})).flags.pause_checkout).toBe(false)
    await root.mutation(setFlag, change)
    expect((await t.query(getFlags, {})).flags.pause_checkout).toBe(true)
  })

  test('lets in an administrator named by id, as the rest of the console does', async () => {
    const named = await asUser(t)
    expect(await named.query(listFlags, {})).toBeNull()
    namedAdministrators.push(named.userId)
    expect(await named.query(listFlags, {})).toHaveLength(7)
    await named.mutation(setFlag, { key: 'pause_ai', override: { enabled: true } })
    expect((await t.query(getFlags, {})).flags.pause_ai).toBe(true)
  })

  test('lists an override the code no longer declares, takes nothing for it but its removal, and records that', async () => {
    const root = await administrator()
    await root.mutation(setFlag, { key: 'newEditor', override: { enabled: true } })
    // The next release dropped newEditor: its override stays, listed last, and turns nothing on.
    const listed = await root.query(nextListFlags, {})
    expect(listed?.map(flag => [flag.key, flag.declared])).toEqual([['pause_signups', true], ['pause_checkout', true], ['pause_ai', true], ['maintenance', true], ['tips', true], ['newEditor', false]])
    expect(listed?.at(-1)).toMatchObject({ builtIn: false, override: { enabled: true } })
    expect(await refusalOf(root.mutation(nextSetFlag, { key: 'newEditor', override: { enabled: false } }))).toMatchObject({ code: 'invalid_input', data: { field: 'key' } })
    // A key nothing was ever stored for has nothing to remove.
    expect(await refusalOf(root.mutation(nextSetFlag, { key: 'oldEditor', override: null }))).toMatchObject({ code: 'invalid_input', data: { field: 'key' } })
    await root.mutation(nextSetFlag, { key: 'newEditor', override: null })
    expect((await root.query(nextListFlags, {}))?.map(flag => flag.key)).not.toContain('newEditor')
    // Declared again, it starts from its default.
    expect(await root.query(readFlagRef, { key: 'newEditor' })).toBe(false)
    const page = await root.query(listActivity, { paginationOpts: { numItems: 5, cursor: null } })
    expect(page!.page.find(entry => entry.type === 'flag.changed')?.data).toEqual({ flag: 'newEditor', reset: true })
  })

  test('refuses a new override past the most the component holds, so every one is read', async () => {
    // Filling the cap takes FLAG_ROWS_MAX writes, longer than the default timeout under load.
    for (let index = 0; index < FLAG_ROWS_MAX; index++) {
      await t.mutation(components.backend.flags.set, { key: `flag_${index}`, override: { enabled: true } })
    }
    expect(await refusalOf(t.mutation(components.backend.flags.set, { key: 'one_more', override: { enabled: true } }))).toMatchObject({ code: 'invalid_input', data: { field: 'key', reason: 'too_many_overrides' } })
    // A stored one still changes, and goes.
    await t.mutation(components.backend.flags.set, { key: 'flag_0', override: { enabled: false } })
    await t.mutation(components.backend.flags.set, { key: 'flag_0', override: null })
    await t.mutation(components.backend.flags.set, { key: 'one_more', override: { enabled: true } })
  }, 60_000)

  test('refuses a key the app does not declare, targets on a kill switch and a message on any flag but the banner', async () => {
    const root = await administrator()
    expect(await refusalOf(root.mutation(setFlag, { key: 'oldEditor', override: { enabled: true } }))).toMatchObject({ code: 'invalid_input', data: { field: 'key' } })
    expect(await refusalOf(root.mutation(setFlag, { key: 'pause_ai', override: { users: ['someone'] } }))).toMatchObject({ code: 'invalid_input', data: { field: 'users' } })
    expect(await refusalOf(root.mutation(setFlag, { key: 'newEditor', override: { message: 'Hi' } }))).toMatchObject({ code: 'invalid_input', data: { field: 'message' } })
    expect(await refusalOf(root.mutation(setFlag, { key: 'newEditor', override: { rollout: 150 } }))).toMatchObject({ code: 'invalid_input', data: { field: 'rollout' } })
  })

  test('records every change on the administrator\'s activity as flag.changed: the flag and its state, never whom it targets', async () => {
    const root = await administrator()
    const ada = await asUser(t)
    await root.mutation(setFlag, { key: 'newEditor', override: { users: [ada.userId], plans: ['pro'], rollout: 10 } })
    await root.mutation(setFlag, { key: 'newEditor', override: null })
    await root.mutation(setFlag, { key: 'maintenance', override: { enabled: true, message: 'Back at 3 pm.' } })
    const page = await root.query(listActivity, { paginationOpts: { numItems: 10, cursor: null } })
    const changes = page!.page.filter(entry => entry.type === 'flag.changed')
    expect(changes.map(entry => entry.data)).toEqual([
      { flag: 'maintenance', enabled: true },
      { flag: 'newEditor', reset: true },
      { flag: 'newEditor', rollout: 10, targets: 2 },
    ])
    expect(changes[0]).toMatchObject({ actor: { kind: 'you', id: root.userId } })
    expect(JSON.stringify(page)).not.toContain(ada.userId)
    // The banner's message reaches every reader, signed in or not.
    expect((await t.query(getFlags, {})).maintenance).toEqual({ message: 'Back at 3 pm.' })
  })

  test('takes an erased account out of every flag\'s targets', async () => {
    const ada = await asUser(t)
    const bob = await asUser(t)
    await override('newEditor', { users: [ada.userId, bob.userId] })
    await override('tips', { enabled: false, users: [ada.userId] })
    await t.mutation(components.backend.flags.forgetUser, { userId: ada.userId })
    const list = await (await administrator()).query(listFlags, {})
    expect(list?.find(flag => flag.key === 'newEditor')?.override).toEqual({ users: [bob.userId] })
    expect(list?.find(flag => flag.key === 'tips')?.override).toEqual({ enabled: false })
  })
})

describe('the kill switches, where the package honors them', () => {
  test('pause_checkout refuses a checkout once the caller is known, before the provider hears of it', async () => {
    const owner = await asUser(t)
    // Off: the call goes past the switch, to the missing provider token.
    expect(await refusalOf(owner.action(checkoutRef, {}))).toMatchObject({ code: 'unavailable', data: { service: 'billing', reason: 'not_configured' } })
    await override('pause_checkout', { enabled: true })
    expect(await refusalOf(owner.action(checkoutRef, {}))).toMatchObject({ code: 'unavailable', data: { service: 'checkout', reason: 'checkout_paused' } })
    // Who is asking still comes first.
    expect(await refusalOf(t.action(checkoutRef, {}))).toMatchObject({ code: 'unauthenticated' })
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  test('pause_checkout refuses a plan switch too, and lets a cancellation through', async () => {
    const owner = await asUser(t)
    // Off: the switch goes past the pause, to the missing provider token.
    expect(await refusalOf(owner.action(changePlanRef, {}))).toMatchObject({ code: 'unavailable', data: { service: 'billing', reason: 'not_configured' } })
    await override('pause_checkout', { enabled: true })
    expect(await refusalOf(owner.action(changePlanRef, {}))).toMatchObject({ code: 'unavailable', data: { service: 'checkout', reason: 'checkout_paused' } })
    expect(await refusalOf(owner.action(cancelPlanRef, {}))).toMatchObject({ code: 'unavailable', data: { service: 'billing', reason: 'not_configured' } })
    expect(await refusalOf(t.action(changePlanRef, {}))).toMatchObject({ code: 'unauthenticated' })
  })

  test('pause_checkout refuses a gift purchase too', async () => {
    const owner = await asUser(t)
    await override('pause_checkout', { enabled: true })
    const gift = { pack: 'credits100', recipientEmail: 'friend@example.com', origin: SITE, successUrl: `${SITE}/billing` }
    expect(await refusalOf(owner.action(giftCheckoutRef, gift))).toMatchObject({ code: 'unavailable', data: { service: 'checkout', reason: 'checkout_paused' } })
  })

  test('pause_ai refuses a metered call before anything is counted, and only while it is on', async () => {
    const member = await asUser(t)
    expect(await member.action(generateRef, {})).toBe('ran')
    await override('pause_ai', { enabled: true })
    expect(await refusalOf(member.action(generateRef, {}))).toMatchObject({ code: 'unavailable', data: { service: 'ai', reason: 'ai_paused' } })
    expect(await refusalOf(t.action(generateRef, {}))).toMatchObject({ code: 'unauthenticated' })
    await override('pause_ai', null)
    expect(await member.action(generateRef, {})).toBe('ran')
  })

  test('a sandbox makes no metered call without a daily spend limit, before anything is counted', async () => {
    const member = await asUser(t)
    const cappedRef = makeFunctionReference<'action', Record<string, never>, string>('ai:generateCapped')
    vi.stubEnv('BACKEND_ENVIRONMENT', 'sandbox')
    expect(await refusalOf(member.action(generateRef, {}))).toMatchObject({ code: 'not_ready', data: { reason: 'no_budget' } })
    expect(await member.action(cappedRef, {})).toBe('ran')
    // Who is asking still comes first.
    expect(await refusalOf(t.action(generateRef, {}))).toMatchObject({ code: 'unauthenticated' })
    // A capped demo is paused as any app is (the administrator sets it off the sandbox: there, theirs is passkey-only).
    vi.stubEnv('BACKEND_ENVIRONMENT', 'development')
    await override('pause_ai', { enabled: true })
    vi.stubEnv('BACKEND_ENVIRONMENT', 'sandbox')
    expect(await refusalOf(member.action(cappedRef, {}))).toMatchObject({ code: 'unavailable', data: { reason: 'ai_paused' } })
    vi.stubEnv('BACKEND_ENVIRONMENT', 'development')
    await override('pause_ai', null)
    for (const environment of ['development', 'preview', 'production']) {
      vi.stubEnv('BACKEND_ENVIRONMENT', environment)
      expect(await member.action(generateRef, {}), environment).toBe('ran')
    }
    vi.unstubAllEnvs()
  })

  test('setupAi refuses a spend limit that caps nothing', () => {
    for (const usdPerDay of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '5']) {
      expect(() => setupAi(components as never, { billing, spendLimit: { usdPerDay: usdPerDay as number } }), String(usdPerDay)).toThrow(/usdPerDay/)
    }
  })

  test('reads as on in getFlags while it is, so a page can hide what it pauses', async () => {
    await override('pause_ai', { enabled: true })
    expect((await (await asUser(t)).query(getFlags, {})).flags).toMatchObject({ pause_ai: true, pause_checkout: false })
  })
})
