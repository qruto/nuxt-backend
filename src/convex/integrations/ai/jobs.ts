import { WorkflowManager, type WorkflowComponent, type WorkflowCtx } from '@convex-dev/workflow'
import {
  type Auth,
  createFunctionHandle,
  type FunctionReference,
  type GenericActionCtx,
  type GenericDataModel,
  type GenericMutationCtx,
  type GenericQueryCtx,
  getFunctionName,
  internalActionGeneric,
  internalMutationGeneric,
  makeFunctionReference,
  mutationGeneric,
  paginationOptsValidator,
  queryGeneric,
  type RegisteredAction,
  type RegisteredMutation,
  type RegisteredQuery,
} from 'convex/server'
import { type ObjectType, type PropertyValidators, v } from 'convex/values'
import type { ComponentApi } from '../../components/backend/_generated/component.js'
import { DEFAULT_ADMIN_ROLES } from '../../constants.js'
import { backendError, getBackendError } from '../../errors.js'
import {
  budgetPeriod,
  bucketOf,
  checkQueuePolicy,
  DEFAULT_CONCURRENCY,
  DEFAULT_MODEL_LIMIT,
  DEFAULT_STALL_AFTER,
  type JobTier,
  MAX_CONCURRENCY,
  type QueuePolicy,
  refundInFlight,
  retryDelay,
  STEP_ATTEMPTS,
  windowStartOf,
} from '../../jobs-policy.js'
import { logBackend } from '../../log.js'
import { type Administrators, createAccessReads, isAdministratorNow, requireAdministratorInPerson } from '../access.js'
import { setupAudit } from '../audit.js'
import type { CostReport, SpendReservation } from '../billing.js'
import { BILLING_ACCESS, BILLING_METERS, BILLING_TO } from '../billing/context.js'
import { requireCreditAmount } from '../billing/credits.js'
import type { Ai, AiModel, MeteredModel } from './config.js'
import { AI_CONTEXTS } from './context.js'
import { usageOf } from './costs.js'
import { catalogPayload, classifyStepError, failurePayload, isPassing, modelOutcomeOf } from './job-errors.js'
import type { ModerationInput } from './moderation.js'
import { meteredModel, type ModelCall, modelIdOf, modelRefusal, requireModelId, routeModel } from './models.js'
import { provenVisitor } from '../../visitor.js'
import { imageStore, type ImageStoreContext, type JobProvenance, type ProvenanceRefs } from './provenance.js'

export type { JobTier } from '../../jobs-policy.js'

// The generation queue: `defineJobQueue` in backend/jobs.ts. Jobs run as
// durable workflows on the app's Workflow component; the queue's policy
// lives in the backend component (components/backend/jobs.ts) and in
// jobs-policy.ts. The queue's own functions are exported from
// backend/jobs.ts with `jobs.api`, and the queue schedules them by name:
// `jobs:runQueue` (the pick, the stall sweep, progress and each workflow's
// end) and `jobs:billJob` (the charge, the refund and the cost report).

/** The module `defineJobQueue` lives in: the queue schedules its own functions there, by name. */
const MODULE = 'jobs'
const RUN_QUEUE = makeFunctionReference<'mutation'>(`${MODULE}:runQueue`) as unknown as FunctionReference<'mutation', 'internal'>
const BILL_JOB = makeFunctionReference<'action'>(`${MODULE}:billJob`) as unknown as FunctionReference<'action', 'internal'>

/** How long a queued job's credits are held: a week, the longest a reservation may last. */
const HOLD_MS = 7 * 24 * 60 * 60 * 1000

/** How many times a failed job's refund is tried before it waits for an administrator: about four hours of tries. */
const REFUND_ATTEMPTS = 8

/** The wait before a refund's next try: a minute, doubling, at most two hours. */
const refundBackoff = (attempt: number): number => Math.min(2 ** attempt * 60_000, 2 * 60 * 60 * 1000)

/** How many times the claim at sign-up looks for the new account's workspace: about a minute of tries. */
const CLAIM_ATTEMPTS = 7

/** The wait before the claim's next look: a second, doubling. */
const claimBackoff = (attempt: number): number => 2 ** attempt * 1000

/** How many times a step may find no free turn before its job fails: about a day at one call a minute. */
const MAX_WAITS = 1500

/** The owner of a job the app runs for itself (`billTo: 'app'`): the images its steps store are the app's, in no account's quota, export or erasure. */
const APP_OWNER = 'app'

/** The prefix of a failed workflow's message that carries a catalog error from the job's handler. */
const CATALOG_MARK = 'nuxt-backend:job-error:'

/** The components `defineJobQueue` reads from your generated `components` object. */
export interface JobQueueComponents {
  /** The `backend` component: the queue's rows live there. */
  backend: object
  /** The Workflow component the jobs run on, as the scaffold mounts it. */
  workflow?: WorkflowComponent
}

/** The backend component's handles the queue calls. */
type JobBackend = Pick<ComponentApi<'backend'>, 'jobs' | 'adapter'> & Partial<Pick<ComponentApi<'backend'>, 'flags' | 'audit'>>

/** Jobs a signed-out visitor may start (`defineJobQueue({ guest })`). */
export interface GuestJobs {
  /**
   * How many jobs one visitor (one browser, by its cookie) may start before
   * signing up: `1` is one free try. Counts the jobs that wait, run or are
   * done; a failed or canceled one gives its try back. A done one stays
   * used for the visitor cookie's year, after its record is pruned.
   */
  perVisitor: number
}

/** Where a model's limit starts, and the range it adapts within, in calls a minute. */
export interface JobModelLimit {
  perMinute: number
  /** The floor a `429` halves it to. Default `1`. */
  min?: number
  /** The ceiling clean calls grow it to. Default `30`. */
  max?: number
}

export interface DefineJobQueueOptions {
  /** Your `setupAi(...)` instance: jobs share its billing, its model route, its `ai` rate limit and the `pause_ai` switch. */
  ai: Ai
  /** How many jobs run at once across the app. Default `3`; the admin console changes it without a deploy. */
  concurrency?: number
  /** Running jobs one owner may have, for a tier that sets none. Default `1`. */
  perOwner?: number
  /** What each plan gets in the line, best first. See {@link JobTier}. */
  tiers?: Record<string, JobTier>
  /** Where each model's limit starts. A model not listed starts at 6 calls a minute, between 1 and 30. */
  models?: Record<string, JobModelLimit>
  /** How long a running job may go without a sign of life before it fails and is refunded, in ms. Default 5 minutes. */
  stallAfter?: number
  /** The Workflow component the jobs run on. Default `components.workflow`. */
  workflow?: WorkflowComponent
  /**
   * Let a signed-out visitor start jobs of the kinds defined with
   * `guest: true`, after `verifyHuman` in the same mutation: free, under
   * the `aiGlobal` limit, at the guest rank, and claimed by the account
   * that signs up in their browser. Needs setupAi's `rateLimiter`.
   */
  guest?: GuestJobs
}

/** How far a job got, as `job.progress` reports it. */
export interface JobProgress {
  done: number
  total: number
  label?: string
}

/** What a job's handler gets: its id, and the durable calls it orders. */
export interface JobContext {
  /** The job's id. */
  id: string
  /**
   * Run a step and return what it returned. A step that finds no free turn
   * at its model, or answers `429`, a timeout or a passing provider error,
   * is waited for and run again, up to 4 attempts.
   */
  run: <Step extends FunctionReference<'action', 'internal'>>(step: Step, args: Omit<Step['_args'], 'queuedJob'>) => Promise<StepResult<Step['_returnType']>>
  /** Report how far the job got: `useJob` shows it, and it tells the queue the job is alive. */
  progress: (progress: JobProgress) => Promise<void>
}

/**
 * What a step returned, as `job.run` hands it back: the `value` member of the
 * step's registered return type. Its other member, a record of any keys,
 * is the queue's own outcome and never reaches the handler.
 */
export type StepResult<Returned> = 0 extends (1 & Returned)
  ? unknown
  : Returned extends { value: infer Value } ? (string extends keyof Returned ? never : Value) : never

/** A kind of job: `jobs.define`. */
export interface JobDefinition<Args extends PropertyValidators, Result> {
  /** The credit meter its price is held from and charged to, or `false` for a free job. */
  meter: string | false
  /** Its price in credits: a number, or read from the args once when it joins. Default `1`. */
  cost?: number | ((args: ObjectType<Args>) => number)
  /**
   * A signed-out visitor may start it too (`defineJobQueue({ guest })`):
   * free for them, the app pays. A member who starts it pays as for any
   * other kind.
   */
  guest?: boolean
  /**
   * What to check with the safety classifier (`setupAi({ moderation })`),
   * from the args: as the job's first step, before the charge. A flagged
   * job fails with `invalid_input`, reason `content_blocked`, and its
   * hold is released.
   */
  moderate?: (args: ObjectType<Args>) => ModerationInput
  args: Args
  /** The steps, in order. Runs as a durable workflow: read data and call models in steps, never here. */
  handler: (job: JobContext, args: ObjectType<Args>) => Promise<Result>
}

/** What a step's handler gets beside the action context. */
export interface JobStepContext extends ImageStoreContext {
  /** The model to call: the step's own, or another by id or object. */
  model: (model?: AiModel) => MeteredModel
  /** The job it runs for, and which attempt this is. */
  job: { id: string, attempt: number }
}

/** A step of a job: `jobs.step`. */
export interface JobStepDefinition<Args extends PropertyValidators, Result> {
  /** The model its calls go to: the step takes a turn from this model's limit before it runs. */
  model?: AiModel
  args: Args
  handler: (ctx: GenericActionCtx<GenericDataModel> & JobStepContext, args: ObjectType<Args>) => Promise<Result>
}

/** A job as `getJob` reads it, for `useJob`. */
export interface JobView {
  id: string
  kind: string
  status: 'queued' | 'running' | 'done' | 'failed' | 'canceled'
  waitingOn?: 'line' | 'owner' | 'paused'
  position?: number | null
  estimatedWait?: number
  progress?: JobProgress
  result?: unknown
  /** Why it failed, as a catalog error payload: `{ code, ...fields }`. */
  error?: Record<string, unknown>
  joinedAt: number
  startedAt?: number
  endedAt?: number
  /** Whether the caller may cancel it. */
  canCancel: boolean
  /**
   * What made its result, once it is `done` and `setupAi({ provenance })` is
   * on: the models its steps called, when it finished, and the ids of the
   * inputs its `ctx.storeImage` calls named.
   */
  provenance?: JobProvenance
}

/** A job as the admin console lists it. */
export interface AdminJobView {
  id: string
  kind: string
  owner: string
  userId?: string
  tier?: string
  status: JobView['status']
  /** A job a signed-out visitor started: `owner` is `guest:<visitor>` until a sign-up claims it. */
  guest: boolean
  attempts: number
  retries: number
  cost: number
  joinedAt: number
  startedAt?: number
  endedAt?: number
  error?: Record<string, unknown>
  /** The provider's own text for the last failed attempt, cut to 500 characters. */
  lastError?: string
  deadLetter: boolean
}

/** What `setQueue` takes. Each tier field takes `null` to go back to `backend/jobs.ts`. */
export interface QueueChange {
  paused?: boolean
  concurrency?: number | null
  tier?: { name: string, perOwner?: number | null, dedicated?: number | null, budget?: { units: number } | null }
  model?: { id: string, perMinute?: number, min?: number, max?: number }
}

/** The functions behind `useJob()` and the admin console's Queue tab, to re-export from `backend/jobs.ts`. */
export interface JobQueueApi {
  getJob: RegisteredQuery<'public', { jobId: string }, Promise<JobView | null>>
  cancelJob: RegisteredMutation<'public', { jobId: string, refund?: boolean }, Promise<null>>
  getQueue: RegisteredQuery<'public', Record<string, never>, Promise<unknown>>
  listJobs: RegisteredQuery<'public', { paginationOpts: { numItems: number, cursor: string | null }, deadLetters?: boolean }, Promise<unknown>>
  setQueue: RegisteredMutation<'public', QueueChange & Record<string, unknown>, Promise<null>>
  retryJob: RegisteredMutation<'public', { jobId: string }, Promise<null>>
  discardJob: RegisteredMutation<'public', { jobId: string }, Promise<null>>
  /** Internal: the pick, the stall sweep, a job's progress and each job's end. */
  runQueue: RegisteredMutation<'internal', Record<string, unknown>, Promise<null>>
  /** Internal: a job's charge, refund and cost report. */
  billJob: RegisteredAction<'internal', { op: 'charge' | 'refund' | 'report' | 'moderate', jobId: string, attempt?: number, input?: ModerationInput }, Promise<null | { blocked: Record<string, unknown> }>>
}

/** What `jobs.enqueue` takes beside the kind and its args. */
export interface EnqueueOptions {
  /** Who owns and pays for the job: the caller's billing entity (`'entity'`, the default), or the app itself (`'app'`, a `meter: false` kind). */
  billTo?: 'entity' | 'app'
}

/** The queue `defineJobQueue` returns. */
export interface JobQueue {
  /** Declare a kind of job. Export it: Convex registers it by name. */
  define: <Args extends PropertyValidators, Result>(definition: JobDefinition<Args, Result>) => RegisteredMutation<'internal', Record<string, unknown>, Promise<unknown>>
  /** Declare a step a job runs: an internal action whose `ctx.model()` calls its model. Export it. */
  step: <Args extends PropertyValidators, Result>(definition: JobStepDefinition<Args, Result>) => RegisteredAction<'internal', ObjectType<Args> & { queuedJob?: { id: string, attempt: number } }, Promise<{ value: Result } | Record<string, unknown>>>
  /**
   * Put a job in line from a mutation of yours: checks the caller, the
   * `pause_ai` switch, the model route, the `ai` limit, the tier's budget and
   * the credits, in that order; a refusal throws and rolls the mutation
   * back. Resolves with the job's id.
   *
   * `{ billTo: 'app' }` puts in line a job the app runs for itself, such as
   * content it seeds for everyone: a `meter: false` kind, owned by the app
   * rather than the caller's billing entity, with nobody signed in needed.
   * It checks `pause_ai`, the model route and the `aiGlobal` limit, counts
   * in no budget, and the images its steps store are the app's: in no
   * account's quota, export or erasure, read with `storage.fileUrl` and
   * deleted with `storage.release`. Decide in your mutation who may start it.
   */
  enqueue: <Kind extends FunctionReference<'mutation', 'internal'>>(ctx: GenericMutationCtx<GenericDataModel>, job: Kind, args: Record<string, unknown>, options?: EnqueueOptions) => Promise<{ jobId: string }>
  api: JobQueueApi
}

type Ctx = GenericMutationCtx<GenericDataModel>
type ActionCtx = GenericActionCtx<GenericDataModel>
type ReadCtx = GenericQueryCtx<GenericDataModel>
type StepOutcome = { value?: unknown, ok: true } | { wait: number } | { retry: number } | { fail: Record<string, unknown> }
type JobRow = {
  _id: string
  kind: string
  args: unknown
  owner: string
  userId?: string
  visitor?: string
  status: JobView['status']
  tier?: string
  cost: number
  meter?: string
  hold?: Omit<SpendReservation, 'entityId'>
  charged: boolean
  refunded: boolean
  charging?: number
  refundOwed?: 'pending' | 'given_up'
  refundAt?: number
  workflowId?: string
  attempts: number
  retries: number
  progress?: JobProgress
  result?: unknown
  error?: Record<string, unknown>
  lastError?: string
  usage?: { usd?: number, input: number, output: number, cached: number, models: string[] }
  deadLetter?: boolean
  joinedAt: number
  startedAt?: number
  endedAt?: number
  budgetCounted: number
  refund?: boolean
  cancel?: { by: string, refund: boolean }
}

/** The error a failed workflow carries: a catalog error's payload behind a mark, else the plain message. */
function markedError(error: unknown): Error {
  const payload = catalogPayload(error)
  return payload ? new Error(`${CATALOG_MARK}${JSON.stringify(payload)}`) : (error instanceof Error ? error : new Error(String(error)))
}

/** A catalog error's payload read back from a failed workflow's message. */
function payloadOfMessage(message: string): Record<string, unknown> | undefined {
  const at = message.indexOf(CATALOG_MARK)
  if (at === -1) return undefined
  const json = message.slice(at + CATALOG_MARK.length).split('\n')[0]!
  try {
    const payload = JSON.parse(json) as Record<string, unknown>
    return typeof payload.code === 'string' ? payload : undefined
  }
  catch {
    return undefined
  }
}

/** A refusal's payload, as the job row keeps it. */
const payloadOf = (error: unknown): Record<string, unknown> => catalogPayload(error) ?? { code: 'unavailable', service: 'ai', reason: 'job_failed' }

const failure = (reason: 'provider_refused' | 'stalled' | 'job_failed') => ({ code: 'unavailable', service: 'ai', reason })

/** The fields that are set: a Convex value has no `undefined` in it. */
function defined<T extends Record<string, unknown>>(fields: T): T {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as T
}

/** The provider's own text for an error, for administrators only. */
const errorText = (error: unknown): string => (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 500)

/**
 * Declare the app's generation queue, once, in `backend/jobs.ts`: kinds of
 * jobs (`jobs.define`) run their steps (`jobs.step`) in a fair line with
 * tiers from plan features, each model under a limit that adapts to `429`s,
 * credits held while a job waits, charged when it starts and refunded when
 * it fails, and each job's cost reported to the billing provider.
 *
 * @example
 * ```ts
 * // backend/jobs.ts
 * import { defineJobQueue } from 'nuxt-backend/ai'
 * import { MINUTE } from 'nuxt-backend/rate-limit'
 * import { components } from './_generated/api'
 * import { ai } from './ai'
 *
 * export const jobs = defineJobQueue(components, {
 *   ai,
 *   concurrency: 3,
 *   tiers: { priority: { feature: 'priority_queue', headStart: 10 * MINUTE }, standard: {} },
 * })
 *
 * export const { getJob, cancelJob, getQueue, listJobs, setQueue, retryJob, discardJob, runQueue, billJob } = jobs.api
 * ```
 */
export function defineJobQueue(components: JobQueueComponents, options: DefineJobQueueOptions): JobQueue {
  const context = AI_CONTEXTS.get(options.ai)
  if (!context) throw new TypeError('[nuxt-backend] defineJobQueue: `ai` is not a setupAi instance. Pass the app\'s, from ai.ts.')
  const { billing, rateLimiter, paused, refuseAi, config: aiConfig } = context
  const workflowComponent = options.workflow ?? components.workflow
  if (!workflowComponent) throw new TypeError('[nuxt-backend] defineJobQueue: no Workflow component. Mount `@convex-dev/workflow` in convex.config.ts as `workflow`, or pass `workflow`.')
  const workflow = new WorkflowManager(workflowComponent)
  const backend = components.backend as JobBackend
  const queue = backend.jobs
  const provenanceRows = (components.backend as unknown as { ai: ProvenanceRefs }).ai

  const policy: QueuePolicy = {
    concurrency: options.concurrency ?? DEFAULT_CONCURRENCY,
    perOwner: options.perOwner ?? 1,
    stallAfter: options.stallAfter ?? DEFAULT_STALL_AFTER,
    tiers: Object.entries(options.tiers ?? {}).map(([name, tier]) => ({ name, ...tier })),
  }
  checkQueuePolicy(policy)
  const guest = options.guest
  if (guest !== undefined) {
    if (!(Number.isInteger(guest.perVisitor) && guest.perVisitor >= 1)) throw new TypeError('[nuxt-backend] defineJobQueue: `guest.perVisitor` is a whole number of 1 or more.')
    if (!rateLimiter) throw new TypeError('[nuxt-backend] defineJobQueue({ guest }): guest jobs spend the app-wide `aiGlobal` limit, so setupAi needs a `rateLimiter`.')
  }
  const models = Object.entries(options.models ?? {}).map(([model, limit]) => {
    requireModelId(model, 'defineJobQueue({ models })')
    const resolved = { model, perMinute: limit.perMinute, min: limit.min ?? DEFAULT_MODEL_LIMIT.min, max: limit.max ?? DEFAULT_MODEL_LIMIT.max }
    if (!(resolved.min >= 1 && resolved.min <= resolved.perMinute && resolved.perMinute <= resolved.max)) {
      throw new Error(`[nuxt-backend] defineJobQueue: model \`${model}\` needs 1 ≤ min ≤ perMinute ≤ max.`)
    }
    return resolved
  })
  const modelDefaults = new Map(models.map(({ model, ...limit }) => [model, limit]))

  const reads = createAccessReads(backend.adapter.findOne as never)
  const administrators: Administrators = { roles: DEFAULT_ADMIN_ROLES, userIds: [] }
  const audit = backend.audit ? setupAudit(components as never) : undefined
  const record = async (ctx: Ctx, event: Parameters<NonNullable<typeof audit>['recordBackendEvent']>[1]): Promise<void> => {
    try {
      await audit?.recordBackendEvent(ctx as never, event)
    }
    catch (error) {
      logBackend('warn', 'audit.record_failed', `A ${event.type} event was not recorded; the change went through.`, error)
    }
  }

  const schedulePick = (ctx: { scheduler: Ctx['scheduler'] }) => ctx.scheduler.runAfter(0, RUN_QUEUE, { op: 'pick' })
  const scheduleRefund = (ctx: { scheduler: Ctx['scheduler'] }, jobId: string, attempt = 0, delay = 0) =>
    ctx.scheduler.runAfter(delay, BILL_JOB, { op: 'refund', jobId, ...(attempt > 0 ? { attempt } : {}) })

  // ── Kinds and steps ─────────────────────────────────────────────────────

  const jobContext = (step: WorkflowCtx, jobId: string): JobContext => ({
    id: jobId,
    run: (async (stepRef: FunctionReference<'action', 'internal'>, args: Record<string, unknown>) => {
      let attempt = 1
      let waits = 0
      for (;;) {
        const outcome = await step.runAction(stepRef, { ...args, queuedJob: { id: jobId, attempt } }, { retry: false }) as StepOutcome
        if ('ok' in outcome) return outcome.value
        if ('wait' in outcome && ++waits <= MAX_WAITS) {
          await step.sleep(outcome.wait)
          continue
        }
        if ('retry' in outcome && attempt < STEP_ATTEMPTS) {
          await step.sleep(outcome.retry)
          attempt++
          continue
        }
        // The step recorded why; the job ends with it, as a catalog error.
        throw new Error(`${CATALOG_MARK}${JSON.stringify('fail' in outcome ? outcome.fail : failure('provider_refused'))}`)
      }
    }) as JobContext['run'],
    progress: async (progress) => {
      await step.runMutation(RUN_QUEUE, { op: 'progress', jobId, progress }, { inline: true })
    },
  })

  /**
   * Refuse a count meter where a job is defined: a failed job's refund is a
   * negative usage event, which only a sum meter takes. A meter the catalog
   * does not hold yet (before the first `billing sync`) passes here, so the
   * module still loads and deploys, and a job of it is refused as it is put
   * in line instead.
   */
  const requireRefundableMeter = (meter: string): void => {
    let resolved: { property?: string } | null | undefined
    try {
      resolved = BILLING_METERS.get(billing)?.({ meter })
    }
    catch {
      return
    }
    if (resolved && !resolved.property) {
      throw new TypeError(`[nuxt-backend] jobs.define: meter '${meter}' counts events, so a failed job's credits could never go back. Price jobs on a sum meter (one with a \`property\`).`)
    }
  }

  const define: JobQueue['define'] = (definition) => {
    if (definition.meter !== false) requireRefundableMeter(definition.meter)
    if (definition.meter !== false && typeof definition.cost === 'number') requireCreditAmount(definition.cost, 'jobs.define: `cost`')
    const kind = workflow.define({
      args: { jobId: v.string(), args: v.any() },
      handler: async (step, { jobId, args }): Promise<unknown> => {
        if (definition.moderate) {
          // The safety check first: a flagged job is never charged, and its hold goes back as it ends.
          const checked = await step.runAction(BILL_JOB, { op: 'moderate', jobId, input: definition.moderate(args as never) }, { retry: { maxAttempts: 3, initialBackoffMs: 2000, base: 2 } }) as { blocked: Record<string, unknown> } | null
          if (checked?.blocked) throw new Error(`${CATALOG_MARK}${JSON.stringify(checked.blocked)}`)
        }
        if (definition.meter !== false) {
          await step.runAction(BILL_JOB, { op: 'charge', jobId }, { retry: { maxAttempts: 3, initialBackoffMs: 2000, base: 2 } })
        }
        try {
          return await definition.handler(jobContext(step, jobId), args as never)
        }
        catch (error) {
          throw markedError(error)
        }
      },
    }) as unknown as { _handler: (ctx: Ctx, args: Record<string, unknown>) => Promise<unknown> }
    return internalMutationGeneric({
      args: {
        workflowId: v.optional(v.string()),
        generationNumber: v.optional(v.number()),
        args: v.optional(v.any()),
        startAsync: v.optional(v.boolean()),
        onComplete: v.optional(v.string()),
        context: v.optional(v.any()),
        // The queue asks a kind for its price where it joins: checked against the kind's args.
        quote: v.optional(v.object(definition.args)),
      },
      returns: v.any(),
      handler: async (ctx, { quote, ...rest }) => {
        if (quote !== undefined) {
          const cost = typeof definition.cost === 'function' ? definition.cost(quote as never) : (definition.cost ?? 1)
          return { quote: { meter: definition.meter, cost, guest: definition.guest === true } }
        }
        return await kind._handler(ctx, rest)
      },
    }) as never
  }

  /** A model's starting limit, when the queue lists it: as the component's calls take it. */
  const defaultsOf = (model: string | undefined) => {
    const defaults = model === undefined ? undefined : modelDefaults.get(model)
    return defaults ? { defaults } : {}
  }
  const lease = () => Date.now() + policy.stallAfter

  /** A turn from the model's bucket; none free, and the wait until one frees up, as the step's outcome. */
  const takeTurn = async (ctx: ActionCtx, jobId: string, modelId: string | undefined): Promise<StepOutcome | undefined> => {
    if (!modelId || !rateLimiter) return undefined
    const limit = await ctx.runQuery(queue.modelLimit, { model: modelId, ...defaultsOf(modelId) })
    const turn = await rateLimiter.limit(ctx as never, 'jobModel' as never, { key: modelId, config: bucketOf(limit.perMinute) })
    if (turn.ok) return undefined
    const wait = Math.max(1000, turn.retryAfter ?? 1000)
    await ctx.runMutation(queue.touch, { jobId, until: lease() + wait })
    return { wait }
  }

  /** What a failed attempt hands `job.run`: wait and try again, or fail the job with a catalog error it recorded. */
  const failedAttempt = async (ctx: ActionCtx, attempt: { jobId: string, attempt: number, modelId?: string }, error: unknown, calls: ModelCall[]): Promise<StepOutcome> => {
    const { jobId, modelId } = attempt
    const failed = classifyStepError(error, calls)
    const text = errorText(error)
    logBackend('warn', 'ai.job_step_failed', `Job ${jobId}, attempt ${attempt.attempt}: a step failed (${failed.kind}).`, error)
    await ctx.runMutation(queue.touch, defined({ jobId, until: lease(), lastError: text, usage: usageOf(calls), spendLimitUsd: aiConfig.spendLimit?.usdPerDay }))
    const outcome = modelOutcomeOf(failed)
    if (modelId && outcome) await ctx.runMutation(queue.recordModel, { model: modelId, outcome, ...defaultsOf(modelId) })
    if (isPassing(failed) && attempt.attempt < STEP_ATTEMPTS) {
      const wait = retryDelay(attempt.attempt, failed.retryAfter, `${jobId}:${modelId ?? ''}`)
      await ctx.runMutation(queue.touch, { jobId, until: lease() + wait })
      return { retry: wait }
    }
    const payload = failurePayload(failed)
    await ctx.runMutation(queue.recordError, { jobId, error: payload, lastError: text })
    return { fail: payload }
  }

  const step: JobQueue['step'] = (definition) => {
    if (definition.model !== undefined) requireModelId(definition.model, 'jobs.step')
    const modelId = definition.model === undefined ? undefined : modelIdOf(definition.model)
    return internalActionGeneric({
      args: { ...definition.args, queuedJob: v.optional(v.object({ id: v.string(), attempt: v.number() })) },
      returns: v.any(),
      handler: async (ctx, { queuedJob, ...args }): Promise<StepOutcome> => {
        if (!queuedJob) throw new Error('[nuxt-backend] A jobs.step runs through job.run in a job\'s handler.')
        const { id: jobId, attempt } = queuedJob
        // A turn from the model's bucket first: none free, and the step waits without counting an attempt.
        const waiting = await takeTurn(ctx, jobId, modelId)
        if (waiting) return waiting
        await ctx.runMutation(queue.touch, { jobId, until: lease(), attempt: true })
        const calls: ModelCall[] = []
        const pick = (model?: AiModel): MeteredModel => {
          const chosen = model ?? definition.model ?? aiConfig.model
          if (chosen === undefined) throw new Error('[nuxt-backend] ctx.model(): no model to call — set `model` on the step or on setupAi, or pass one.')
          requireModelId(chosen, 'ctx.model()')
          return meteredModel(routeModel(chosen, undefined, aiConfig.inferenceRegion), calls, aiConfig.inferenceRegion)
        }
        let value: unknown
        try {
          const storeImage = imageStore(ctx, aiConfig.provenance, provenanceRows, { jobId, calls, model: modelId })
          value = await definition.handler(Object.assign(ctx, { model: pick, job: { id: jobId, attempt }, storeImage }) as never, args as never)
        }
        catch (error) {
          return await failedAttempt(ctx, { jobId, attempt, modelId }, error, calls)
        }
        const usage = usageOf(calls)
        await ctx.runMutation(queue.touch, defined({ jobId, until: lease(), usage, spendLimitUsd: aiConfig.spendLimit?.usdPerDay }))
        for (const model of usage?.models ?? []) await ctx.runMutation(queue.recordModel, { model, outcome: 'ok', ...defaultsOf(model) })
        return { ok: true, value }
      },
    }) as never
  }

  // ── Joining the line ────────────────────────────────────────────────────

  /** The plans on sale that grant any of `features` and the owner lacks, cheapest tier first. */
  const plansFor = async (ctx: Ctx, owner: string, features: readonly string[]): Promise<string[]> => {
    const plans: string[] = []
    for (const feature of features) {
      try {
        await billing.requireFeature(ctx as never, feature, { userId: owner })
      }
      catch (error) {
        const refusal = getBackendError(error)
        if (refusal?.code !== 'feature_required') throw error
        for (const plan of refusal.data.plans ?? []) if (!plans.includes(plan)) plans.push(plan)
      }
    }
    return plans
  }

  /** Count the job's cost in its owner's budget window, or refuse it as the tier's budget says. */
  const countBudget = async (ctx: Ctx, owner: string, cost: number, force = false): Promise<{ budgetWindow?: number, budgetCounted: number }> => {
    const period = budgetPeriod(policy)
    if (period === undefined) return { budgetCounted: 0 }
    const now = Date.now()
    const windowStart = windowStartOf(now, period)
    const state = await ctx.runQuery(queue.ownerState, { owner, windowStart, policy })
    const units = state.tiers[state.rank]?.units
    if (!force && units !== undefined) {
      // Better tiers that would take this job, cheapest first (the last-listed fits the smallest upgrade).
      const better = state.tiers.slice(0, state.rank).filter(tier => tier.feature).reverse()
      if (cost > units) {
        const fitting = better.filter(tier => tier.units === undefined || tier.units >= cost)
        for (const tier of fitting) {
          const plans = await plansFor(ctx, owner, [tier.feature!])
          if (plans.length > 0) throw backendError('feature_required', { feature: tier.feature!, plans }, `[nuxt-backend] This job costs ${cost} credits, over the ${units} a day this plan's queue allows.`)
        }
        throw backendError('invalid_input', { field: 'cost', reason: 'over_budget', need: cost, units }, `[nuxt-backend] This job costs ${cost} credits, over any budget of the queue (${units} here).`)
      }
      if (state.used + cost > units) {
        const fitting = better.filter(tier => tier.units === undefined || state.used + cost <= tier.units)
        const plans = await plansFor(ctx, owner, fitting.map(tier => tier.feature!))
        const retryAfter = windowStart + period - now
        throw backendError('rate_limited', { limit: 'jobBudget', retryAfter, plans }, `[nuxt-backend] The queue's budget for this window is spent: ${state.used} of ${units} credits.`)
      }
    }
    await ctx.runMutation(queue.countBudget, { owner, windowStart, cost, force: true })
    return { budgetWindow: windowStart, budgetCounted: cost }
  }

  /** A kind's price for these args, asked of the kind itself (its args checked by its validator). */
  const quoteOf = async (ctx: Ctx, kindRef: FunctionReference<'mutation', 'internal'>, args: Record<string, unknown>) => {
    const name = getFunctionName(kindRef)
    const quoted = await ctx.runMutation(kindRef, { quote: args } as never) as { quote?: { meter: string | false, cost: number, guest?: boolean } } | null
    if (!quoted?.quote) throw new TypeError(`[nuxt-backend] jobs.enqueue: ${name} is no jobs.define export.`)
    const { meter, cost, guest: forGuests = false } = quoted.quote
    if (meter !== false) requireCreditAmount(cost, `jobs.enqueue: ${name}'s \`cost\``)
    else if (!(Number.isFinite(cost) && cost >= 0)) throw new Error(`[nuxt-backend] jobs.enqueue: ${name}'s \`cost\` is a number of 0 or more.`)
    return { meter, cost, forGuests }
  }

  /** Refuse a job when a model the queue lists, or setupAi's, has no route on this deployment. */
  const requireModelRoutes = (): void => {
    for (const model of [...modelDefaults.keys(), ...(aiConfig.model === undefined ? [] : [aiConfig.model])]) {
      const route = routeModel(model, undefined, aiConfig.inferenceRegion)
      if (route.route === 'missing') throw modelRefusal(route)
    }
  }

  /** The `ai` rate limit, per owner. */
  const limitCalls = async (ctx: Ctx, owner: string): Promise<void> => {
    if (!rateLimiter) return
    const { ok, retryAfter } = await rateLimiter.limit(ctx as never, 'ai', { key: owner, throws: true })
    if (!ok) throw backendError('rate_limited', defined({ limit: 'ai', retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined }), '[nuxt-backend] Rate limit reached.')
  }

  /** Hold a job's credits while it waits; nothing for a free job. */
  const holdCredits = async (ctx: Ctx, owner: string, meter: string | false, cost: number) => meter === false
    ? undefined
    : holdData(await billing.reserveCredits(ctx as never, { userId: owner, meter, value: cost, externalId: `job-${crypto.randomUUID()}`, hold: HOLD_MS, allowRefresh: false }))

  /** The app-wide `aiGlobal` limit, unkeyed: what bounds the jobs the app pays for itself. */
  const limitGlobal = async (ctx: Ctx): Promise<void> => {
    const { ok, retryAfter } = await rateLimiter!.limit(ctx as never, 'aiGlobal', { throws: true })
    if (!ok) throw backendError('rate_limited', defined({ limit: 'aiGlobal', retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined }), '[nuxt-backend] Rate limit reached.')
  }

  /**
   * A signed-out caller's job: a kind defined with `guest: true`, from a
   * visitor `verifyHuman` proved in this mutation, under `perVisitor`, then
   * `pause_ai`, the model routes and the `aiGlobal` limit. It holds no
   * credits and counts in no budget: the app pays.
   */
  const enqueueGuest = async (ctx: Ctx, kindRef: FunctionReference<'mutation', 'internal'>, args: Record<string, unknown>, cost: number, forGuests: boolean): Promise<{ jobId: string }> => {
    const visitor = provenVisitor(ctx)
    if (!guest || !forGuests || !visitor) throw backendError('unauthenticated', {}, '[nuxt-backend] Sign in to start this job.')
    if (await ctx.runQuery(queue.visitorJobs, { visitor }) >= guest.perVisitor) {
      throw backendError('unauthenticated', {}, '[nuxt-backend] This browser has used its free jobs: sign up to start more.')
    }
    await refuseAi(ctx)
    requireModelRoutes()
    await limitGlobal(ctx)
    const jobId = await ctx.runMutation(queue.join, {
      kind: getFunctionName(kindRef),
      args,
      owner: `guest:${visitor}`,
      visitor,
      cost,
      budgetCounted: 0,
      policy,
      // The claim at sign-up wakes the queue by this handle.
      wake: await createFunctionHandle(RUN_QUEUE),
    })
    await schedulePick(ctx)
    return { jobId }
  }

  /**
   * A job the app runs for itself (`billTo: 'app'`): a free kind, owned by
   * the app, under `pause_ai`, the model routes and the `aiGlobal` limit.
   * It holds no credits and counts in no budget; the caller is the app's
   * mutation to decide.
   */
  const enqueueForApp = async (ctx: Ctx, kindRef: FunctionReference<'mutation', 'internal'>, args: Record<string, unknown>, meter: string | false, cost: number): Promise<{ jobId: string }> => {
    if (meter !== false) throw new TypeError(`[nuxt-backend] jobs.enqueue: ${getFunctionName(kindRef)} charges the \`${meter}\` meter; a job the app pays for (billTo: 'app') is a \`meter: false\` kind.`)
    await refuseAi(ctx)
    requireModelRoutes()
    if (rateLimiter) await limitGlobal(ctx)
    const jobId = await ctx.runMutation(queue.join, { kind: getFunctionName(kindRef), args, owner: APP_OWNER, cost, budgetCounted: 0, policy })
    await schedulePick(ctx)
    return { jobId }
  }

  const enqueue: JobQueue['enqueue'] = async (ctx, kindRef, args, options = {}) => {
    const { meter, cost, forGuests } = await quoteOf(ctx, kindRef, args)
    if (options.billTo === 'app') return await enqueueForApp(ctx, kindRef, args, meter, cost)
    if (options.billTo !== undefined && options.billTo !== 'entity') throw new TypeError('[nuxt-backend] jobs.enqueue: `billTo` is \'entity\' or \'app\'.')
    // 1. The caller: signed in, a member of the paying workspace, in person;
    // signed out, a visitor verifyHuman proved, for a kind open to guests.
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return await enqueueGuest(ctx, kindRef, args, cost, forGuests)
    const owner = (await billing.requireEntity(ctx as never, BILLING_ACCESS.spend)).userId
    // 2. The pause_ai switch. 3. The model routes. 4. The `ai` rate limit.
    await refuseAi(ctx)
    requireModelRoutes()
    await limitCalls(ctx, owner)
    // 5. The tier's budget. 6. The credits, held while the job waits.
    const budget = await countBudget(ctx, owner, cost)
    const hold = await holdCredits(ctx, owner, meter, cost)
    const jobId = await ctx.runMutation(queue.join, defined({
      kind: getFunctionName(kindRef),
      args,
      owner,
      userId: identity.subject,
      cost,
      meter: meter === false ? undefined : meter,
      hold,
      ...budget,
      policy,
    }))
    await schedulePick(ctx)
    return { jobId }
  }

  /** A reservation as the job row keeps it. */
  const holdData = (hold: SpendReservation) => defined({ externalId: hold.externalId, reserved: hold.reserved, value: hold.value, meter: hold.meter, meterId: hold.meterId })
  const reservationOf = (job: JobRow): SpendReservation | undefined => job.hold && { ...job.hold, entityId: job.owner }

  // ── The queue's own functions ───────────────────────────────────────────

  /** After a job ended: its hold let go, its credits refunded, its cost reported, as its end asks. */
  const afterEnd = async (ctx: Ctx, job: JobRow): Promise<void> => {
    const hold = reservationOf(job)
    // A charge on its way settles the hold, or lets it go, itself.
    if (hold && !job.charged && job.charging === undefined) await billing.releaseSpend(ctx as never, hold)
    if (job.refundOwed === 'pending') await scheduleRefund(ctx, job._id)
    if (job.status !== 'canceled' && job.usage && job.startedAt !== undefined) await ctx.scheduler.runAfter(0, BILL_JOB, { op: 'report', jobId: job._id })
  }

  /** Fail a running job whose lease ran out: refunded, and its workflow canceled. */
  const failStalled = async (ctx: Ctx, { jobId, workflowId }: { jobId: string, workflowId?: string }): Promise<void> => {
    await ctx.runMutation(queue.recordError, { jobId, error: failure('stalled') })
    const ended = await ctx.runMutation(queue.finish, { jobId, outcome: 'failed' }) as JobRow | null
    if (ended) await afterEnd(ctx, ended)
    logBackend('error', 'ai.job_stalled', `Job ${jobId} showed no sign of life for ${policy.stallAfter / 1000}s: failed and refunded.`)
    if (!workflowId) return
    try {
      await workflow.cancel(ctx, workflowId as never)
    }
    catch (error) {
      logBackend('warn', 'ai.job_cancel_failed', `The stalled job ${jobId}'s workflow could not be canceled.`, error)
    }
  }

  /** Fail the running jobs whose lease ran out, then fill the free slots. */
  const runPick = async (ctx: Ctx): Promise<void> => {
    for (const stalled of await ctx.runQuery(queue.stalled, { now: Date.now() })) await failStalled(ctx, stalled)
    const pausedAi = await paused(ctx, 'ai')
    // The component's sweep wakes the queue by this handle (crons.ts): no timer of the app's own while jobs run.
    const wake = await createFunctionHandle(RUN_QUEUE)
    const { started } = await ctx.runMutation(queue.pick, { policy, pausedAi, wake })
    for (const job of started) {
      const workflowId = await workflow.start(ctx, makeFunctionReference<'mutation'>(job.kind) as never, { jobId: job.jobId, args: job.args } as never, {
        onComplete: RUN_QUEUE as never,
        context: { jobId: job.jobId },
      })
      await ctx.runMutation(queue.attachWorkflow, { jobId: job.jobId, workflowId })
    }
  }

  /** A workflow's end (the Workflow component's onComplete): the job ends as its workflow did. */
  const endJob = async (ctx: Ctx, jobId: string, result: WorkflowResult): Promise<void> => {
    const ended = await ctx.runMutation(queue.finish, { jobId, ...endOf(jobId, result) }) as JobRow | null
    if (ended) await afterEnd(ctx, ended)
  }

  /**
   * The claim at sign-up, once the account's first session made its
   * workspace: the visitor's jobs the account claimed (in the auth library's
   * user-create hook) move to its billing entity, the workspace or, with
   * `billTo: 'user'`, the account, and the app's own rows follow through
   * `setupAi({ guest: { claim } })`. Without a workspace yet, it looks again
   * a little later, for about a minute.
   */
  const claimGuests = async (ctx: Ctx, userId: string, attempt: number): Promise<void> => {
    const member = await ctx.runQuery(backend.adapter.findOne, { model: 'member', where: [{ field: 'userId', value: userId }] }) as { organizationId?: string } | null
    const workspaceId = member?.organizationId
    if (!workspaceId) {
      if (attempt + 1 < CLAIM_ATTEMPTS) await ctx.scheduler.runAfter(claimBackoff(attempt), RUN_QUEUE, { op: 'claim', userId, attempt: attempt + 1 })
      else logBackend('error', 'ai.guest_claim_failed', `Account ${userId} has no workspace a minute after signing up: its guest jobs stay under their visitor.`)
      return
    }
    const owner = (BILLING_TO.get(billing) ?? 'workspace') === 'user' ? userId : workspaceId
    const jobIds = await ctx.runMutation(queue.moveClaimed, { userId, owner })
    const claim = aiConfig.guest?.claim
    if (jobIds.length === 0 || !claim) return
    try {
      await ctx.runMutation(claim, { jobIds, workspaceId, userId })
    }
    catch (error) {
      // The app's claim rolls back on its own; the jobs stay the account's.
      logBackend('error', 'ai.guest_claim_failed', `setupAi({ guest: { claim } }) threw for account ${userId}: its rows that name the jobs stay where they were.`, error)
    }
  }

  const runQueue = internalMutationGeneric({
    args: {
      op: v.optional(v.union(v.literal('pick'), v.literal('progress'), v.literal('claim'))),
      jobId: v.optional(v.string()),
      // A claim at sign-up: the account, and how many times it looked for its workspace.
      userId: v.optional(v.string()),
      attempt: v.optional(v.number()),
      progress: v.optional(v.object({ done: v.number(), total: v.number(), label: v.optional(v.string()) })),
      // A workflow's end (the Workflow component's onComplete).
      workflowId: v.optional(v.string()),
      result: v.optional(v.any()),
      context: v.optional(v.any()),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
      if (args.op === 'pick') {
        await runPick(ctx)
        return null
      }
      if (args.op === 'progress') {
        await ctx.runMutation(queue.touch, { jobId: args.jobId!, until: lease(), progress: checkedProgress(args.progress) })
        return null
      }
      if (args.op === 'claim') {
        if (args.userId) await claimGuests(ctx, args.userId, args.attempt ?? 0)
        return null
      }
      const jobId = (args.context as { jobId?: string } | undefined)?.jobId
      if (jobId && args.result) await endJob(ctx, jobId, args.result as WorkflowResult)
      // A workflow's end runs inside the Workflow component's own call: the next pick, which starts workflows, runs on its own.
      await schedulePick(ctx)
      return null
    },
  })

  /**
   * Charge a job's held credits, as its workflow's first step: only while
   * the job still runs and nobody canceled it. The hold is taken again under
   * the same id first, a no-op while it stands: after an attempt whose
   * ingest failed let it go, or a wait past its week let it lapse, the
   * credits are taken again, or the job fails short of them, so the
   * provider never bills what the cached balance still shows.
   */
  const charge = async (ctx: ActionCtx, job: JobRow): Promise<void> => {
    const hold = reservationOf(job)
    if (job.charged || !hold) return
    const claim = await ctx.runMutation(queue.claimCharge, { jobId: job._id })
    if (claim === 'charged') return
    if (claim === 'ended') throw new Error(`[nuxt-backend] Job ${job._id} ended before its charge: nothing was billed.`)
    try {
      const held = await billing.reserveCredits(ctx as never, { userId: job.owner, meter: hold.meter, meterId: hold.meterId, value: job.cost, externalId: hold.externalId, hold: HOLD_MS })
      // The job's hold id is the event's idempotency key: a charge run again never bills twice.
      await billing.settleSpend(ctx as never, held, { metadata: defined({ userId: job.userId, job: job.kind }) as Record<string, string> })
    }
    catch (error) {
      await billing.releaseSpend(ctx as never, hold)
      await ctx.runMutation(queue.recordError, { jobId: job._id, error: getBackendError(error) ? payloadOf(error) : failure('provider_refused'), lastError: errorText(error) })
      throw error
    }
    // A job that ended while its charge was on its way gets it back at once.
    const { refund: owed } = await ctx.runMutation(queue.mark, { jobId: job._id, charged: true })
    if (owed) await scheduleRefund(ctx, job._id)
  }

  /**
   * Give a failed job's charged credits back. A try that fails is tried
   * again, a minute later and doubling, up to {@link REFUND_ATTEMPTS} tries;
   * after that the job stays owed, and an administrator's retry runs it on
   * the charge it already paid.
   */
  const refund = async (ctx: ActionCtx, job: JobRow, attempt = 0): Promise<void> => {
    const hold = reservationOf(job)
    if (job.refundOwed !== 'pending' || job.refunded || !job.meter || !hold) return
    try {
      // The refund's own idempotency key: a try run again never refunds twice.
      await billing.refundCredits(ctx as never, { userId: job.owner, meter: job.meter, value: job.cost, externalId: `${hold.externalId}-refund` })
    }
    catch (error) {
      const next = attempt + 1
      if (next >= REFUND_ATTEMPTS) {
        await ctx.runMutation(queue.refundTried, { jobId: job._id, outcome: 'given_up' })
        logBackend('error', 'ai.job_refund_failed', `Job ${job._id}'s refund failed ${REFUND_ATTEMPTS} times: its credits are still owed. Retry the job to run it on the charge it paid.`, error)
        return
      }
      const delay = refundBackoff(attempt)
      await ctx.runMutation(queue.refundTried, { jobId: job._id, outcome: 'retry', at: Date.now() + delay })
      await scheduleRefund(ctx, job._id, next, delay)
      logBackend('warn', 'ai.job_refund_retry', `Job ${job._id}'s refund failed; trying again in ${delay / 1000}s.`, error)
      return
    }
    await ctx.runMutation(queue.refundTried, { jobId: job._id, outcome: 'refunded' })
  }

  /** Send what a job's model calls cost to the billing provider's cost insights. */
  const reportJobCost = async (ctx: ActionCtx, job: JobRow): Promise<void> => {
    const report = costReportOf(job)
    if (!report) return
    try {
      await billing.reportCost(ctx as never, report)
    }
    catch (error) {
      // A report that did not land costs the person nothing: logged, never retried into a loop.
      logBackend('warn', 'ai.job_cost_unreported', `Job ${job._id}'s cost was not reported to the billing provider.`, error)
    }
  }

  const billJob = internalActionGeneric({
    args: {
      op: v.union(v.literal('charge'), v.literal('refund'), v.literal('report'), v.literal('moderate')),
      jobId: v.string(),
      attempt: v.optional(v.number()),
      input: v.optional(v.object({ text: v.optional(v.string()), images: v.optional(v.array(v.string())) })),
    },
    returns: v.union(v.null(), v.object({ blocked: v.any() })),
    handler: async (ctx, { op, jobId, attempt, input }): Promise<null | { blocked: Record<string, unknown> }> => {
      if (op === 'moderate') {
        // A refusal the check throws (a gone image, a classifier with no verdict) fails the job as it is.
        try {
          await context.moderation.requireSafe(ctx, input ?? {})
          return null
        }
        catch (error) {
          const payload = catalogPayload(error)
          if (payload) return { blocked: payload }
          throw error
        }
      }
      const job = await ctx.runQuery(queue.get, { jobId }) as JobRow | null
      if (job) await ({ charge, refund: (actionCtx: ActionCtx, row: JobRow) => refund(actionCtx, row, attempt), report: reportJobCost })[op](ctx, job)
      return null
    },
  })

  /** The caller's own entity, or `null` for a caller with none. */
  const callerEntity = async (ctx: ReadCtx & { auth: Auth }): Promise<string | null> => {
    try {
      return (await billing.requireEntity(ctx as never, { access: 'member' })).userId
    }
    catch {
      return null
    }
  }

  const requireAdministrator = (ctx: Ctx, what: string) => requireAdministratorInPerson(ctx as never, reads, administrators, what)
  const isAdmin = (ctx: ReadCtx & { auth: Auth }, what: string) => isAdministratorNow(ctx as never, reads, administrators, what)

  /** Whether the caller may cancel this job: who started it, the workspace's owners and admins, an administrator. */
  const mayCancel = async (ctx: ReadCtx & { auth: Auth }, job: JobRow, userId: string): Promise<boolean> => {
    if (job.userId === userId) return true
    const role = await reads.memberRole(ctx as never, userId, job.owner)
    if (role === 'owner' || role === 'admin') return true
    return await isAdmin(ctx, 'cancelJob')
  }

  /** Whether the caller may read this job: who started it, a member of the workspace that pays, an administrator. */
  const mayRead = async (ctx: ReadCtx & { auth: Auth }, job: JobRow, userId: string): Promise<boolean> =>
    job.userId === userId || (await callerEntity(ctx)) === job.owner || await isAdmin(ctx, 'getJob')

  const getJob = queryGeneric({
    args: { jobId: v.string() },
    handler: async (ctx, { jobId }): Promise<JobView | null> => {
      const identity = await ctx.auth.getUserIdentity()
      const job = identity ? await ctx.runQuery(queue.get, { jobId }) as JobRow | null : null
      if (!identity || !job || !await mayRead(ctx, job, identity.subject)) return null
      const standing = job.status === 'queued'
        ? await ctx.runQuery(queue.standing, { jobId, policy, pausedAi: await paused(ctx, 'ai'), now: Date.now() })
        : null
      const live = job.status === 'queued' || job.status === 'running'
      const view = jobViewOf(job, standing, live && await mayCancel(ctx, job, identity.subject))
      if (job.status !== 'done' || !aiConfig.provenance) return view
      const inputs = await ctx.runQuery(provenanceRows.jobProvenanceInputs, { jobId: job._id })
      return { ...view, provenance: { models: job.usage?.models ?? [], finishedAt: job.endedAt ?? job.joinedAt, inputs } }
    },
  })

  const cancelJob = mutationGeneric({
    args: { jobId: v.string(), refund: v.optional(v.boolean()) },
    returns: v.null(),
    handler: async (ctx, { jobId, refund }) => {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity) throw backendError('unauthenticated', {}, '[nuxt-backend] Sign in to cancel a job.')
      const job = await ctx.runQuery(queue.get, { jobId }) as JobRow | null
      if (!job || !await mayCancel(ctx, job, identity.subject)) throw backendError('forbidden', { reason: 'not_allowed' }, '[nuxt-backend] cancelJob: this job is not yours to cancel.')
      if (refund) await requireAdministrator(ctx, 'cancelJob({ refund })')
      if (job.status !== 'queued' && job.status !== 'running') return null
      const out = await ctx.runMutation(queue.cancel, { jobId, by: identity.subject, refund: refund === true }) as (JobRow & { was: string }) | null
      const hold = reservationOf(job)
      if (out?.was === 'queued') {
        if (hold && !job.charged) await billing.releaseSpend(ctx as never, hold)
        if (out.refundOwed === 'pending') await scheduleRefund(ctx, jobId)
        await schedulePick(ctx)
      }
      if (out?.was === 'running' && job.workflowId) await workflow.cancel(ctx, job.workflowId as never)
      await billing.recordEvent(ctx as never, job.owner, { type: 'job.canceled', actor: identity.subject, data: { kind: job.kind, refunded: refund === true || out?.was === 'queued', running: out?.was === 'running' } } as never)
      return null
    },
  })

  const getQueue = queryGeneric({
    args: {},
    handler: async (ctx) => {
      if (!await isAdmin(ctx, 'getQueue')) return null
      const { guests, ...overview } = await ctx.runQuery(queue.overview, { policy, models }) as { guests: { running: number, waiting: number } }
      // The guest jobs' count, once the queue takes guests (`defineJobQueue({ guest })`).
      return { ...overview, guests: guest ? guests : null, pausedAi: await paused(ctx, 'ai') }
    },
  })

  const listJobs = queryGeneric({
    args: { paginationOpts: paginationOptsValidator, deadLetters: v.optional(v.boolean()) },
    handler: async (ctx, { paginationOpts, deadLetters }) => {
      if (!await isAdmin(ctx, 'listJobs')) return { page: [], isDone: true, continueCursor: '' }
      const page = await ctx.runQuery(queue.list, defined({ paginationOpts, deadLetters: deadLetters || undefined })) as { page: JobRow[], isDone: boolean, continueCursor: string }
      return { ...page, page: page.page.map(adminViewOf) }
    },
  })

  const vNullable = v.optional(v.union(v.number(), v.null()))
  const setQueue = mutationGeneric({
    args: {
      paused: v.optional(v.boolean()),
      concurrency: vNullable,
      tier: v.optional(v.object({ name: v.string(), perOwner: vNullable, dedicated: vNullable, budget: v.optional(v.union(v.object({ units: v.number() }), v.null())) })),
      model: v.optional(v.object({ id: v.string(), perMinute: v.optional(v.number()), min: v.optional(v.number()), max: v.optional(v.number()) })),
    },
    returns: v.null(),
    handler: async (ctx, change) => {
      const actor = await requireAdministrator(ctx, 'setQueue')
      checkConcurrency(change.concurrency)
      const tier = change.tier && tierChangeOf(policy, change.tier)
      const model = change.model && modelChangeOf(change.model, await ctx.runQuery(queue.modelLimit, { model: change.model.id, ...defaultsOf(change.model.id) }))
      await ctx.runMutation(queue.setQueue, defined({ paused: change.paused, concurrency: change.concurrency, tier, model }))
      await record(ctx, { type: 'job.queue_changed', actor, subjectId: actor, data: defined({ change: changeKindOf(change), tier: tier?.name, model: model?.model }) } as never)
      await schedulePick(ctx)
      return null
    },
  })

  const retryJob = mutationGeneric({
    args: { jobId: v.string() },
    returns: v.null(),
    handler: async (ctx, { jobId }) => {
      const actor = await requireAdministrator(ctx, 'retryJob')
      const job = await ctx.runQuery(queue.get, { jobId }) as JobRow | null
      if (!job?.deadLetter || job.status !== 'failed') throw backendError('invalid_input', { field: 'jobId', reason: 'not_dead_letter' }, '[nuxt-backend] retryJob: only a failed job in the dead letters goes back in line.')
      if (refundInFlight(job)) throw backendError('invalid_input', { field: 'jobId', reason: 'refund_pending' }, '[nuxt-backend] retryJob: this job\'s refund is still on its way. Retry it once the refund lands.')
      // An administrator's retry counts in the owner's window now, and is never refused for it.
      // A guest job counts in none, also once claimed: the app pays for it.
      const budget = job.visitor === undefined ? await countBudget(ctx, job.owner, job.cost, true) : { budgetCounted: 0 }
      // A charge that was never refunded carries over: the new run neither holds nor charges again.
      const carry = job.charged && !job.refunded
      const hold = carry ? undefined : await holdCredits(ctx, job.owner, job.meter ?? false, job.cost)
      await ctx.runMutation(queue.requeue, defined({ jobId, hold, carry: carry || undefined, ...budget, policy }))
      await billing.recordEvent(ctx as never, job.owner, { type: 'job.retried', actor, data: { kind: job.kind } } as never)
      await schedulePick(ctx)
      return null
    },
  })

  const discardJob = mutationGeneric({
    args: { jobId: v.string() },
    returns: v.null(),
    handler: async (ctx, { jobId }) => {
      await requireAdministrator(ctx, 'discardJob')
      await ctx.runMutation(queue.discard, { jobId })
      return null
    },
  })

  return {
    define,
    step,
    enqueue,
    api: { getJob, cancelJob, getQueue, listJobs, setQueue, retryJob, discardJob, runQueue, billJob } as unknown as JobQueueApi,
  }
}

// ── What the queue's functions read and write, as plain data ──────────────

/** How a workflow ended, as its onComplete hands it over. */
type WorkflowResult = { kind: 'success', returnValue: unknown } | { kind: 'failed', error: string } | { kind: 'canceled' }

/** A job's end, from its workflow's: done with its result, failed with the catalog error it carried, or canceled. */
function endOf(jobId: string, result: WorkflowResult): { outcome: 'done' | 'failed' | 'canceled', result?: unknown, error?: Record<string, unknown> } {
  if (result.kind === 'success') return defined({ outcome: 'done' as const, result: result.returnValue })
  if (result.kind === 'canceled') return { outcome: 'canceled' }
  const carried = payloadOfMessage(result.error)
  if (!carried) logBackend('error', 'ai.job_failed', `Job ${jobId} failed.`, result.error)
  return { outcome: 'failed', error: carried ?? failure('job_failed') }
}

/** `job.progress` as the job row keeps it, checked. */
function checkedProgress(progress: JobProgress | undefined): JobProgress {
  const { done, total } = progress ?? { done: Number.NaN, total: Number.NaN }
  if (Number.isFinite(done) && Number.isFinite(total) && done >= 0 && total >= 0) return progress!
  throw new TypeError('[nuxt-backend] job.progress: `done` and `total` are numbers of 0 or more.')
}

/** A job as `getJob` reads it: its standing while it waits, its result once done, its refusal once failed. */
function jobViewOf(job: JobRow, standing: { waitingOn: string, position: number | null, estimatedWait?: number } | null, canCancel: boolean): JobView {
  return defined({
    id: job._id,
    kind: job.kind,
    status: job.status,
    waitingOn: standing?.waitingOn as JobView['waitingOn'],
    position: standing?.position,
    estimatedWait: standing?.estimatedWait,
    progress: job.progress,
    result: job.status === 'done' ? job.result : undefined,
    error: job.status === 'failed' ? job.error : undefined,
    joinedAt: job.joinedAt,
    startedAt: job.startedAt,
    endedAt: job.endedAt,
    canCancel,
  })
}

/** A job as the admin console lists it. */
function adminViewOf(job: JobRow): AdminJobView {
  return defined({
    id: job._id,
    kind: job.kind,
    owner: job.owner,
    userId: job.userId,
    tier: job.tier,
    status: job.status,
    guest: job.visitor !== undefined,
    attempts: job.attempts,
    retries: job.retries,
    cost: job.cost,
    joinedAt: job.joinedAt,
    startedAt: job.startedAt,
    endedAt: job.endedAt,
    error: job.error,
    lastError: job.lastError,
    deadLetter: job.deadLetter === true,
  })
}

/** The cost insights event for a finished job: its cost in cents and its tokens, a child of its charge. */
function costReportOf(job: JobRow): CostReport | undefined {
  const usage = job.usage
  // A guest job's cost is the app's own, also once claimed: no customer's; and so is an app job's.
  if (!usage || job.visitor !== undefined || job.owner === APP_OWNER) return undefined
  const model = usage.models[0]
  const llm = model && { vendor: model.includes('/') ? model.split('/')[0]! : 'unknown', model, inputTokens: usage.input, outputTokens: usage.output, ...(usage.cached ? { cachedInputTokens: usage.cached } : {}) }
  return defined({
    userId: job.owner,
    name: 'job.cost',
    externalId: `${job._id}-${job.retries}-cost`,
    parentId: job.charged ? job.hold?.externalId : undefined,
    cents: usage.usd === undefined ? undefined : usage.usd * 100,
    llm: llm || undefined,
    memberId: job.userId,
  })
}

/** Refuse a value `setQueue` cannot take, on the field it names. */
function refuseChange(field: string, why: string): never {
  throw backendError('invalid_input', { field }, `[nuxt-backend] setQueue: ${why}`)
}

/** A whole number of `least` or more; `null` and `undefined` pass (back to the code, and unchanged). */
const wholeOrUnset = (value: number | null | undefined, least: number) => value === undefined || value === null || (Number.isInteger(value) && value >= least)

function checkConcurrency(concurrency: number | null | undefined): void {
  if (concurrency === undefined || concurrency === null) return
  if (!(Number.isInteger(concurrency) && concurrency >= 0 && concurrency <= MAX_CONCURRENCY)) refuseChange('concurrency', `\`concurrency\` is a whole number from 0 to ${MAX_CONCURRENCY}.`)
}

/** A tier's retune, checked against the tier in code. */
function tierChangeOf(policy: QueuePolicy, change: NonNullable<QueueChange['tier']>) {
  const coded = policy.tiers.find(entry => entry.name === change.name)
  if (!coded) return refuseChange('tier', `there is no tier \`${change.name}\` in backend/jobs.ts.`)
  if (!wholeOrUnset(change.perOwner, 1)) refuseChange('perOwner', '`perOwner` is a whole number of 1 or more.')
  if (!wholeOrUnset(change.dedicated, 0)) refuseChange('dedicated', '`dedicated` is a whole number of 0 or more.')
  if (!coded.feature && (change.dedicated ?? 0) > 0) refuseChange('dedicated', 'the catch-all tier keeps no dedicated slots.')
  const units = change.budget === undefined ? undefined : change.budget?.units ?? null
  if (typeof units === 'number' && !(Number.isFinite(units) && units > 0)) refuseChange('budget', 'budget `units` is a number above 0.')
  if (typeof units === 'number' && !coded.budget) refuseChange('budget', `tier \`${coded.name}\` has no budget in backend/jobs.ts, so it cannot gain one here.`)
  return defined({ name: change.name, perOwner: change.perOwner, dedicated: change.dedicated, budgetUnits: units })
}

/** A model's retune over its limit now, checked. */
function modelChangeOf(change: NonNullable<QueueChange['model']>, current: { perMinute: number, min: number, max: number }) {
  const model = { model: change.id, perMinute: change.perMinute ?? current.perMinute, min: change.min ?? current.min, max: change.max ?? current.max }
  if (!(model.min >= 1 && model.min <= model.perMinute && model.perMinute <= model.max)) refuseChange('model', 'a model needs 1 ≤ min ≤ perMinute ≤ max.')
  return model
}

/** What a queue change did, for the activity trail. */
function changeKindOf(change: QueueChange): string {
  if (change.paused !== undefined) return change.paused ? 'paused' : 'resumed'
  if (change.concurrency !== undefined) return 'concurrency'
  return change.tier ? 'tier' : 'model'
}
