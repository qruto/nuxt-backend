import { describe, expect, it } from 'vitest'
import { backendError } from '../../src/convex/errors'
import { markPassing, providerFailurePasses, providerRefusesForGood } from '../../src/convex/integrations/billing/provider-failure'

// Whether a provider failure may pass on a retry, as the package's refusal
// carries it: the provider having trouble (no answer, 408, 429, 5xx) passes;
// the provider refusing the request itself (any other 4xx), or the SDK
// refusing it before it was sent, does not. A job's owed charge waits out
// only the first kind.

const refusal = () => backendError('unavailable', { service: 'billing', reason: 'provider_refused' })
const status = (statusCode: number) => Object.assign(new Error(`HTTP ${statusCode}`), { name: 'PolarError', statusCode })
const named = (name: string) => Object.assign(new Error(name), { name })

describe('a provider failure', () => {
  it.each([
    ['a 500', status(500)],
    ['a 503', status(503)],
    ['a 429', status(429)],
    ['a 408', status(408)],
    ['an answer the SDK could not read', Object.assign(status(200), { name: 'ResponseValidationError' })],
    ['a connection that failed', named('ConnectionError')],
    ['a request that timed out', named('RequestTimeoutError')],
    ['an error with no status at all', 'socket hang up'],
  ])('may pass on a retry: %s', (_label, error) => {
    expect(providerFailurePasses(markPassing(refusal(), error))).toBe(true)
    expect(providerRefusesForGood(markPassing(refusal(), error))).toBe(false)
  })

  it.each([
    ['a 400', status(400)],
    ['a revoked token, 401', status(401)],
    ['a 403', status(403)],
    ['a 404', status(404)],
    ['metadata over the limits, 422', status(422)],
    ['a refusal the SDK could not read, 422', Object.assign(status(422), { name: 'ResponseValidationError' })],
    ['a request the SDK refused to send', named('SDKValidationError')],
    ['an invalid request', named('InvalidRequestError')],
  ])('is refused again on every try: %s', (_label, error) => {
    expect(providerFailurePasses(markPassing(refusal(), error))).toBe(false)
    expect(providerRefusesForGood(markPassing(refusal(), error))).toBe(true)
  })

  it('is no passing failure when no provider answer marked it', () => {
    expect(providerFailurePasses(refusal())).toBe(false)
    expect(providerFailurePasses(status(503))).toBe(false)
    expect(providerFailurePasses(undefined)).toBe(false)
    // Nor refused for good: a shortfall or a failed write was never the provider's answer.
    expect(providerRefusesForGood(refusal())).toBe(false)
    expect(providerRefusesForGood(status(401))).toBe(false)
    expect(providerRefusesForGood(undefined)).toBe(false)
  })

  it('keeps the mark off the refusal\'s data and its own keys', () => {
    const marked = markPassing(refusal(), status(503))
    expect(Object.keys(marked)).not.toContain('passing')
    expect(JSON.stringify(marked.data)).toBe(JSON.stringify(refusal().data))
  })
})
