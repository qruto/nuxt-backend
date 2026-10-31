import { describe, expect, it } from 'vitest'
import { LABELS } from '../../src/convex/labels'
import { BACKEND_FLAG_KEYS, BACKEND_FLAGS, defineFlags, evaluateFlag, FLAG_TARGETS_MAX, flagBucket, isOverrideProblem, MAINTENANCE_MESSAGE_MAX, normalizeOverride, PAUSE_FLAGS, ROLLOUT_BUCKETS } from '../../src/convex/flags'

// The flags' rules, runtime-neutral: how a flag is declared, how it is
// evaluated for one subject, and what an override may hold. The same
// functions run in the component, in `setupFlags` and in the admin tab.

const OFF = { default: false }
const ids = (count: number, prefix = 'user') => Array.from({ length: count }, (_, index) => `${prefix}_${index.toString(36)}`)

describe('defineFlags', () => {
  it('returns the flags as declared', () => {
    const flags = { newEditor: { default: false, description: 'The rewritten editor.' }, shared_boards: { default: true, description: 'Boards.', by: 'workspace' as const } }
    expect(defineFlags(flags)).toBe(flags)
  })

  it('refuses a key that is no flag key, or one of the package\'s own', () => {
    expect(() => defineFlags({ 'new-editor': { default: false, description: 'x' } })).toThrow(/is no flag key/)
    expect(() => defineFlags({ NewEditor: { default: false, description: 'x' } })).toThrow(/is no flag key/)
    expect(() => defineFlags({ [`a${'b'.repeat(64)}`]: { default: false, description: 'x' } })).toThrow(/at most 64/)
    for (const key of BACKEND_FLAG_KEYS) expect(() => defineFlags({ [key]: { default: false, description: 'x' } })).toThrow(/package's own/)
  })

  it('refuses the prefixes the package keeps for flags it may add, so a minor release never takes an app\'s key', () => {
    // STABILITY.md: a package flag added later is `pause_<service>` or `backend_<name>`.
    expect(() => defineFlags({ pause_email: { default: false, description: 'x' } })).toThrow(/starts with `pause_` or `backend_`/)
    expect(() => defineFlags({ backend_announcement: { default: false, description: 'x' } })).toThrow(/starts with `pause_` or `backend_`/)
    expect(() => defineFlags({ paused: { default: false, description: 'x' }, backendless: { default: false, description: 'x' } })).not.toThrow()
    for (const key of BACKEND_FLAG_KEYS.filter(key => key !== 'maintenance')) expect(key.startsWith('pause_')).toBe(true)
  })

  it('refuses a definition without a default, a description, or with another rollout subject', () => {
    expect(() => defineFlags({ a: { description: 'x' } as never })).toThrow(/needs a `default`/)
    expect(() => defineFlags({ a: { default: false, description: ' ' } })).toThrow(/needs a `description`/)
    expect(() => defineFlags({ a: { default: false, description: 'x', by: 'plan' as never } })).toThrow(/`user` or `workspace`/)
  })
})

describe('the package\'s own flags', () => {
  it('are three kill switches, one per service, and the maintenance banner', () => {
    expect(BACKEND_FLAG_KEYS).toEqual(['pause_signups', 'pause_checkout', 'pause_ai', 'maintenance'])
    expect(Object.entries(PAUSE_FLAGS).map(([service, key]) => [service, (BACKEND_FLAGS[key] as { pauses?: string }).pauses])).toEqual([['signups', 'signups'], ['checkout', 'checkout'], ['ai', 'ai']])
  })

  it('say what they do in the admin tab\'s English as the API does', () => {
    // The tab renders the label, so it translates; the API's description is its English default.
    for (const key of BACKEND_FLAG_KEYS) expect(LABELS.admin.flags.descriptions[key], key).toBe(BACKEND_FLAGS[key].description)
  })
})

describe('flagBucket', () => {
  it('is the same bucket for the same key and id, every time', () => {
    // Pinned: a subject's bucket never changes across releases (STABILITY.md),
    // or raising a rollout would take some subjects back out of it.
    expect(flagBucket('newEditor', 'k57dtnwq8ssbbcqv03a8xp0wrn7nqt1h')).toBe(804)
    expect(flagBucket('labs', 'k57dtnwq8ssbbcqv03a8xp0wrn7nqt1h')).toBe(5012)
    expect(flagBucket('newEditor', 'user_1')).toBe(1210)
    expect(flagBucket('labs', 'workspace_7')).toBe(1363)
  })

  it('spreads ids evenly over every bucket', () => {
    const buckets = ids(20_000).map(id => flagBucket('newEditor', id))
    expect(Math.min(...buckets)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...buckets)).toBeLessThan(ROLLOUT_BUCKETS)
    // Each tenth of the range holds about a tenth of the ids.
    const tenths = Array.from({ length: 10 }, (_, tenth) => buckets.filter(bucket => Math.floor(bucket / (ROLLOUT_BUCKETS / 10)) === tenth).length / buckets.length)
    for (const share of tenths) expect(share).toBeGreaterThan(0.085)
    for (const share of tenths) expect(share).toBeLessThan(0.115)
  })

  it('picks another share of the same ids for another flag', () => {
    const users = ids(10_000)
    const inFirst = new Set(users.filter(id => flagBucket('first', id) < 1000))
    const inBoth = users.filter(id => flagBucket('second', id) < 1000 && inFirst.has(id)).length
    // Independent 10% picks share about 1% of the ids, never the same 10%.
    expect(inBoth / users.length).toBeGreaterThan(0.005)
    expect(inBoth / users.length).toBeLessThan(0.02)
  })
})

describe('evaluateFlag', () => {
  it('holds the code\'s default without an override, and the override\'s value for everyone over it', () => {
    expect(evaluateFlag('a', OFF, null, { userId: 'u' })).toBe(false)
    expect(evaluateFlag('a', { default: true }, undefined)).toBe(true)
    expect(evaluateFlag('a', OFF, { enabled: true })).toBe(true)
    expect(evaluateFlag('a', { default: true }, { enabled: false }, { userId: 'u' })).toBe(false)
    // An override with nothing in it holds the default.
    expect(evaluateFlag('a', { default: true }, {}, { userId: 'u' })).toBe(true)
  })

  it('turns a flag that is off on for the accounts, workspaces and plans it targets, and no one else', () => {
    const override = { users: ['ada'], workspaces: ['acme'], plans: ['pro'] }
    expect(evaluateFlag('a', OFF, override, { userId: 'ada' })).toBe(true)
    expect(evaluateFlag('a', OFF, override, { userId: 'bob', workspaceId: 'acme' })).toBe(true)
    expect(evaluateFlag('a', OFF, override, { userId: 'bob', workspaceId: 'globex', plans: ['starter', 'pro'] })).toBe(true)
    expect(evaluateFlag('a', OFF, override, { userId: 'bob', workspaceId: 'globex', plans: ['starter'] })).toBe(false)
    expect(evaluateFlag('a', OFF, override, {})).toBe(false)
    // Off for everyone, targets on: still on for them.
    expect(evaluateFlag('a', { default: true }, { ...override, enabled: false }, { userId: 'ada' })).toBe(true)
    expect(evaluateFlag('a', { default: true }, { ...override, enabled: false }, { userId: 'bob' })).toBe(false)
  })

  it('rolls out to the share of accounts whose bucket is under it, the same ones every time, and only adds as it grows', () => {
    const users = ids(4000)
    const on = (rollout: number) => users.filter(userId => evaluateFlag('labs', OFF, { rollout }, { userId }))
    const quarter = on(25)
    expect(quarter.length / users.length).toBeGreaterThan(0.22)
    expect(quarter.length / users.length).toBeLessThan(0.28)
    expect(on(25)).toEqual(quarter)
    const half = new Set(on(50))
    for (const userId of quarter) expect(half.has(userId)).toBe(true)
    expect(on(0)).toEqual([])
    expect(on(100)).toEqual(users)
    // Hundredths of a percent count.
    expect(users.filter(userId => flagBucket('labs', userId) < 1).every(userId => evaluateFlag('labs', OFF, { rollout: 0.01 }, { userId }))).toBe(true)
  })

  it('rolls a workspace flag out by workspace, so its members all see the same, and never a visitor without an id', () => {
    const byWorkspace = { default: false, by: 'workspace' as const }
    const workspace = ids(200, 'ws').find(id => flagBucket('boards', id) < 5000)!
    for (const userId of ids(20)) expect(evaluateFlag('boards', byWorkspace, { rollout: 50 }, { userId, workspaceId: workspace })).toBe(true)
    expect(evaluateFlag('boards', byWorkspace, { rollout: 50 }, { userId: 'u' })).toBe(false)
    expect(evaluateFlag('labs', OFF, { rollout: 100 }, {})).toBe(false)
  })
})

describe('normalizeOverride', () => {
  it('trims and dedupes the targets, drops what names nobody, and rounds the rollout', () => {
    expect(normalizeOverride('labs', { enabled: false, users: [' ada ', 'ada', 'bob'], workspaces: [], plans: ['pro'], rollout: 12.3456 })).toEqual({ enabled: false, users: ['ada', 'bob'], plans: ['pro'], rollout: 12.35 })
    expect(normalizeOverride('labs', { rollout: 0, users: [] })).toEqual({})
  })

  it('stores a plan target as the plan, whichever interval the catalog key names, as activePlans answers it', () => {
    expect(normalizeOverride('labs', { plans: ['pro:year', 'pro', 'team:month', 'starter'] })).toEqual({ plans: ['pro', 'team', 'starter'] })
    // Only plans: an id that ends the same way stays as it is.
    expect(normalizeOverride('labs', { users: ['ada:year'] })).toEqual({ users: ['ada:year'] })
  })

  it('refuses a target that is no id, too many of them, and a rollout outside 0 to 100', () => {
    const problem = (override: Parameters<typeof normalizeOverride>[1]) => {
      const result = normalizeOverride('labs', override)
      return isOverrideProblem(result) ? result.field : null
    }
    expect(problem({ users: [''] })).toBe('users')
    expect(problem({ workspaces: ['x'.repeat(129)] })).toBe('workspaces')
    expect(problem({ plans: ids(FLAG_TARGETS_MAX + 1) })).toBe('plans')
    expect(problem({ users: ids(FLAG_TARGETS_MAX) })).toBeNull()
    expect(problem({ rollout: 101 })).toBe('rollout')
    expect(problem({ rollout: Number.NaN })).toBe('rollout')
    expect(problem({ enabled: 'yes' as never })).toBe('enabled')
  })

  it('holds a kill switch to on or off for everyone, and a message to the maintenance banner', () => {
    expect(normalizeOverride('pause_checkout', { enabled: true })).toEqual({ enabled: true })
    expect(normalizeOverride('pause_checkout', { users: ['ada'] })).toMatchObject({ field: 'users' })
    expect(normalizeOverride('pause_ai', { rollout: 10 })).toMatchObject({ field: 'rollout' })
    expect(normalizeOverride('pause_ai', { message: 'Back soon' })).toMatchObject({ field: 'message' })
    expect(normalizeOverride('labs', { message: 'Back soon' })).toMatchObject({ field: 'message' })
    expect(normalizeOverride('maintenance', { enabled: true, message: '  Back at 3 pm.  ' })).toEqual({ enabled: true, message: 'Back at 3 pm.' })
    expect(normalizeOverride('maintenance', { message: 'x'.repeat(MAINTENANCE_MESSAGE_MAX + 1) })).toMatchObject({ field: 'message' })
  })
})
