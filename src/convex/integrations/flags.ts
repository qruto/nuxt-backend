import { type Auth, type FunctionReference, type GenericActionCtx, type GenericDataModel, mutationGeneric, queryGeneric, type RegisteredMutation, type RegisteredQuery } from 'convex/server'
import { v } from 'convex/values'
import { vFlagOverride } from '../components/backend/schema.js'
import { DEFAULT_ADMIN_ROLES, IMPERSONATED_BY_CLAIM } from '../constants.js'
import { backendError } from '../errors.js'
import { BACKEND_FLAG_KEYS, BACKEND_FLAGS, type BackendFlag, evaluateFlag, experimentVariant, type FlagDefinition, type FlagDefinitions, type FlagOverride, type FlagRolloutSubject, type FlagSubject, isBackendFlag, isOverrideProblem, isTargeted, normalizeOverride } from '../flags.js'
import { experimentVerdict, type ExperimentVerdict, guardrailWorse, type RateInterval, wilsonInterval } from '../funnel-rules.js'
import type { Audit } from './audit.js'
import type { BackendEventData } from '../events.js'
import type { Billing } from './billing.js'
import { type AdapterFindOne, type Administrators, createAccessReads, isAdministratorNow, requireAdministratorInPerson, requireAdministratorNow } from './access.js'

// Feature flags and kill switches, for the app: read a flag inside a query
// or a mutation (`isEnabled`, `requireFlag`), every flag's value for the
// caller (`getFlags`, behind `useFlag` and the maintenance banner), and the
// admin console's tab (`listFlags`, `setFlag`).

/** Every flag's value for the caller, as `getFlags` answers it. */
export interface FlagValues {
  /** Each flag by key, the app's own and the package's: `true` while it is on for the caller. */
  flags: Record<string, boolean>
  /** The maintenance banner while it is on, with its message (`''` for the default sentence); `null` while it is off. */
  maintenance: { message: string } | null
  /** Each experiment's variant for the caller, by key: the control while it is off for them or they are signed out, the winner once one is picked. */
  variants: Record<string, string>
  /** The experiments the caller is in right now (running, signed in, exposure still to be recorded or recorded), by key. */
  running: string[]
  /** A price test's promotion for the caller, by experiment key: the catalog promotion their variant shows and applies. */
  discounts: Record<string, string>
}

/** One variant of an experiment, as the Experiments view reads it. */
export interface ExperimentVariantResult {
  name: string
  /** Its share of the people, 0 to 1. */
  share: number
  /** The people (or workspaces) exposed to it. */
  exposed: number
  /** How many of them reached the goal, and the rate with its 95% interval; `null` without a goal. */
  goal: { count: number } & RateInterval | null
  /** Each guardrail's count and rate, marked `worse` when it sits above the control's. */
  guardrails: Array<{ kind: string, count: number, worse: boolean } & RateInterval>
  /** The price test's promotion it shows, when it is one. */
  discount: string | null
}

/** One experiment's results. */
export interface ExperimentResult {
  key: string
  description: string
  /** The goal kind; `null` without one. */
  goal: string | null
  guardrails: string[]
  by: FlagRolloutSubject
  /** Whether it runs now: its flag is on (for everyone or some) and no winner is picked. */
  running: boolean
  /** The variant everyone sees since an administrator picked it; `null` while none is. */
  winner: string | null
  /** The flag's stored override, which picking a winner keeps the rest of; `null` while it holds its default. */
  override: FlagOverride | null
  /** When it first exposed someone, epoch ms; `null` before. How long it has run is counted from it where it is shown. */
  startedAt: number | null
  /** The variants, the control first. */
  variants: ExperimentVariantResult[]
  /** What the results say: too few exposures, no difference, or a variant leading. */
  verdict: ExperimentVerdict
}

/** One flag as the admin console lists it. */
export interface AdminFlag {
  key: string
  /** What it turns on. */
  description: string
  /** One of the package's own: a kill switch, or the maintenance banner. It is on or off for everyone. */
  builtIn: boolean
  /** Its value for everyone while no override is stored. */
  default: boolean
  /** Who a percentage rollout picks. */
  by: FlagRolloutSubject
  /**
   * Whether the code declares it (or it is one of the package's own).
   * `false` for an override left behind by a flag the code no longer
   * declares: it turns nothing on, and `setFlag(key, null)` removes it, so
   * a flag declared again under the key starts from its default.
   */
  declared: boolean
  /** What an administrator stored, or `null` while it holds its default. */
  override: FlagOverride | null
  /** When the override was stored, epoch ms; `null` without one. */
  updatedAt: number | null
}

/** The public functions `backend/flags.ts` re-exports. */
export interface FlagsApi {
  /** Every flag's value for the caller, and the maintenance banner. Anyone may read it, signed in or not. */
  getFlags: RegisteredQuery<'public', Record<string, never>, Promise<FlagValues>>
  /** Every flag with its default and its override, the package's own first, then the app's, then overrides of flags the code no longer declares. `null` for anyone who is not an administrator now. */
  listFlags: RegisteredQuery<'public', Record<string, never>, Promise<AdminFlag[] | null>>
  /**
   * Store a flag's override, or remove it with `null` so the flag holds its
   * default: any stored override, a flag the code no longer declares
   * included. An administrator's, in person, with a recent sign-in.
   */
  setFlag: RegisteredMutation<'public', { key: string, override: FlagOverride | null }, Promise<null>>
  /**
   * The caller's variant of an experiment, recording their exposure the
   * first time a running one shows them a variant: what `useExperiment`
   * calls once its read shows the experiment runs for them. `null` for a
   * key without variants.
   */
  exposeExperiment: RegisteredMutation<'public', { key: string }, Promise<{ variant: string } | null>>
  /** Every experiment the code declares, with its results per variant. Refused as `forbidden` (`admin_only`) for anyone who is not an administrator. */
  getExperiments: RegisteredQuery<'public', Record<string, never>, Promise<ExperimentResult[]>>
}

/** A context a flag is read in: any query, mutation or action. */
export interface FlagCtx {
  runQuery: GenericActionCtx<GenericDataModel>['runQuery']
  auth: Auth
}

/** A context that records an exposure: a mutation or an action. */
export interface FlagWriteCtx extends FlagCtx {
  runMutation: GenericActionCtx<GenericDataModel>['runMutation']
}

/** The app's flags, from {@link setupFlags}. */
export interface Flags<F extends FlagDefinitions = FlagDefinitions> {
  /** The flags as declared. */
  definitions: F
  /**
   * Whether a flag is on: for the caller (its account, its active workspace
   * and the plans its billing entity is on), or for the `subject` you name,
   * such as in a webhook or a job. One of the package's own flags reads as
   * on while its switch is.
   */
  isEnabled: (ctx: FlagCtx, key: (keyof F & string) | BackendFlag, subject?: FlagSubject) => Promise<boolean>
  /** Refuse the call unless the flag is on for the caller (or `subject`): `forbidden`, reason `flag_off`. */
  requireFlag: (ctx: FlagCtx, key: keyof F & string, subject?: FlagSubject) => Promise<void>
  /**
   * The caller's variant of an experiment, in a mutation or an action of
   * yours, recording `experiment.exposed` the first time a running
   * experiment shows them one, exactly as `useExperiment` does in a page:
   * both hash the same key and id. The control for a flag that is off for
   * them and for nobody signed in; `undefined` for a key without variants.
   * An administrator's visit reads the variant and records nothing.
   */
  variant: (ctx: FlagWriteCtx, key: keyof F & string) => Promise<string | undefined>
  /** The public functions `backend/flags.ts` re-exports. */
  api: FlagsApi
}

export interface SetupFlagsOptions<F extends FlagDefinitions> {
  /** The app's flags, from `defineFlags`. */
  flags: F
  /** The app's audit trail: every change is recorded on it as `flag.changed`. */
  audit: Pick<Audit, 'recordBackendEvent'>
  /** The app's billing: a flag's plan targets match the plans the caller's billing entity is on. Without it, none do. */
  billing?: Pick<Billing, 'activePlans'>
  /** The app-wide roles that read and change flags, read fresh. Default `['admin']`: pass the same as `setupAdmin` and `setupAuth({ admin })`. */
  adminRoles?: readonly string[]
  /** Accounts that read and change flags whatever their role, by id: pass the same as `setupAdmin` and `setupAuth({ admin })`. */
  adminUserIds?: readonly string[]
}

/** The `backend` component as flags read it. */
export interface FlagsComponents {
  backend: unknown
}

type FlagRow = { key: string, override: FlagOverride, updatedAt: number }

/** A stored override, with the key of its flag. */
type StoredOverride = readonly [key: string, override: FlagOverride]

interface FlagRefs {
  flags: {
    list: FunctionReference<'query', 'internal', Record<string, never>, FlagRow[]>
    get: FunctionReference<'query', 'internal', { key: string }, FlagRow | null>
    set: FunctionReference<'mutation', 'internal', { key: string, override: FlagOverride | null }, null>
  }
  funnel: {
    expose: FunctionReference<'mutation', 'internal', { experiment: string, subject: string, userId: string, variant: string, variants: string[], by: FlagRolloutSubject, goal?: string, guardrails: string[] }, { exposed: boolean, variant: string }>
    experimentCounts: FunctionReference<'query', 'internal', { experiment: string, variants: string[], kinds: string[] }, { startedAt: number | null, variants: Array<{ name: string, exposed: number, kinds: Record<string, number> }> }>
  }
  adapter: { findOne: AdapterFindOne }
}

/** A package flag's definition, as an app flag's reads: off by default, on or off for everyone. */
const BACKEND_DEFINITION: Pick<FlagDefinition, 'default' | 'by'> = { default: false }

/** The fields a change records: the flag, and what it is now; never whom it targets, only how many. */
function changeData(key: string, override: FlagOverride | null): BackendEventData<'flag.changed'> {
  if (!override) return { flag: key, reset: true }
  const targets = (override.users?.length ?? 0) + (override.workspaces?.length ?? 0) + (override.plans?.length ?? 0)
  return {
    flag: key,
    ...(override.enabled === undefined ? {} : { enabled: override.enabled }),
    ...(override.rollout ? { rollout: override.rollout } : {}),
    ...(targets ? { targets } : {}),
    ...(override.winner ? { winner: override.winner } : {}),
  }
}

/** An experiment's counts, as the component reads them. */
interface ExperimentCounts {
  startedAt: number | null
  variants: Array<{ name: string, exposed: number, kinds: Record<string, number> }>
}

/** A count with its rate over the exposed and the rate's 95% interval. */
const rateOf = (count: number, exposed: number) => ({ count, ...wilsonInterval(count, exposed) })

/** One experiment's results: each variant's share, goal rate and guardrails, and what they say. */
function experimentResult(key: string, definition: FlagDefinition, override: FlagOverride | null, read: ExperimentCounts): ExperimentResult {
  const guardrails = [...(definition.guardrails ?? [])]
  const weights = definition.weights ?? read.variants.map(() => 1)
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  const rates = read.variants.map(counted => ({
    ...counted,
    goal: definition.goal ? rateOf(counted.kinds[definition.goal] ?? 0, counted.exposed) : null,
    rails: guardrails.map(kind => ({ kind, ...rateOf(counted.kinds[kind] ?? 0, counted.exposed) })),
  }))
  const control = rates[0]!
  return {
    key,
    description: definition.description,
    goal: definition.goal ?? null,
    guardrails,
    by: definition.by ?? 'user',
    running: !override?.winner && ((override?.enabled ?? definition.default) || isTargeted(override)),
    winner: override?.winner ?? null,
    override,
    startedAt: read.startedAt,
    variants: rates.map((rate, index) => ({
      name: rate.name,
      share: weights[index]! / total,
      exposed: rate.exposed,
      goal: rate.goal,
      guardrails: rate.rails.map((rail, at) => ({ ...rail, worse: index > 0 && guardrailWorse(rail, control.rails[at]!) })),
      discount: definition.discounts?.[rate.name] ?? null,
    })),
    verdict: definition.goal ? experimentVerdict(rates.map(rate => ({ name: rate.name, exposed: rate.exposed, goal: rate.goal! }))) : { kind: 'too_few' },
  }
}

/**
 * Feature flags, evaluated inside your own queries and mutations, and the
 * package's kill switches. Declare the flags in code with `defineFlags`;
 * an administrator overrides them from the admin console (`/admin`, the
 * Flags tab): on or off for everyone, or, while off, on for named accounts,
 * named workspaces, the plans a billing entity is on, and a percentage of
 * accounts or workspaces picked by a stable hash. Every change takes a
 * recent sign-in and is recorded on the audit trail as `flag.changed`.
 *
 * The package's own flags are always there: `pause_signups`,
 * `pause_checkout` and `pause_ai`, which the package honors where those
 * calls run (refused as `unavailable`, reason `<service>_paused`), and
 * `maintenance`, a banner with your message on every page.
 *
 * @example
 * ```ts [backend/flags.ts]
 * import { defineFlags, setupFlags } from 'nuxt-backend/flags'
 * import { components } from './_generated/api'
 * import { audit } from './audit'
 * import { billing } from './billing'
 *
 * export const flags = setupFlags(components, {
 *   flags: defineFlags({
 *     newEditor: { default: false, description: 'The rewritten editor.' },
 *   }),
 *   audit,
 *   billing,
 * })
 *
 * export const { getFlags, listFlags, setFlag, exposeExperiment, getExperiments } = flags.api
 * ```
 */
export function setupFlags<const F extends FlagDefinitions>(components: FlagsComponents, options: SetupFlagsOptions<F>): Flags<F> {
  const refs = components.backend as FlagRefs
  const reads = createAccessReads(refs.adapter.findOne)
  const administrators: Administrators = { roles: options.adminRoles ?? DEFAULT_ADMIN_ROLES, userIds: options.adminUserIds ?? [] }
  const definitions = options.flags
  if (typeof (options.audit as Partial<Audit> | undefined)?.recordBackendEvent !== 'function') {
    throw new TypeError('[nuxt-backend] setupFlags: `audit` is not a setupAudit instance. Pass the app\'s, from audit.ts: `setupFlags(components, { flags, audit })`. If you already do, an import cycle hands it over before audit.ts finished loading.')
  }

  /** A key's definition: the app's, or one of the package's own; `undefined` for a key neither declares. */
  const definitionOf = (key: string): Pick<FlagDefinition, 'default' | 'by'> | undefined =>
    isBackendFlag(key) ? BACKEND_DEFINITION : Object.hasOwn(definitions, key) ? definitions[key] : undefined

  /** The caller as a flag sees them: the account and its active workspace, from the token. */
  async function callerSubject(ctx: FlagCtx): Promise<FlagSubject> {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return {}
    const workspaceId = (identity as unknown as Record<string, unknown>).activeOrganizationId
    return { userId: identity.subject, workspaceId: typeof workspaceId === 'string' && workspaceId ? workspaceId : null }
  }

  /** Whether an override can turn its flag on by the caller's workspace: a workspace target, or a rollout by workspace. */
  const readsWorkspace = ([key, override]: StoredOverride): boolean =>
    override.enabled !== true && Boolean(override.workspaces?.length || (override.rollout && definitionOf(key)?.by === 'workspace'))

  /** Whether an override can turn its flag on by the caller's plans. */
  const readsPlans = ([, override]: StoredOverride): boolean => override.enabled !== true && Boolean(override.plans?.length)

  /**
   * The caller's workspace as a flag may read it: the token's active one,
   * while the member table still lists the caller in it, read fresh like
   * every other workspace check; `null` once they were removed.
   */
  async function memberWorkspace(ctx: FlagCtx, userId: string, workspaceId: string | null | undefined): Promise<string | null> {
    if (!workspaceId) return null
    return await reads.memberRole(ctx, userId, workspaceId) ? workspaceId : null
  }

  /**
   * The subject a set of stored overrides is evaluated for: the one a
   * function names, else the caller. The caller's workspace membership is
   * read only when an override reads the workspace, and its plans only when
   * one targets a plan.
   */
  async function subjectFor(ctx: FlagCtx, given: FlagSubject | undefined, stored: readonly StoredOverride[]): Promise<FlagSubject> {
    if (given) return given
    const subject = await callerSubject(ctx)
    if (!subject.userId) return subject
    const workspaceId = stored.some(readsWorkspace) ? await memberWorkspace(ctx, subject.userId, subject.workspaceId) : subject.workspaceId
    const plans = stored.some(readsPlans) && options.billing ? await options.billing.activePlans(ctx) : undefined
    return { ...subject, workspaceId, ...(plans ? { plans } : {}) }
  }

  const isEnabled: Flags<F>['isEnabled'] = async (ctx, key, subject) => {
    const definition = definitionOf(key)
    if (!definition) throw new TypeError(`[nuxt-backend] isEnabled: \`${key}\` is no flag. Declare it in defineFlags, or read one of the package's own: ${BACKEND_FLAG_KEYS.join(', ')}.`)
    const row = await ctx.runQuery(refs.flags.get, { key })
    return evaluateFlag(key, definition, row?.override, await subjectFor(ctx, subject, row ? [[key, row.override]] : []))
  }

  const requireFlag: Flags<F>['requireFlag'] = async (ctx, key, subject) => {
    if (await isEnabled(ctx, key, subject)) return
    throw backendError('forbidden', { reason: 'flag_off' }, `[nuxt-backend] The \`${key}\` flag is off for this caller.`)
  }

  const requireAdministrator = (ctx: FlagCtx, what: string) => requireAdministratorInPerson(ctx, reads, administrators, what)

  /** The app's experiments: its flags with variants. */
  const experiments = Object.entries(definitions).filter(([, definition]) => definition.variants?.length)

  /** Each experiment's variant for a subject, which of them run for it, and the promotions they show. */
  function variantsFor(rows: Map<string, FlagOverride>, subject: FlagSubject): Pick<FlagValues, 'variants' | 'running' | 'discounts'> {
    const variants: Record<string, string> = {}
    const running: string[] = []
    const discounts: Record<string, string> = {}
    for (const [key, definition] of experiments) {
      const picked = experimentVariant(key, definition, rows.get(key), subject)!
      variants[key] = picked.variant
      if (picked.running) running.push(key)
      const discount = (picked.running || rows.get(key)?.winner) ? definition.discounts?.[picked.variant] : undefined
      if (discount) discounts[key] = discount
    }
    return { variants, running, discounts }
  }

  /**
   * The caller's variant of one experiment, recording the exposure the
   * first time a running one shows it: an administrator's visit and nobody
   * signed in record nothing. A workspace's variant is read for a member
   * the member table still lists.
   */
  const variant: Flags<F>['variant'] = async (ctx, key) => {
    const definition = Object.hasOwn(definitions, key) ? definitions[key] : undefined
    if (!definition?.variants?.length) return undefined
    const row = await ctx.runQuery(refs.flags.get, { key })
    const stored: StoredOverride[] = row ? [[key, row.override]] : []
    const subject = await subjectFor(ctx, undefined, stored)
    const workspaceId = definition.by === 'workspace' && subject.userId ? await memberWorkspace(ctx, subject.userId, subject.workspaceId) : subject.workspaceId
    const picked = experimentVariant(key, definition, row?.override, { ...subject, workspaceId })!
    const identity = await ctx.auth.getUserIdentity()
    const visiting = typeof (identity as unknown as Record<string, unknown> | null)?.[IMPERSONATED_BY_CLAIM] === 'string'
    if (!picked.running || !picked.subjectId || !subject.userId || visiting) return picked.variant
    const exposure = await ctx.runMutation(refs.funnel.expose, {
      experiment: key,
      subject: picked.subjectId,
      userId: subject.userId,
      variant: picked.variant,
      variants: [...definition.variants],
      by: definition.by ?? 'user',
      ...(definition.goal ? { goal: definition.goal } : {}),
      guardrails: [...(definition.guardrails ?? [])],
    })
    if (exposure.exposed) {
      await options.audit.recordBackendEvent(ctx, {
        type: 'experiment.exposed',
        data: { experiment: key, variant: exposure.variant },
        ...(definition.by === 'workspace' ? { entityId: picked.subjectId } : {}),
      })
    }
    return exposure.variant
  }

  const getFlags = queryGeneric({
    args: {},
    handler: async (ctx): Promise<FlagValues> => {
      const rows = new Map((await ctx.runQuery(refs.flags.list, {})).map(row => [row.key, row.override]))
      const subject = await subjectFor(ctx, undefined, [...rows])
      const flags: Record<string, boolean> = {}
      for (const key of BACKEND_FLAG_KEYS) flags[key] = evaluateFlag(key, BACKEND_DEFINITION, rows.get(key), subject)
      for (const [key, definition] of Object.entries(definitions)) flags[key] = evaluateFlag(key, definition, rows.get(key), subject)
      return { flags, maintenance: flags.maintenance ? { message: rows.get('maintenance')?.message ?? '' } : null, ...variantsFor(rows, subject) }
    },
  })

  const listFlags = queryGeneric({
    args: {},
    handler: async (ctx): Promise<AdminFlag[] | null> => {
      if (!await isAdministratorNow(ctx, reads, administrators, 'listFlags')) return null
      const rows = new Map((await ctx.runQuery(refs.flags.list, {})).map(row => [row.key, row]))
      const entry = (key: string, definition: FlagDefinition, kind: { builtIn: boolean, declared: boolean }): AdminFlag => ({
        key,
        description: definition.description,
        ...kind,
        default: definition.default,
        by: definition.by ?? 'user',
        override: rows.get(key)?.override ?? null,
        updatedAt: rows.get(key)?.updatedAt ?? null,
      })
      // An override whose flag the code no longer declares: listed so an administrator can remove it.
      const leftOver = [...rows.keys()].filter(key => !definitionOf(key))
      return [
        ...BACKEND_FLAG_KEYS.map(key => entry(key, { ...BACKEND_DEFINITION, description: BACKEND_FLAGS[key].description }, { builtIn: true, declared: true })),
        ...Object.entries(definitions).map(([key, definition]) => entry(key, definition, { builtIn: false, declared: true })),
        ...leftOver.map(key => entry(key, { default: false, description: '' }, { builtIn: false, declared: false })),
      ]
    },
  })

  const setFlag = mutationGeneric({
    args: { key: v.string(), override: v.union(v.null(), vFlagOverride) },
    returns: v.null(),
    handler: async (ctx, { key, override }) => {
      await requireAdministrator(ctx, 'setFlag')
      // A flag the code no longer declares takes no override, but the one it left can be removed.
      if (!definitionOf(key) && (override !== null || !await ctx.runQuery(refs.flags.get, { key }))) throw backendError('invalid_input', { field: 'key' }, `[nuxt-backend] setFlag: \`${key}\` is no flag of this app.`)
      const stored = override === null ? null : normalizeOverride(key, override)
      if (stored && isOverrideProblem(stored)) {
        throw backendError('invalid_input', { field: stored.field, reason: stored.reason }, `[nuxt-backend] setFlag: ${stored.field} must be ${stored.reason}.`)
      }
      const variants = Object.hasOwn(definitions, key) ? definitions[key]!.variants : undefined
      if (stored?.winner !== undefined && !variants?.includes(stored.winner)) {
        throw backendError('invalid_input', { field: 'winner', reason: 'a variant of the flag' }, `[nuxt-backend] setFlag: \`${key}\` has no variant ${stored.winner}.`)
      }
      await ctx.runMutation(refs.flags.set, { key, override: stored })
      await options.audit.recordBackendEvent(ctx, { type: 'flag.changed', data: changeData(key, stored) })
      return null
    },
  })

  const exposeExperiment = mutationGeneric({
    args: { key: v.string() },
    returns: v.union(v.null(), v.object({ variant: v.string() })),
    handler: async (ctx, { key }) => {
      const picked = await variant(ctx, key as keyof F & string)
      return picked === undefined ? null : { variant: picked }
    },
  })

  const getExperiments = queryGeneric({
    args: {},
    handler: async (ctx): Promise<ExperimentResult[]> => {
      await requireAdministratorNow(ctx, reads, administrators, 'getExperiments')
      const rows = new Map((await ctx.runQuery(refs.flags.list, {})).map(row => [row.key, row.override]))
      return Promise.all(experiments.map(async ([key, definition]) => {
        const kinds = [...new Set([...(definition.goal ? [definition.goal] : []), ...(definition.guardrails ?? [])])]
        const read = await ctx.runQuery(refs.funnel.experimentCounts, { experiment: key, variants: [...definition.variants!], kinds })
        return experimentResult(key, definition, rows.get(key) ?? null, read)
      }))
    },
  })

  return {
    definitions,
    isEnabled,
    requireFlag,
    variant,
    api: { getFlags, listFlags, setFlag, exposeExperiment, getExperiments } as unknown as FlagsApi,
  }
}

// After setupFlags, so an export listing names the factory first.
export { BACKEND_FLAGS, defineFlags, FLAG_TARGETS_MAX, flagBucket, MAINTENANCE_MESSAGE_MAX, ROLLOUT_BUCKETS } from '../flags.js'
export type { ExperimentVerdict, RateInterval } from '../funnel-rules.js'
export type { BackendFlag, FlagDefinition, FlagDefinitions, FlagOverride, FlagRolloutSubject, FlagSubject, PausableService } from '../flags.js'
