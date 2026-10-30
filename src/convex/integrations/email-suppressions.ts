import { actionGeneric, type FunctionReference, type GenericActionCtx, type GenericDataModel, paginationOptsValidator, queryGeneric, type RegisteredAction, type RegisteredQuery } from 'convex/server'
import { v } from 'convex/values'
import { Resend } from 'resend'
import { requireProviderAdminEnvironment } from '../delivery.js'
import { backendError } from '../errors.js'
import { logBackend } from '../log.js'
import { normalizeEmail } from '../tokens.js'
import { type AdapterFindOne, type Administrators, createAccessReads, isAdministratorNow, requireAdministratorInPerson } from './access.js'
import type { Audit } from './audit.js'

// Suppression-aware sign-in, the email side: the provider's suppression
// list mirrored from its webhook events, and the admin console's list with
// a lift through the provider's suppressions API. The provider stays the
// source of truth: the package records what it says and never suppresses
// an address itself. Sign-in reads the copy (`client/guards.ts`).

/** Why the provider suppressed an address; `dropped` when only a dropped send told of it. */
export type SuppressionOrigin = 'bounce' | 'complaint' | 'manual' | 'dropped'

/** One suppressed address, as the admin console lists it. */
export interface Suppression {
  email: string
  origin: SuppressionOrigin
  /** When the provider suppressed it, epoch ms. */
  suppressedAt: number
}

/** A page of suppressed addresses, newest first. */
export interface SuppressionsPage {
  page: Suppression[]
  isDone: boolean
  continueCursor: string
}

type PaginationArgs = typeof paginationOptsValidator.type

/** The functions `setupEmail` adds to `email.api` for the Suppressions tab. */
export interface SuppressionsApi {
  /** The addresses the provider suppressed, newest first, a page at a time: a paginated query. `null` to anyone but an administrator in person. */
  getSuppressions: RegisteredQuery<'public', { paginationOpts: PaginationArgs }, Promise<SuppressionsPage | null>>
  /** Lift an address's suppression through the provider, so mail reaches it again: an administrator's write, behind a recent sign-in, recorded on the activity trail. */
  liftSuppression: RegisteredAction<'public', { email: string }, Promise<{ lifted: boolean }>>
}

/** The `backend` component's suppressions module, as this file reads it. */
export interface SuppressionRefs {
  record: FunctionReference<'mutation', 'internal', { email: string, origin: SuppressionOrigin, at: number }, boolean>
  lift: FunctionReference<'mutation', 'internal', { email: string, at: number }, SuppressionOrigin | null>
  isSuppressed: FunctionReference<'query', 'internal', { email: string }, boolean>
  list: FunctionReference<'query', 'internal', { paginationOpts: PaginationArgs }, SuppressionsPage>
}

/** The most addresses one `email.suppressed` event marks. */
const DROPPED_RECIPIENTS_MAX = 50

type MutationRunner = Pick<GenericActionCtx<GenericDataModel>, 'runMutation'>

const ORIGINS: ReadonlySet<string> = new Set(['bounce', 'complaint', 'manual'])

/** When the provider made the change, from the event, else now. */
function eventTime(payload: unknown): number {
  const event = payload as { created_at?: unknown, data?: { created_at?: unknown } } | null
  for (const raw of [event?.created_at, event?.data?.created_at]) {
    const at = typeof raw === 'string' ? Date.parse(raw) : Number.NaN
    if (Number.isFinite(at)) return at
  }
  return Date.now()
}

/**
 * Follow one verified event of the provider's into the copy:
 * `suppression.added` records the address with its origin,
 * `suppression.removed` marks it lifted, and `email.suppressed` (a send the
 * provider dropped) records each recipient. Any other type changes nothing.
 *
 * @internal
 */
export async function followSuppressionEvent(ctx: MutationRunner, refs: SuppressionRefs | undefined, type: string, payload: unknown): Promise<void> {
  const data = (payload as { data?: Record<string, unknown> } | null)?.data
  if (!refs || !data) return
  const at = eventTime(payload)
  if (type === 'suppression.added') await followAdded(ctx, refs, data, at)
  else if (type === 'suppression.removed') await followRemoved(ctx, refs, data, at)
  else if (type === 'email.suppressed') await followDropped(ctx, refs, data, at)
}

/** The address a `suppression.*` event names, normalized; empty for none. */
function addressOf(data: Record<string, unknown>): string {
  return typeof data.email === 'string' ? normalizeEmail(data.email) : ''
}

/** `suppression.added`: the address, with why. */
async function followAdded(ctx: MutationRunner, refs: SuppressionRefs, data: Record<string, unknown>, at: number): Promise<void> {
  const email = addressOf(data)
  if (!email) return
  const origin = typeof data.origin === 'string' && ORIGINS.has(data.origin) ? data.origin as SuppressionOrigin : 'manual'
  await ctx.runMutation(refs.record, { email, origin, at })
}

/** `suppression.removed`: the address, lifted. */
async function followRemoved(ctx: MutationRunner, refs: SuppressionRefs, data: Record<string, unknown>, at: number): Promise<void> {
  const email = addressOf(data)
  if (email) await ctx.runMutation(refs.lift, { email, at })
}

/** `email.suppressed`: each recipient of a send the provider dropped. */
async function followDropped(ctx: MutationRunner, refs: SuppressionRefs, data: Record<string, unknown>, at: number): Promise<void> {
  const to = Array.isArray(data.to) ? data.to : [data.to]
  for (const address of to.filter((entry): entry is string => typeof entry === 'string').slice(0, DROPPED_RECIPIENTS_MAX)) {
    await ctx.runMutation(refs.record, { email: normalizeEmail(address), origin: 'dropped', at })
  }
}

/** What the suppression functions need of `setupEmail`. */
export interface SuppressionsDeps {
  refs: SuppressionRefs | undefined
  /** The auth adapter's `findOne`: the administrator's role, read fresh, and the account an address belongs to. */
  findOne: AdapterFindOne | undefined
  administrators: Administrators
  audit: Pick<Audit, 'recordBackendEvent'> | undefined
  /** The provider client, with the deployment's key: a test passes a fake. */
  client?: () => Pick<Resend, 'suppressions'>
}

/**
 * The Suppressions tab's functions, for `setupEmail` to return on
 * `email.api`.
 *
 * @internal
 */
export function createSuppressions(deps: SuppressionsDeps): SuppressionsApi {
  const reads = deps.findOne ? createAccessReads(deps.findOne) : null
  const client = deps.client ?? (() => new Resend(readKey()))

  const getSuppressions = queryGeneric({
    args: { paginationOpts: paginationOptsValidator },
    handler: async (ctx, { paginationOpts }): Promise<SuppressionsPage | null> => {
      if (!reads || !deps.refs || !await isAdministratorNow(ctx, reads, deps.administrators, 'getSuppressions')) return null
      const result = await ctx.runQuery(deps.refs.list, { paginationOpts })
      return { page: result.page, isDone: result.isDone, continueCursor: result.continueCursor }
    },
  })

  const liftSuppression = actionGeneric({
    args: { email: v.string() },
    handler: async (ctx, args): Promise<{ lifted: boolean }> => {
      if (!reads) throw backendError('forbidden', { reason: 'admin_only' }, '[nuxt-backend] liftSuppression is for administrators, and the backend component has no auth adapter to read them.')
      await requireAdministratorInPerson(ctx, reads, deps.administrators, 'liftSuppression')
      // A public sandbox (the playground) lets anyone be an administrator: a lift there changes the provider's list for real.
      requireProviderAdminEnvironment('liftSuppression', 'lifting a suppression changes the email provider\'s list')
      const email = normalizeEmail(args.email)
      if (!email || !deps.refs) throw backendError('invalid_input', { field: 'email' }, '[nuxt-backend] liftSuppression: name a suppressed address.')
      if (!await ctx.runQuery(deps.refs.isSuppressed, { email })) return { lifted: false }
      if (!readKey()) throw backendError('unavailable', { service: 'email', reason: 'not_configured' }, '[nuxt-backend] liftSuppression needs EMAIL_API_KEY on the deployment.')
      const { error } = await client().suppressions.remove(email)
      const status = (error as { statusCode?: unknown } | null)?.statusCode
      // Lifted already at the provider: the copy follows.
      if (error && error.name !== 'not_found' && status !== 404) {
        logBackend('warn', 'email.suppression_refused', 'The email provider refused to lift a suppression: a key restricted to sending cannot call its suppressions API.', error)
        throw backendError('unavailable', { service: 'email', reason: 'provider_refused' }, `[nuxt-backend] Resend refused to lift the suppression: ${error.message}`)
      }
      const origin = await ctx.runMutation(deps.refs.lift, { email, at: Date.now() })
      if (deps.audit) {
        const holder = deps.findOne ? await ctx.runQuery(deps.findOne, { model: 'user', where: [{ field: 'email', value: email }] }) as { _id?: string } | null : null
        await deps.audit.recordBackendEvent(ctx as never, { type: 'email.suppression_lifted', ...(holder?._id ? { subjectId: holder._id } : {}), data: { origin: origin ?? 'manual' } } as never)
      }
      return { lifted: true }
    },
  })

  return { getSuppressions, liftSuppression } as SuppressionsApi
}

function readKey(): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.EMAIL_API_KEY
}
