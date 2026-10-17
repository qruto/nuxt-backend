// The refusals the package throws, as a small catalog of stable codes. A
// refusal is a `ConvexError` whose data is `{ code, ...fields }`: Convex sends
// that data to the client in production too, where a plain `Error` reaches it
// as "Server Error". The English sentence a throw site writes stays the error's
// `message`, for the deployment log and for a developer; what a person reads
// comes from the `errors` label group, or from a sentence written for them in
// `data.message`. Runtime-neutral (no Vue, no server-only import), so the Vue
// side reads the same catalog.

import { ConvexError, v, type GenericValidator, type Infer, type Value } from 'convex/values'
import { createTranslate, LABELS } from './labels.js'

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
 *   `not_owner`, `impersonating`, `sign_in_refused`, `customer_taken`,
 *   `billing_profile_mismatch`, `gift_refused`, `not_recipient`, `no_email`).
 * - `no_workspace` — the call needs an active workspace and there is none.
 * - `rate_limited` — a named limit is spent; `retryAfter` is in milliseconds.
 * - `insufficient_credits` — the balance can't cover the spend.
 * - `invalid_input` — an argument the call refuses; `field` names it.
 * - `not_ready` — there is nothing to act on yet, and retrying will not
 *   change that: `reason` says what has to happen first (`no_customer`,
 *   `not_synced`).
 * - `unavailable` — a service can't serve the call; `service` and
 *   `reason` say which and why. Only `provider_refused` may pass on a retry;
 *   the others need the deployment fixed. Nothing throws service `backend`
 *   with reason `unexpected`: it is how a composable's `error` reads a
 *   failure without a code (a crash, an app's own error), and says nothing
 *   about whether a service is down.
 */
export const BACKEND_ERRORS = {
  unauthenticated: { status: 401, data: v.object({ message: personMessage }) },
  forbidden: { status: 403, data: v.object({ reason: v.string(), message: personMessage }) },
  no_workspace: { status: 409, data: v.object({ message: personMessage }) },
  rate_limited: {
    status: 429,
    data: v.object({ retryAfter: v.optional(v.number()), limit: v.optional(v.string()), message: personMessage }),
  },
  insufficient_credits: {
    status: 402,
    data: v.object({ meter: v.optional(v.string()), balance: v.number(), need: v.number(), message: personMessage }),
  },
  invalid_input: { status: 400, data: v.object({ field: v.string(), message: personMessage }) },
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

const translate = createTranslate(LABELS)

/** Whether `value` fits a catalog validator: the strings, numbers and objects of optional fields it uses. */
function conforms(validator: GenericValidator, value: unknown): boolean {
  if (value === undefined) return validator.isOptional === 'optional'
  switch (validator.kind) {
    case 'string': return typeof value === 'string'
    case 'float64': return typeof value === 'number' && Number.isFinite(value)
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
      const record = value as Record<string, unknown>
      return Object.keys(record).every(key => key in validator.fields)
        && Object.entries(validator.fields).every(([key, field]) => conforms(field as GenericValidator, record[key]))
    }
    default: return false
  }
}

/** The fields without their `undefined` entries: a Convex value has none. */
function defined<T extends Record<string, unknown>>(fields: T): T {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as T
}

/** A label, or `undefined` when the `errors` group has none by that name. */
function errorLabel(name: string, params?: Record<string, string | number>): string | undefined {
  const key = `errors.${name}`
  const text = translate(key, params)
  return text === key ? undefined : text
}

/**
 * The English sentence for a code, filled from its fields. A label with
 * numbers in it (the wait, the balance) is used only when every number is
 * there, so a placeholder never reaches a person; a reason with a sentence of
 * its own (`errors.<code>_<reason>`) gets that one.
 */
function labelFor(code: BackendErrorCode, data: Record<string, unknown>): string {
  if (code === 'rate_limited' && typeof data.retryAfter === 'number') {
    return errorLabel('rate_limited_for', { count: Math.max(1, Math.ceil(data.retryAfter / 1000)) })!
  }
  if (code === 'insufficient_credits' && typeof data.balance === 'number' && typeof data.need === 'number') {
    return errorLabel('insufficient_credits_amounts', { balance: data.balance, need: data.need })!
  }
  const byReason = typeof data.reason === 'string' ? errorLabel(`${code}_${data.reason}`) : undefined
  return byReason ?? errorLabel(code) ?? code
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
  const message = typeof data.message === 'string' && data.message ? data.message : labelFor(code, data)
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

/** The auth routes' error, as the client hands it over (`result.error`) or as the server threw it (`APIError`). */
function fromAuthBody(body: Record<string, unknown>, status: unknown): BackendError | null {
  if (isCode(body.code)) return read(body.code, body)
  const message = typeof body.message === 'string' && body.message ? body.message : undefined
  // Better Auth's own refusals carry its UPPER_SNAKE codes; the status says which of ours it is.
  if (status === 401) return read('unauthenticated', { message })
  if (status === 403) return read('forbidden', { reason: typeof body.code === 'string' ? body.code.toLowerCase() : 'forbidden', message })
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
