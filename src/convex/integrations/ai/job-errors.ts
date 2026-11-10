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
  /** An image call that drew nothing and said no more: try once more at most, since each try bills the prompt again. */
    | { kind: 'empty' }
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
  code?: unknown
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

/**
 * The provider's own words behind an error, when a gateway answered a
 * failed call with a 200 whose body is an `error` object (the Convex AI
 * Gateway passing on an upstream refusal) or with a body the SDK could not
 * read as an answer: the AI SDK then reports only "Invalid JSON response".
 */
export function upstreamErrorOf(error: unknown): string | undefined {
  for (const link of chainOf(error)) {
    if (typeof link.responseBody !== 'string') continue
    try {
      const body = JSON.parse(link.responseBody) as { error?: { message?: unknown } | string }
      const message = typeof body?.error === 'string' ? body.error : body?.error?.message
      if (typeof message === 'string' && message.trim()) return message.trim().slice(0, 500)
    }
    catch {
      // A body that is not JSON says nothing more than the error does.
    }
  }
  return undefined
}

/** Whether any text of the chain (name, message, type, code, body) says `pattern`. */
const says = (chain: readonly ErrorLike[], pattern: RegExp): boolean =>
  chain.some(error => [error.name, error.message, error.type, error.code, error.responseBody].some(text => typeof text === 'string' && pattern.test(text)))

/**
 * A provider's refusal of the content, in any of its words: a content
 * filter, a content policy (DALL·E's `content_policy_violation`),
 * OpenAI's image models' `moderation_blocked`, or a request "rejected by
 * the safety system".
 */
export const CONTENT_REFUSAL = /content[-_ ]filter|content_policy|moderation_blocked|safety[_ ]system/i

/** The AI SDK's `NoImageGeneratedError`: `generateImage` got no image back, which another attempt may get. */
export const NO_IMAGE = /NoImageGeneratedError/

/**
 * A finish reason a provider gives an image answer its safety filter
 * emptied: Google's `SAFETY`, `IMAGE_SAFETY`, `PROHIBITED_CONTENT`,
 * `BLOCKLIST` and `SPII`, a filter's explanation that names safety, a
 * `content_filter`, a content policy, or `moderation_blocked`.
 */
const SAFETY_REASON = /safety|prohibited|blocklist|spii|content[-_ ]?filter|content_policy|moderation_blocked/i

/** The keys an image answer's provider metadata gives its finish reason under, at any depth. */
const REASON_KEY = /^(?:finish_?reason|block_?reason|rai_?filtered_?reason|filtered_?reason)$/i

/**
 * Whether an image answer that drew nothing says its safety filter
 * emptied it: a finish reason for safety in its provider metadata
 * ({@link SAFETY_REASON}, read under a finish reason's key only, never
 * from a setting's name), or a warning that says the content was refused.
 */
export function emptiedForSafety(answer: { providerMetadata?: unknown, warnings?: readonly unknown[] }): boolean {
  const warned = (answer.warnings ?? []).some((warning) => {
    const { type, message } = (typeof warning === 'object' && warning !== null ? warning : {}) as { type?: unknown, message?: unknown }
    return type === 'other' && typeof message === 'string' && (CONTENT_REFUSAL.test(message) || /safety[_ ]filter/i.test(message))
  })
  return warned || reasonsSafety(answer.providerMetadata, 0)
}

/** A finish reason for safety under one of {@link REASON_KEY}, at most five levels down. */
function reasonsSafety(value: unknown, depth: number): boolean {
  if (depth > 4 || typeof value !== 'object' || value === null) return false
  return Object.entries(value).some(([key, child]) => {
    const reasons = REASON_KEY.test(key) ? (Array.isArray(child) ? child : [child]) : []
    return reasons.some(reason => typeof reason === 'string' && SAFETY_REASON.test(reason)) || reasonsSafety(child, depth + 1)
  })
}

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
 * that finished with a `content-filter` reason, or a provider that says it
 * refused the content ({@link CONTENT_REFUSAL}), a refused prompt; an image
 * call that got no image back (the AI SDK's `NoImageGeneratedError`) and
 * says no more an empty answer, tried once more at most.
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
  // An error marked retryable (`retryable()`, or a provider's) is tried again, whatever a call's answer was.
  const marked = chain.some(link => link.isRetryable === true)
  if (!marked && (calls.some(call => call.finishReason === 'content-filter') || says(chain, CONTENT_REFUSAL))) return { kind: 'blocked' }
  const retryable = marked
    || (status !== undefined && (status === 408 || status >= 500))
    || says(chain, /Timeout|timed out|AbortError|ECONNRESET/i)
  if (retryable) return { kind: 'retryable', ...wait }
  if (says(chain, NO_IMAGE)) return { kind: 'empty' }
  return { kind: 'fatal' }
}

/** How many attempts an empty image answer gets in all: the first, and one more. */
export const EMPTY_ATTEMPTS = 2

/**
 * An error a job step throws for a failure another attempt may not meet,
 * such as a model that answered with no image: the queue waits and runs
 * the step again, up to 4 attempts, as for a provider's passing error,
 * instead of failing the job at once.
 *
 * @example
 * ```ts
 * if (!image) throw retryable(`The model returned no image (${result.finishReason})`)
 * ```
 */
export function retryable(message: string): Error {
  return Object.assign(new Error(message), { isRetryable: true })
}

/** Whether a failure may pass on another attempt: a throttle, a timeout, a passing provider error, or an empty image answer. */
export function isPassing(failure: StepFailure): failure is Extract<StepFailure, { kind: 'throttled' | 'retryable' | 'empty' }> {
  return failure.kind === 'throttled' || failure.kind === 'retryable' || failure.kind === 'empty'
}

/** How a failed attempt moves its model's limit: a throttle halves it, a passing or unknown error or an empty answer restarts its clean run, a refusal leaves it. */
export function modelOutcomeOf(failure: StepFailure): 'throttled' | 'error' | undefined {
  if (failure.kind === 'throttled') return 'throttled'
  return failure.kind === 'retryable' || failure.kind === 'empty' || failure.kind === 'fatal' ? 'error' : undefined
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
