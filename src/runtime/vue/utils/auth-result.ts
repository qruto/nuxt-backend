/**
 * Better Auth client calls resolve with a `{ data, error }` envelope instead
 * of throwing (e.g. a cancelled passkey prompt still resolves). Unwrap the
 * envelope so page flows can use plain try/catch around auth calls.
 */
export function unwrapAuth<T>(result: unknown): T {
  const envelope = result as { data?: T, error?: { message?: string | null, statusText?: string } | null }
  if (envelope?.error) {
    throw new Error(envelope.error.message || envelope.error.statusText || 'Request failed')
  }
  return envelope?.data as T
}
