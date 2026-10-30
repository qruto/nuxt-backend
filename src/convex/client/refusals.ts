import { APIError } from 'better-auth/api'
import { BACKEND_ERRORS, backendError, type BackendErrorCode, type BackendErrorData } from '../errors.js'

// An auth route refuses with an `APIError`, not a `ConvexError`: Better Auth
// answers it as the HTTP status and spreads the body into the client's
// `{ error }`. The body carries the catalog code and its fields, so
// `getBackendError(result)` reads an auth refusal the way it reads a
// function's.

/** The status names `APIError` takes, for the catalog's statuses. */
const STATUS_NAMES = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  402: 'PAYMENT_REQUIRED',
  403: 'FORBIDDEN',
  409: 'CONFLICT',
  429: 'TOO_MANY_REQUESTS',
  503: 'SERVICE_UNAVAILABLE',
} as const

/** What `authRefusal` takes after the code: the code's data, optional for a code whose fields are all optional. */
type AuthRefusalArgs<C extends BackendErrorCode> = Record<string, never> extends BackendErrorData<C>
  ? [data?: BackendErrorData<C>]
  : [data: BackendErrorData<C>]

/**
 * The `APIError` for a refusal on an auth route, by catalog code: the code's
 * status, and a body with the code and its fields. The fields are checked
 * against the catalog like `backendError`'s. Better Auth's client reads the
 * body's `message`: a sentence written for the person (`data.message`, an
 * app's own `canSignIn` refusal, say) when there is one, else the code's
 * English label, which `getBackendError` recognizes as the label and the
 * `errors` labels translate. The package's own refusals pass none.
 */
export function authRefusal<C extends BackendErrorCode>(code: C, ...[data]: AuthRefusalArgs<C>): APIError {
  const error = backendError(code, ...([data] as never))
  const payload = error.data as Record<string, unknown>
  return new APIError(STATUS_NAMES[BACKEND_ERRORS[code].status], { ...payload, message: typeof payload.message === 'string' ? payload.message : error.message })
}
