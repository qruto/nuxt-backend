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

/**
 * The `APIError` for a refusal on an auth route, by catalog code: the code's
 * status, and a body with the code, its fields and `message`, the sentence
 * the sign-in UI shows. The fields are checked against the catalog like
 * `backendError`'s.
 */
export function authRefusal<C extends BackendErrorCode>(code: C, data: BackendErrorData<C> & { message: string }): APIError {
  const { data: payload } = backendError(code, ...([data] as never))
  return new APIError(STATUS_NAMES[BACKEND_ERRORS[code].status], { ...payload, message: data.message })
}
