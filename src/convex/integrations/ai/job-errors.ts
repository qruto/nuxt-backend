import { getBackendError } from '../../errors.js'
import type { ModelCall } from './models.js'

// How a job step's error reads, decided inside the step's action, where the
// error object, its status and its headers still exist: the queue gets the
// outcome as data, never the provider's message.

/** What a failed attempt of a step means for the job. */
export type StepFailure
  /** The model answered `429`: halve its rate, wait, try again. */
  = | { kind: 'throttled', retryAfter?: number }
  /** A timeout or an error the provider marks retryable (`502`, `503`): wait, try again. */
    | { kind: 'retryable', retryAfter?: number }
  /** The model refused the content: fail the job at once, `content_blocked`. */
    | { kind: 'blocked' }
  /** A spending limit refused the call (a Vercel budget's `402`): fail at once, `provider_refused`. */
    | { kind: 'refused' }
  /** A catalog error from the step's own code or the model route: fail at once with it. */
    | { kind: 'catalog', payload: Record<string, unknown> }
  /** Anything else: fail at once, `job_failed`. */
    | { kind: 'fatal' }

interface ErrorLike {
  name?: unknown
  message?: unknown
  statusCode?: unknown
  status?: unknown
  isRetryable?: unknown
  responseHeaders?: unknown
  responseBody?: unknown
  type?: unknown
  cause?: unknown
  data?: unknown
}

/** Every error in a chain of causes, the outer one first. */
function chainOf(error: unknown): ErrorLike[] {
  const chain: ErrorLike[] = []
  const seen = new Set<unknown>()
  let current = error
  while (typeof current === 'object' && current !== null && !seen.has(current) && chain.length < 8) {
    seen.add(current)
    chain.push(current as ErrorLike)
    current = (current as ErrorLike).cause
  }
  return chain
}

/** The HTTP status an error carries, at any depth of its causes. */
function statusOf(chain: readonly ErrorLike[]): number | undefined {
  for (const error of chain) {
    const status = typeof error.statusCode === 'number' ? error.statusCode : typeof error.status === 'number' ? error.status : undefined
    if (status !== undefined) return status
  }
  return undefined
}

/** A `Retry-After` header as ms: seconds, or an HTTP date. */
export function retryAfterOf(error: unknown, now = Date.now()): number | undefined {
  for (const link of chainOf(error)) {
    const headers = link.responseHeaders as Record<string, string | undefined> | undefined
    const value = headers && typeof headers === 'object'
      ? Object.entries(headers).find(([key]) => key.toLowerCase() === 'retry-after')?.[1]
      : undefined
    if (value === undefined) continue
    const seconds = Number(value)
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
    const date = Date.parse(value)
    if (Number.isFinite(date)) return Math.max(0, date - now)
  }
  return undefined
}

/** Whether any text of the chain (name, message, type, body) says `pattern`. */
const says = (chain: readonly ErrorLike[], pattern: RegExp): boolean =>
  chain.some(error => [error.name, error.message, error.type, error.responseBody].some(text => typeof text === 'string' && pattern.test(text)))

/** A catalog error's payload: its code and fields, as `backendError` threw it. */
export function catalogPayload(error: unknown): Record<string, unknown> | undefined {
  for (const link of chainOf(error)) {
    const data = link.data
    if (data && typeof data === 'object' && typeof (data as { code?: unknown }).code === 'string' && getBackendError(link)) return { ...(data as Record<string, unknown>) }
  }
  return undefined
}

/**
 * Read a step's error, with the model calls the attempt made: a catalog
 * error passes as it is; a `402` or the gateway's
 * `quota_for_entity_exceeded`, whatever error class wraps it, is a refusal;
 * a `429` or the gateway's rate-limit error a throttle; a timeout, a `408`,
 * `5xx` or an error the provider marks retryable a passing failure; a call
 * that finished with a `content-filter` reason a refused prompt.
 */
export function classifyStepError(error: unknown, calls: readonly ModelCall[] = []): StepFailure {
  const payload = catalogPayload(error)
  if (payload) return { kind: 'catalog', payload }
  const chain = chainOf(error)
  const status = statusOf(chain)
  const retryAfter = retryAfterOf(error)
  const wait = retryAfter === undefined ? {} : { retryAfter }
  if (status === 402 || says(chain, /quota_for_entity_exceeded/)) return { kind: 'refused' }
  if (status === 429 || says(chain, /RateLimit|rate[_ ]limit/i)) return { kind: 'throttled', ...wait }
  if (calls.some(call => call.finishReason === 'content-filter') || says(chain, /content[-_ ]filter|content_policy/i)) return { kind: 'blocked' }
  const retryable = chain.some(link => link.isRetryable === true)
    || (status !== undefined && (status === 408 || status >= 500))
    || says(chain, /Timeout|timed out|AbortError|ECONNRESET/i)
  if (retryable) return { kind: 'retryable', ...wait }
  return { kind: 'fatal' }
}

/** Whether a failure may pass on another attempt: a throttle, a timeout or a passing provider error. */
export function isPassing(failure: StepFailure): failure is Extract<StepFailure, { kind: 'throttled' | 'retryable' }> {
  return failure.kind === 'throttled' || failure.kind === 'retryable'
}

/** How a failed attempt moves its model's limit: a throttle halves it, a passing or unknown error restarts its clean run, a refusal leaves it. */
export function modelOutcomeOf(failure: StepFailure): 'throttled' | 'error' | undefined {
  if (failure.kind === 'throttled') return 'throttled'
  return failure.kind === 'retryable' || failure.kind === 'fatal' ? 'error' : undefined
}

/** The catalog error a job fails with, as its payload: what the person sees. */
export function failurePayload(failure: StepFailure): Record<string, unknown> {
  switch (failure.kind) {
    case 'catalog': return failure.payload
    case 'blocked': return { code: 'invalid_input', field: 'prompt', reason: 'content_blocked' }
    case 'fatal': return { code: 'unavailable', service: 'ai', reason: 'job_failed' }
    default: return { code: 'unavailable', service: 'ai', reason: 'provider_refused' }
  }
}
