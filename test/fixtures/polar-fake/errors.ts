// The provider's error answers, in the shapes its SDK parses: `404` with
// `{ error: 'ResourceNotFound', detail }`, `422` with a validation `detail`
// list, and a plain `{ error, detail }` for any other refusal.

/** A refusal the API answers with a status and the provider's error body. */
export class FakeApiError extends Error {
  readonly status: number
  readonly body: Record<string, unknown>

  constructor(status: number, body: Record<string, unknown>) {
    super(typeof body.detail === 'string' ? body.detail : `HTTP ${status}`)
    this.status = status
    this.body = body
  }
}

/** The object asked for is not there (or no longer is). */
export function notFound(what: string): FakeApiError {
  return new FakeApiError(404, { error: 'ResourceNotFound', detail: `${what} not found.` })
}

/** A field of the request is refused, as the provider's validation answers it. */
export function invalid(field: string, message: string): FakeApiError {
  return new FakeApiError(422, { detail: [{ loc: ['body', field], msg: message, type: 'value_error' }] })
}

/** A request the provider refuses for its state rather than its shape. */
export function refused(error: string, detail: string, status = 403): FakeApiError {
  return new FakeApiError(status, { error, detail })
}
