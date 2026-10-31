// Feature flags and the package's kill switches: what a flag is, how it is
// evaluated for one caller, and what an override may hold. Runtime-neutral
// (no Vue, no Convex runtime), so the component that stores the overrides,
// `setupFlags` that reads them inside queries and mutations, the admin tab
// that edits them and the docs read one definition.
//
// A flag is declared in code (`defineFlags`), with its default; an
// administrator stores an override for it from the admin console. An
// override turns it on or off for everyone, or, while it is off, on for
// some: named accounts, named workspaces, the plans a billing entity is on,
// and a percentage of accounts (or workspaces) picked by a stable hash of the
// flag's key and the subject's id, so the same subject always lands on the
// same side of a rollout.
//
// A flag with `variants` is an experiment: while it is on for someone, they
// get one variant, picked by another stable hash of the key and their id,
// and the first read records their exposure.

import { experimentProblem, type ExperimentShape, variantForBucket } from './funnel-rules.js'

/** The longest flag key. */
export const FLAG_KEY_MAX = 64

/** The most ids (or plan keys) one target list of an override names. */
export const FLAG_TARGETS_MAX = 100

/** The longest id or plan key a target list takes. */
export const FLAG_TARGET_MAX = 128

/** The longest maintenance message, in characters. */
export const MAINTENANCE_MESSAGE_MAX = 280

/** How finely a rollout is cut: a subject's bucket is one of this many, so a rollout takes hundredths of a percent. */
export const ROLLOUT_BUCKETS = 10_000

/** The most flags that hold an override at once: a write that would store one more is refused, so every evaluation and every erasure reads them all. */
export const FLAG_ROWS_MAX = 500

/**
 * The key prefixes the package keeps for flags of its own, which a minor
 * release may add: a kill switch is always `pause_<service>`, any other
 * flag `backend_<name>`. An app's key starts with neither.
 */
const RESERVED_FLAG_PREFIXES = ['pause_', 'backend_'] as const

/** A flag key: a lower-case letter, then letters, digits and underscores. */
const FLAG_KEY = /^[a-z]\w*$/

/** Who a percentage rollout picks: each account, or each workspace (its members all see the same). */
export type FlagRolloutSubject = 'user' | 'workspace'

/** One flag, as the app declares it in code. */
export interface FlagDefinition extends ExperimentShape {
  /** Its value for everyone while no override is stored. */
  default: boolean
  /** What it turns on, in a sentence: the admin console shows it. */
  description: string
  /** Who a percentage rollout picks, and who an experiment's variant belongs to. Default `'user'`. */
  by?: FlagRolloutSubject
  /**
   * Make the flag an experiment: two to four variant names, the control
   * (the version people see today) first. While the flag is on for
   * someone, they get one variant, the same on every read, and the first
   * read records `experiment.exposed`. Read it with `useExperiment(key)`
   * and `flags.variant(ctx, key)`.
   */
  variants?: readonly string[]
  /** Each variant's share, in its order: `[90, 10]` sends one in ten to the second. Default: even. */
  weights?: readonly number[]
  /** The event kind that counts as a conversion: a package kind (`billing.subscription_created`) or one of yours (`app.strip_published`). */
  goal?: string
  /** Event kinds that must not rise in a variant: a refund, a cancellation. */
  guardrails?: readonly string[]
  /** A price test: a variant (not the control) mapped to a public promotion of the billing catalog, shown and applied as that promotion. */
  discounts?: Readonly<Record<string, string>>
}

/** The flags an app declares, by key. */
export type FlagDefinitions = Record<string, FlagDefinition>

/**
 * What an administrator stores for a flag. Every field is optional: an
 * override with none holds the flag at its default.
 */
export interface FlagOverride {
  /** On or off for everyone, over the code's default. Targets and the rollout apply only while it is off. */
  enabled?: boolean
  /** Account ids it is on for. */
  users?: string[]
  /** Workspace ids it is on for. */
  workspaces?: string[]
  /** Plan keys of the catalog it is on for: a billing entity on one of them sees it. */
  plans?: string[]
  /** The percentage of accounts (or workspaces) it is on for, 0 to 100, picked by a stable hash. */
  rollout?: number
  /** The maintenance banner's message: the `maintenance` switch only. */
  message?: string
  /** An experiment's winner: everyone sees this variant, and nobody is exposed any more. */
  winner?: string
}

/** A service a kill switch pauses. */
export type PausableService = 'signups' | 'checkout' | 'ai'

/**
 * The package's own flags, which the package itself honors: three kill
 * switches and the maintenance banner. Each is off until an administrator
 * turns it on, takes no targets or rollout, and is turned on and off from
 * the admin console like any flag.
 */
export const BACKEND_FLAGS = {
  pause_signups: {
    description: 'New accounts are refused, invited and administrator-created ones included, before a sign-in code is sent; existing accounts sign in as before.',
    pauses: 'signups',
  },
  pause_checkout: {
    description: 'New checkouts, plan switches and gift purchases are refused; running plans, cancelling, the billing portal and gift claims keep working.',
    pauses: 'checkout',
  },
  pause_ai: {
    description: 'Metered model calls and streams are refused before any credits are reserved.',
    pauses: 'ai',
  },
  maintenance: {
    description: 'A banner with your message shows on every page, after an administrator\'s visit and before announcements.',
  },
} as const satisfies Record<string, { description: string, pauses?: PausableService }>

/** One of the package's own flags. */
export type BackendFlag = keyof typeof BACKEND_FLAGS

/** The package's own flags, in the order the admin console lists them. */
export const BACKEND_FLAG_KEYS = Object.keys(BACKEND_FLAGS) as BackendFlag[]

/** The kill switch that pauses each service. */
export const PAUSE_FLAGS = {
  signups: 'pause_signups',
  checkout: 'pause_checkout',
  ai: 'pause_ai',
} as const satisfies Record<PausableService, BackendFlag>

/** Whether `key` is one of the package's own flags. */
export function isBackendFlag(key: string): key is BackendFlag {
  return Object.hasOwn(BACKEND_FLAGS, key)
}

/**
 * Declare the app's flags: each key with its default and what it turns on.
 * Returned as given, typed, so `isEnabled` and `requireFlag` take only
 * these keys. A key is a lower-case letter, then letters, digits and
 * underscores, at most 64 characters, none of the package's own, and
 * never starting with `pause_` or `backend_`, which the package keeps for
 * flags it may add.
 *
 * @example
 * ```ts
 * const definitions = defineFlags({
 *   newEditor: { default: false, description: 'The rewritten editor.' },
 *   teamInvites: { default: true, description: 'Inviting people to a workspace.', by: 'workspace' },
 * })
 * ```
 */
export function defineFlags<const T extends FlagDefinitions>(flags: T): T {
  for (const [key, definition] of Object.entries(flags)) {
    const problem = keyProblem(key) ?? definitionProblem(definition)
    if (problem) throw new Error(`[nuxt-backend] defineFlags: \`${key}\` ${problem}.`)
  }
  return flags
}

/** What is wrong with an app's flag key, or `null`. */
function keyProblem(key: string): string | null {
  if (!FLAG_KEY.test(key) || key.length > FLAG_KEY_MAX) return `is no flag key: a lower-case letter, then letters, digits and underscores, at most ${FLAG_KEY_MAX} characters`
  if (isBackendFlag(key)) return 'is one of the package\'s own flags (a kill switch, or the maintenance banner): name yours another way'
  if (RESERVED_FLAG_PREFIXES.some(prefix => key.startsWith(prefix))) return `starts with ${RESERVED_FLAG_PREFIXES.map(prefix => `\`${prefix}\``).join(' or ')}, which the package keeps for flags of its own: name yours another way`
  return null
}

/** What is wrong with a flag's definition, or `null`. */
function definitionProblem(definition: FlagDefinition): string | null {
  if (typeof definition?.default !== 'boolean') return 'needs a `default`, true or false'
  if (typeof definition.description !== 'string' || !definition.description.trim()) return 'needs a `description`: the admin console shows it'
  if (definition.by !== undefined && definition.by !== 'user' && definition.by !== 'workspace') return 'rolls out `by` `user` or `workspace`'
  return experimentProblem(definition)
}

/**
 * A subject's bucket for a flag, from 0 to {@link ROLLOUT_BUCKETS} − 1: a
 * 32-bit FNV-1a hash of the flag's key and the subject's id, mixed by
 * MurmurHash3's finalizer. The same key and id give the same bucket in every
 * runtime, every time; another flag gives the same subject an unrelated one,
 * so two 10% rollouts do not pick the same 10%.
 */
export function flagBucket(key: string, subjectId: string): number {
  const input = `${key}:${subjectId}`
  let hash = 0x811C9DC5
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85EBCA6B)
  hash ^= hash >>> 13
  hash = Math.imul(hash, 0xC2B2AE35)
  hash ^= hash >>> 16
  return (hash >>> 0) % ROLLOUT_BUCKETS
}

/** Who a flag is evaluated for: the caller, or a subject a function names. */
export interface FlagSubject {
  /** The account. */
  userId?: string | null
  /** The workspace it acts in. */
  workspaceId?: string | null
  /** The catalog plan keys its billing entity is on. */
  plans?: readonly string[]
}

/**
 * A flag's value for a subject: the override's `enabled` when it sets one,
 * else the code's default. While that is off, the override's targets turn it
 * on for the accounts, workspaces and plans they name, and its rollout for a
 * stable share of accounts (or workspaces, `by: 'workspace'`). A subject
 * with no id is never in a rollout.
 */
export function evaluateFlag(key: string, definition: Pick<FlagDefinition, 'default' | 'by'>, override: FlagOverride | null | undefined, subject: FlagSubject = {}): boolean {
  if (override?.enabled ?? definition.default) return true
  if (!override) return false
  if (subject.userId && override.users?.includes(subject.userId)) return true
  if (subject.workspaceId && override.workspaces?.includes(subject.workspaceId)) return true
  if (override.plans?.length && subject.plans?.some(plan => override.plans!.includes(plan))) return true
  const rolloutId = definition.by === 'workspace' ? subject.workspaceId : subject.userId
  if (!override.rollout || !rolloutId) return false
  return flagBucket(key, rolloutId) < Math.round(override.rollout * (ROLLOUT_BUCKETS / 100))
}

/**
 * The variant of an experiment a subject sees: the winner once one is
 * picked; the control (the first variant) while the flag is off for them
 * and for a subject with no id; else the variant a stable hash of the key
 * and the subject's id lands in, by the weights. `running` says whether
 * the read is part of the experiment, which is what records an exposure.
 * `undefined` for a flag with no variants.
 */
export function experimentVariant(key: string, definition: Pick<FlagDefinition, 'default' | 'by' | 'variants' | 'weights'>, override: FlagOverride | null | undefined, subject: FlagSubject = {}): { variant: string, running: boolean, subjectId: string | null } | undefined {
  const variants = definition.variants
  if (!variants?.length) return undefined
  const control = variants[0]!
  const subjectId = (definition.by === 'workspace' ? subject.workspaceId : subject.userId) ?? null
  if (override?.winner && variants.includes(override.winner)) return { variant: override.winner, running: false, subjectId }
  if (!subjectId || !evaluateFlag(key, definition, override, subject)) return { variant: control, running: false, subjectId }
  return { variant: variantForBucket(variants, definition.weights, flagBucket(`${key}:variant`, subjectId)), running: true, subjectId }
}

/** Whether an override names anyone a flag turns on for while it is off: targets, or a rollout. */
export function isTargeted(override: FlagOverride | null | undefined): boolean {
  return Boolean(override?.users?.length || override?.workspaces?.length || override?.plans?.length || override?.rollout)
}

/** What an override would refuse: the field, and what it must be. */
export interface FlagOverrideProblem {
  field: string
  reason: string
}

/** One field of an override as it is stored (`value`, absent when it says nothing), or why it is refused. */
type FieldResult<T> = { value?: T } | FlagOverrideProblem

/** Why one of the package's own flags refuses a field: it is on or off for everyone. */
const forEveryone = (key: string, field: string): FlagOverrideProblem => ({ field, reason: `none: ${key} is on or off for everyone` })

/** The value for everyone: true or false. */
function enabledOf(value: unknown): FieldResult<boolean> {
  if (value === undefined) return {}
  return typeof value === 'boolean' ? { value } : { field: 'enabled', reason: 'true or false' }
}

/** A plan target as `activePlans` answers it: `pro` for the catalog's `pro:year` too, since a plan is the same plan at either interval. */
const planOf = (entry: string): string => entry.replace(/:(?:month|year)$/, '')

/** A target list, trimmed, without blanks or repeats (a plan without its interval); nothing when it names nobody. None for the package's own flags. */
function targetsOf(key: string, field: 'users' | 'workspaces' | 'plans', list: unknown): FieldResult<string[]> {
  if (list === undefined) return {}
  if (!Array.isArray(list)) return { field, reason: 'a list of ids' }
  const trimmed = list.map(entry => (typeof entry === 'string' ? entry.trim() : ''))
  const cleaned = [...new Set(field === 'plans' ? trimmed.map(planOf) : trimmed)]
  if (cleaned.some(entry => !entry || entry.length > FLAG_TARGET_MAX)) return { field, reason: `ids of 1 to ${FLAG_TARGET_MAX} characters` }
  if (cleaned.length > FLAG_TARGETS_MAX) return { field, reason: `at most ${FLAG_TARGETS_MAX} entries` }
  if (!cleaned.length) return {}
  return isBackendFlag(key) ? forEveryone(key, field) : { value: cleaned }
}

/** A rollout percentage, to hundredths; nothing for zero. None for the package's own flags. */
function rolloutOf(key: string, rollout: unknown): FieldResult<number> {
  if (rollout === undefined) return {}
  if (typeof rollout !== 'number' || !Number.isFinite(rollout) || rollout < 0 || rollout > 100) return { field: 'rollout', reason: 'a percentage from 0 to 100' }
  if (rollout === 0) return {}
  return isBackendFlag(key) ? forEveryone(key, 'rollout') : { value: Math.round(rollout * 100) / 100 }
}

/** An experiment's winner: a variant's name; none for the package's own flags. Whether the flag has that variant is its setup's to check. */
function winnerOf(key: string, winner: unknown): FieldResult<string> {
  if (winner === undefined) return {}
  if (typeof winner !== 'string' || !/^[a-z][\w-]{0,31}$/.test(winner)) return { field: 'winner', reason: 'a variant\'s name' }
  return isBackendFlag(key) ? forEveryone(key, 'winner') : { value: winner }
}

/** The maintenance banner's message, trimmed; nothing when empty. Only the banner's. */
function messageOf(key: string, message: unknown): FieldResult<string> {
  if (message === undefined) return {}
  if (key !== 'maintenance') return { field: 'message', reason: 'only the maintenance banner\'s' }
  const text = typeof message === 'string' ? message.trim() : null
  if (text === null || text.length > MAINTENANCE_MESSAGE_MAX) return { field: 'message', reason: `plain text of at most ${MAINTENANCE_MESSAGE_MAX} characters` }
  return text ? { value: text } : {}
}

/**
 * An override as it is stored, or why it is refused: lists trimmed and
 * without repeats, empty lists and a zero rollout dropped. One of the
 * package's own flags takes only `enabled`, and the maintenance switch its
 * `message` too; an app's flag takes no message.
 */
export function normalizeOverride(key: string, override: FlagOverride): FlagOverride | FlagOverrideProblem {
  const fields: Array<[keyof FlagOverride, FieldResult<unknown>]> = [
    ['enabled', enabledOf(override.enabled)],
    ['users', targetsOf(key, 'users', override.users)],
    ['workspaces', targetsOf(key, 'workspaces', override.workspaces)],
    ['plans', targetsOf(key, 'plans', override.plans)],
    ['rollout', rolloutOf(key, override.rollout)],
    ['message', messageOf(key, override.message)],
    ['winner', winnerOf(key, override.winner)],
  ]
  const normalized: Record<string, unknown> = {}
  for (const [field, result] of fields) {
    if ('reason' in result) return result
    if (result.value !== undefined) normalized[field] = result.value
  }
  return normalized as FlagOverride
}

/** Whether `normalizeOverride` refused the override. */
export function isOverrideProblem(value: FlagOverride | FlagOverrideProblem): value is FlagOverrideProblem {
  return 'reason' in value && 'field' in value
}
