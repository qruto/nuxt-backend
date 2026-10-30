// The refusals the package throws, as a small catalog of stable codes. A
// refusal is a `ConvexError` whose data is `{ code, ...fields }`: Convex sends
// that data to the client in production too, where a plain `Error` reaches it
// as "Server Error". The English sentence a throw site writes stays the error's
// `message`, for the deployment log and for a developer; what a person reads
// comes from the `errors` label group, or from a sentence written for them in
// `data.message`. Runtime-neutral (no Vue, no server-only import), so the Vue
// side reads the same catalog.

import { ConvexError, v, type GenericValidator, type Infer, type Value } from 'convex/values'
import { translator, type Translate } from './label-format.js'
import errorLabels from './label-groups/errors.js'

/** A sentence written for the person, beside the code: an app's own `canSignIn` refusal, say. */
const personMessage = v.optional(v.string())

/**
 * Every code the package throws, with the HTTP status an auth route answers
 * it with and the validator its data is checked against where it is thrown.
 * Codes and their fields are stable (STABILITY.md); a feature adds a code, it
 * never renames one.
 *
 * - `unauthenticated` — nobody is signed in, or the session is gone.
 * - `forbidden` — signed in, but not allowed; `reason` says why (`banned`,
 *   `role`, `permission`, `not_member`, `workspace_role`, `admin_only`,
 *   `not_owner`, `impersonating`, `admin_target`,
 *   `sign_in_refused`, `customer_taken`, `already_subscribed`,
 *   `not_billing_manager`, `provider_owner_only`, `gift_refused`,
 *   `gift_refunded`, `not_recipient`, `no_email`, `bot_check`,
 *   `other_account`, `flag_off`, `sole_owner`, `paid_subscription`, `ticket_required`, `invitation_refused`,
 *   `consent_required`, `age_required`, `under_age`, `passkey_only_admin`). A `consent_required` refusal
 *   also carries `kind`, the required consent not yet accepted at its latest version. A
 *   `ticket_required` refusal also carries `phase`, the launch phase that
 *   asks for a ticket, and `invite`, how the invite code given checked
 *   (`expired`, `used-up`, `revoked`, `unknown`), when one was.
 * - `reauthentication_required` — the call is a sensitive action, and the
 *   session's sign-in is older than it takes: sign in again
 *   (`useReauthentication`), then retry. Better Auth's own refusals of a
 *   session too old for its route read as this code too.
 * - `no_workspace` — the call needs an active workspace and there is none.
 * - `rate_limited` — a named limit is spent; `retryAfter` is in milliseconds.
 *   The job queue's budget (`limit: 'jobBudget'`) also names the `plans`
 *   on sale whose tier would fit the job now, in pricing order.
 * - `insufficient_credits` — the balance can't cover the spend.
 * - `feature_required` — the billing entity's plan does not include the
 *   feature the call needs; `plans` names the catalog plans on sale that
 *   do, in pricing order (none when no plan on sale includes it).
 * - `quota_exceeded` — the billing entity's plan allows `limit` of the
 *   `quota`, `used` are held, and `amount` more do not fit; `plans` names
 *   the catalog plans on sale that allow enough, in pricing order.
 * - `invalid_input` — an argument the call refuses; `field` names it, and
 *   `reason` says why when the field alone does not (`otp_expired`,
 *   `passkey_cancelled`, `no_password`, `retired`, `has_account`). A job
 *   bigger than any budget of the queue is `over_budget` on `cost`, with
 *   its `need` and the owner's `units`; a step's model refusing the
 *   content is `content_blocked` on `prompt`.
 * - `not_ready` — there is nothing to act on yet, and retrying will not
 *   change that: `reason` says what has to happen first (`no_customer`,
 *   `not_synced`, `no_catalog`, `not_paid`, and `no_budget`: AI on a
 *   sandbox deployment whose `setupAi` sets no `spendLimit`).
 * - `unavailable` — a service can't serve the call; `service` and
 *   `reason` say which and why. Only `provider_refused` may pass on a retry;
 *   the others need the deployment fixed, but a kill switch's
 *   (`signups_paused`, `checkout_paused`, `ai_paused`, service `signups`,
 *   `checkout` or `ai`), which an administrator turns off. Nothing throws service `backend`
 *   with reason `unexpected`: it is how a composable's `error` reads a
 *   failure without a code (a crash, an app's own error), and says nothing
 *   about whether a service is down.
 */
export const BACKEND_ERRORS = {
  unauthenticated: { status: 401, data: v.object({ message: personMessage }) },
  forbidden: { status: 403, data: v.object({ reason: v.string(), message: personMessage, phase: v.optional(v.string()), invite: v.optional(v.string()), kind: v.optional(v.string()), waitlist: v.optional(v.object({ position: v.number(), total: v.number(), token: v.string() })) }) },
  reauthentication_required: { status: 403, data: v.object({ message: personMessage }) },
  no_workspace: { status: 409, data: v.object({ message: personMessage }) },
  rate_limited: {
    status: 429,
    data: v.object({ retryAfter: v.optional(v.number()), limit: v.optional(v.string()), plans: v.optional(v.array(v.string())), message: personMessage }),
  },
  insufficient_credits: {
    status: 402,
    data: v.object({ meter: v.optional(v.string()), balance: v.number(), need: v.number(), message: personMessage }),
  },
  feature_required: {
    status: 402,
    data: v.object({ feature: v.string(), plans: v.array(v.string()), message: personMessage }),
  },
  quota_exceeded: {
    status: 402,
    data: v.object({ quota: v.string(), limit: v.number(), used: v.number(), amount: v.number(), plans: v.array(v.string()), message: personMessage }),
  },
  invalid_input: { status: 400, data: v.object({ field: v.string(), reason: v.optional(v.string()), need: v.optional(v.number()), units: v.optional(v.number()), message: personMessage }) },
  not_ready: { status: 409, data: v.object({ reason: v.string(), message: personMessage }) },
  unavailable: { status: 503, data: v.object({ service: v.string(), reason: v.string(), message: personMessage }) },
} as const

/** One of the catalog's codes. */
export type BackendErrorCode = keyof typeof BACKEND_ERRORS

/** The fields a code carries beside it. */
export type BackendErrorData<C extends BackendErrorCode = BackendErrorCode> = Infer<(typeof BACKEND_ERRORS)[C]['data']>

/**
 * A refusal read back by {@link getBackendError}: its code, its fields, and a
 * sentence to show — `data.message` when the throw site wrote one for the
 * person, else the code's English label. Every field is optional here, the
 * required ones too: the reader keeps only the fields that fit the catalog,
 * and an auth route or an older deployment may send fewer.
 */
export type BackendError = {
  [C in BackendErrorCode]: { code: C, data: Partial<BackendErrorData<C>>, message: string }
}[BackendErrorCode]

/** What a `backendError()` carries to the client: the code and its fields, flat. */
export type BackendErrorPayload<C extends BackendErrorCode = BackendErrorCode> = { code: C } & BackendErrorData<C> & { [key: string]: Value | undefined }

/**
 * What `backendError` takes after the code: the code's data, optional for a
 * code whose fields are all optional, then the English detail for the log.
 */
export type BackendErrorArgs<C extends BackendErrorCode> = Record<string, never> extends BackendErrorData<C>
  ? [data?: BackendErrorData<C>, detail?: string]
  : [data: BackendErrorData<C>, detail?: string]

const translate = translator({ errors: errorLabels })

/** Whether `value` fits a catalog validator: the strings, numbers, lists and objects of optional fields it uses. */
function conforms(validator: GenericValidator, value: unknown): boolean {
  if (value === undefined) return validator.isOptional === 'optional'
  switch (validator.kind) {
    case 'string': return typeof value === 'string'
    case 'float64': return typeof value === 'number' && Number.isFinite(value)
    case 'array': return Array.isArray(value) && value.every(item => conforms(validator.element as GenericValidator, item))
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
      const record = value as Record<string, unknown>
      // Own keys only: `constructor` or `toString` would pass `in` through the prototype.
      return Object.keys(record).every(key => Object.hasOwn(validator.fields, key))
        && Object.entries(validator.fields).every(([key, field]) => conforms(field as GenericValidator, record[key]))
    }
    default: return false
  }
}

/** The fields without their `undefined` entries: a Convex value has none. */
function defined<T extends Record<string, unknown>>(fields: T): T {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as T
}

/**
 * The sentence for a code, filled from its fields, through `t` (the English
 * labels unless a caller passes its own). A label with numbers in it (the
 * wait, the balance) is used only when every number is there, so a
 * placeholder never reaches a person; a reason with a sentence of its own
 * (`errors.<code>_<reason>`) gets that one, and so does a refused field
 * (`errors.invalid_input_<field>`).
 */
function labelFor(code: BackendErrorCode, data: Record<string, unknown>, t: Translate = translate, own?: Translate): string {
  return (own && sentenceFor(code, data, own)) ?? sentenceFor(code, data, t) ?? code
}

/** The first label the chain finds through `t`, or `undefined` when `t` has none of them. */
function sentenceFor(code: BackendErrorCode, data: Record<string, unknown>, t: Translate): string | undefined {
  const label = (name: string, params?: Record<string, string | number>): string | undefined => {
    const key = `errors.${name}`
    const text = t(key, params)
    return text === key ? undefined : text
  }
  // The job queue's budget resets with its window, hours away: said in minutes.
  const budget = code === 'rate_limited' && data.limit === 'jobBudget' && typeof data.retryAfter === 'number'
    ? label('rate_limited_job_budget', { count: Math.max(1, Math.ceil(data.retryAfter / 60_000)) })
    : undefined
  const timed = code === 'rate_limited' && typeof data.retryAfter === 'number'
    ? label('rate_limited_for', { count: Math.max(1, Math.ceil(data.retryAfter / 1000)) })
    : undefined
  const amounts = code === 'insufficient_credits' && typeof data.balance === 'number' && typeof data.need === 'number'
    ? label('insufficient_credits_amounts', { balance: data.balance, need: data.need })
    : undefined
  const byReason = typeof data.reason === 'string' ? label(`${code}_${data.reason}`) : undefined
  const byField = code === 'invalid_input' && typeof data.field === 'string' ? label(`${code}_${data.field}`) : undefined
  return budget ?? timed ?? amounts ?? byReason ?? byField ?? label(code)
}

/**
 * A refusal's sentence in another language: `t` resolves the `errors`
 * labels the way the reader's app translates them. A sentence the throw site
 * wrote for the person (`data.message`), or one a composable kept from an
 * app's own error, is not the catalog's, so it stays as written. `own`, when
 * given, resolves only what the app supplies itself (its overrides and its
 * locale's messages): the chain runs through it first, so a locale that words
 * only the generic `errors.forbidden` shows that rather than the package's
 * English sentence for the reason.
 */
export function translateBackendError(error: Pick<BackendError, 'code' | 'data' | 'message'>, t: Translate, own?: Translate): string {
  const data = error.data as Record<string, unknown>
  if (!isCode(error.code) || error.message !== labelFor(error.code, data)) return error.message
  return labelFor(error.code, data, t, own)
}

/**
 * Build the error for a refusal: `throw backendError('forbidden', { reason:
 * 'role' })`. The data is checked against the code's validator, so a throw
 * site cannot send a field the catalog does not list. `detail` is the
 * English sentence the deployment log shows as the error's message; it never
 * reaches the person in production.
 *
 * @example
 * ```ts
 * import { backendError } from 'nuxt-backend/functions'
 *
 * if (project.ownerId !== ctx.user.id) throw backendError('forbidden', { reason: 'not_owner' })
 * if (!name.trim()) throw backendError('invalid_input', { field: 'name' }, 'A project needs a name.')
 * ```
 */
export function backendError<C extends BackendErrorCode>(code: C, ...args: BackendErrorArgs<C>): ConvexError<BackendErrorPayload<C>> {
  const [data, detail] = args
  const entry = BACKEND_ERRORS[code] as { data: GenericValidator } | undefined
  const fields = defined({ ...data } as Record<string, unknown>)
  if (!entry || !conforms(entry.data, fields)) {
    throw new TypeError(`[nuxt-backend] backendError('${String(code)}'): ${entry ? `${JSON.stringify(fields)} does not match its catalog entry` : 'no such code in the catalog'}.`)
  }
  const error = new ConvexError<BackendErrorPayload<C>>({ code, ...fields } as BackendErrorPayload<C>)
  error.message = detail ?? labelFor(code, fields)
  return error
}

/**
 * A refusal as an HTTP response: its code's status, and the JSON body
 * `getBackendError` reads (the code's fields and the message).
 *
 * Not tagged internal, though no entry exports it: the app's server imports
 * it (runtime/server/protection/gate.ts), and that file reaches an app's type
 * check as written, so its import must find the declaration in
 * `dist/convex/errors.d.ts`, which the component build strips of every
 * internal one (`stripInternal`).
 */
export function refusalResponse(error: ConvexError<BackendErrorPayload>): Response {
  const data = error.data
  return new Response(JSON.stringify({ ...data, message: error.message }), {
    status: BACKEND_ERRORS[data.code].status,
    headers: { 'content-type': 'application/json' },
  })
}

const isCode = (value: unknown): value is BackendErrorCode =>
  typeof value === 'string' && Object.hasOwn(BACKEND_ERRORS, value)

/** Read a code's catalog fields out of a wider record (an auth error body, say), dropping the rest. */
function read(code: BackendErrorCode, source: Record<string, unknown>): BackendError {
  const validator = BACKEND_ERRORS[code].data as unknown as { fields: Record<string, GenericValidator> }
  const data: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(validator.fields)) {
    if (conforms(field, source[key]) && source[key] !== undefined) data[key] = source[key]
  }
  // A required field the source lacks: the error still reads, with that field absent.
  const label = labelFor(code, data)
  // An auth refusal's body carries the label as its `message` when the throw
  // site wrote no sentence for the person: that is the label, not a sentence
  // of the throw site's own, so it stays out of `data` and the `errors`
  // labels translate it.
  if (data.message === label || data.message === '') delete data.message
  const message = typeof data.message === 'string' ? data.message : label
  return { code, data, message } as BackendError
}

/** A `ConvexError`, found by its marker rather than `instanceof`: a second copy of `convex` has its own class. */
function convexErrorData(candidate: Record<string, unknown>): { data: unknown } | null {
  const marked = (candidate as Record<PropertyKey, unknown>)[Symbol.for('ConvexError')] === true || candidate.name === 'ConvexError'
  return marked && 'data' in candidate ? { data: candidate.data } : null
}

/** The rate limiter's own refusal (`throws: true`): `{ kind: 'RateLimited', name, retryAfter }`. */
function fromData(data: unknown): BackendError | null {
  if (typeof data !== 'object' || data === null) return null
  const record = data as Record<string, unknown>
  if (isCode(record.code)) return read(record.code, record)
  if (record.kind === 'RateLimited') return read('rate_limited', { retryAfter: record.retryAfter, limit: record.name })
  return null
}

/**
 * Better Auth's own refusal codes that name a reason the catalog has, so
 * they read the same as the package's: a banned account signing in is
 * `forbidden` with reason `banned`, as every other ban refusal is, and an
 * administrator's account refused an impersonation reads `admin_target`,
 * as the package's own refusal of one does, and someone outside a
 * workspace reads `not_member`, as the package's own membership checks
 * give it. Any other 403 code reads as its own name in lower case
 * (`TOO_MANY_ATTEMPTS` is `too_many_attempts`), with the plugin's word
 * for a workspace said as ours (`..._THIS_ORGANIZATION` reads
 * `..._this_workspace`).
 */
const AUTH_REASONS: Record<string, string> = {
  BANNED_USER: 'banned',
  VERIFICATION_FAILED: 'bot_check',
  YOU_CANNOT_IMPERSONATE_ADMINS: 'admin_target',
  USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION: 'not_member',
}

/** A Better Auth 403 code as a reason: its own, or its name in lower case, a workspace said as one. */
function authReason(code: string): string {
  return AUTH_REASONS[code] ?? code.toLowerCase().replaceAll('organization', 'workspace')
}

/**
 * Better Auth's own 400 codes that refuse one input: the field they refuse,
 * and a reason where the field alone says too little. They read as
 * `invalid_input` on it, so a form can mark the field rather than show a
 * crash, and the `errors` labels word them in the reader's language. The
 * passkey plugin's are a closed prompt and then any other failed ceremony
 * (every WebAuthn `ERROR_*` code included).
 */
const AUTH_INPUTS: Record<string, { field: string, reason?: string }> = {
  INVALID_OTP: { field: 'otp' },
  OTP_EXPIRED: { field: 'otp', reason: 'otp_expired' },
  INVALID_EMAIL: { field: 'email' },
  ORGANIZATION_ALREADY_EXISTS: { field: 'slug' },
  ORGANIZATION_SLUG_ALREADY_TAKEN: { field: 'slug' },
  AUTH_CANCELLED: { field: 'passkey', reason: 'passkey_cancelled' },
  ERROR_CEREMONY_ABORTED: { field: 'passkey', reason: 'passkey_cancelled' },
  PASSKEY_NOT_FOUND: { field: 'passkey' },
  AUTHENTICATION_FAILED: { field: 'passkey' },
  CHALLENGE_NOT_FOUND: { field: 'passkey' },
  FAILED_TO_VERIFY_REGISTRATION: { field: 'passkey' },
}

/**
 * The passkey plugin's refusals of a passkey sign-in, which it sends as 401
 * rather than 400: a passkey this deployment does not know (removed from
 * the account, still on the device, and offered by the browser's autofill)
 * and a signature that does not verify. Each refuses one input, the
 * passkey, and no session is missing.
 */
const PASSKEY_SIGN_IN_REFUSALS = ['PASSKEY_NOT_FOUND', 'AUTHENTICATION_FAILED']

/**
 * Better Auth's refusals of a session whose sign-in is too old for the
 * route: `SESSION_NOT_FRESH` (403, the passkey registration and the
 * session list) and `SESSION_EXPIRED` (400, deleting an account with no
 * confirmation email). Both read as `reauthentication_required`, like the
 * package's own.
 */
const STALE_SESSION_CODES = ['SESSION_NOT_FRESH', 'SESSION_EXPIRED']

/** The input a Better Auth 400 code refuses, the passkey plugin's `ERROR_*` codes included. */
function authInput(code: string): { field: string, reason?: string } | undefined {
  return AUTH_INPUTS[code] ?? (code.startsWith('ERROR_') ? { field: 'passkey' } : undefined)
}

/**
 * The auth routes' error, as the client hands it over (`result.error`) or as
 * the server threw it (`APIError`). A catalog code (an app's own refusal)
 * keeps the sentence it carries. Better Auth's own codes keep none: their
 * English sentence stays on the error a composable keeps as `cause`, and
 * the `errors` labels say it to the person, translated.
 */
function fromAuthBody(body: Record<string, unknown>, status: unknown): BackendError | null {
  if (isCode(body.code)) return read(body.code, body)
  // Better Auth's own refusals carry its UPPER_SNAKE codes; the status says which of ours it is.
  const code = typeof body.code === 'string' ? body.code : undefined
  // A route that asks for a recent sign-in, whatever status it answers it with.
  if (code && STALE_SESSION_CODES.includes(code)) return read('reauthentication_required', {})
  const input = code && (status === 400 || (status === 401 && PASSKEY_SIGN_IN_REFUSALS.includes(code))) ? authInput(code) : undefined
  if (input) return read('invalid_input', input)
  if (status === 401) return read('unauthenticated', {})
  if (status === 403) return read('forbidden', { reason: code ? authReason(code) : 'forbidden' })
  if (status === 429) return read('rate_limited', { retryAfter: body.retryAfter })
  return null
}

/** One link of the chain: a `ConvexError`, a `{ data, error }` auth result, a thrown `APIError` or an auth error body. */
function readOne(candidate: Record<string, unknown>): BackendError | null {
  const convex = convexErrorData(candidate)
  if (convex) return fromData(convex.data)
  if (candidate.name === 'APIError' && typeof candidate.body === 'object' && candidate.body !== null) {
    return fromAuthBody(candidate.body as Record<string, unknown>, candidate.statusCode)
  }
  if ('error' in candidate && typeof candidate.error === 'object' && candidate.error !== null) {
    const body = candidate.error as Record<string, unknown>
    return fromAuthBody(body, body.status)
  }
  if (typeof candidate.status === 'number' && ('statusText' in candidate || 'code' in candidate)) {
    return fromAuthBody(candidate, candidate.status)
  }
  return null
}

/**
 * Read a refusal out of anything a call threw or resolved with: a
 * `backendError()` from a Convex function, the rate limiter's own
 * `RateLimited` error, an auth client's `{ data, error }` result or its
 * `error`, a Better Auth `APIError`, and any of these as an `Error`'s
 * `cause`. `null` for anything else — a crash, an app's own error — so the
 * caller keeps its own fallback.
 *
 * @example
 * ```ts
 * try {
 *   await transform({ text })
 * }
 * catch (error) {
 *   const refusal = getBackendError(error)
 *   // Every field may be absent on the read side: check the one you use.
 *   if (refusal?.code === 'insufficient_credits' && refusal.data.need !== undefined) offerTopUp(refusal.data.need)
 *   else message.value = refusal?.message ?? 'Something went wrong.'
 * }
 * ```
 */
export function getBackendError(error: unknown): BackendError | null {
  const seen = new Set<unknown>()
  let current = error
  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    seen.add(current)
    const found = readOne(current as Record<string, unknown>)
    if (found) return found
    current = (current as { cause?: unknown }).cause
  }
  return null
}
