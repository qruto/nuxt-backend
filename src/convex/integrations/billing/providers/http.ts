import { type BillingProviderName, ProviderHttpError } from './types.js'

// The one HTTP path every commerce adapter calls its provider through, and
// the signature primitives their webhooks need, on Web Crypto alone.

/** One request to a provider's API. */
export interface ProviderRequest {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  path: string
  /** A JSON body, or a form (Stripe) as `URLSearchParams`. */
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
  /** Read the answer as bytes instead of JSON (an invoice PDF). */
  binary?: boolean
}

/** A JSON client bound to one provider's base URL and credentials. */
export type ProviderCall = <T = unknown>(operation: string, request: ProviderRequest) => Promise<T>

/** The provider's own error code, when its error body carries one, for the log; never its message. */
function errorCodeOf(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const record = body as Record<string, unknown>
  const nested = typeof record.error === 'object' && record.error !== null ? record.error as Record<string, unknown> : record
  const code = nested.code ?? nested.type ?? record.code
  return typeof code === 'string' && code.length <= 80 ? code : undefined
}

/** The request's URL: `path` under `baseUrl`, with the query's defined values. */
function requestUrl(baseUrl: string, request: ProviderRequest): URL {
  const url = new URL(request.path.replace(/^\//, ''), baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
  return url
}

/** The request's body and its content type: a form as Stripe takes it, anything else as JSON. */
function encodedBody(body: unknown): { body?: string, headers: Record<string, string> } {
  if (body === undefined) return { headers: {} }
  if (body instanceof URLSearchParams) return { body: body.toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } }
  return { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
}

/** The refusal a failed answer becomes: its status, and the provider's error code when the body names one. */
async function refusalOf(provider: BillingProviderName, operation: string, response: Response): Promise<ProviderHttpError> {
  let code: string | undefined
  try {
    code = errorCodeOf(await response.json())
  }
  catch {
    // No JSON body: the status says enough.
  }
  return new ProviderHttpError(provider, operation, response.status, code)
}

/** A successful answer's body: bytes, nothing, or JSON. */
async function answerOf<T>(response: Response, binary: boolean | undefined): Promise<T> {
  if (binary) return await response.arrayBuffer() as T
  const text = response.status === 204 ? '' : await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}

/** A client for `baseUrl`, sending `headers` (the credentials) with every request. */
export function providerClient(
  provider: BillingProviderName,
  baseUrl: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch = globalThis.fetch,
): ProviderCall {
  return async <T>(operation: string, request: ProviderRequest): Promise<T> => {
    const encoded = encodedBody(request.body)
    const response = await fetchImpl(requestUrl(baseUrl, request), {
      method: request.method,
      headers: { ...headers, ...encoded.headers, ...request.headers },
      body: encoded.body,
    })
    if (!response.ok) throw await refusalOf(provider, operation, response)
    return answerOf<T>(response, request.binary)
  }
}

/**
 * A nested object as Stripe's form encoding writes it:
 * `{ line_items: [{ price: 'p' }] }` → `line_items[0][price]=p`. Undefined
 * values are left out.
 */
export function stripeForm(value: Record<string, unknown>): URLSearchParams {
  const form = new URLSearchParams()
  const walk = (prefix: string, node: unknown): void => {
    if (node === undefined || node === null) return
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(`${prefix}[${index}]`, item))
      return
    }
    if (typeof node === 'object') {
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) walk(prefix ? `${prefix}[${key}]` : key, child)
      return
    }
    form.append(prefix, String(node as string | number | boolean | bigint))
  }
  walk('', value)
  return form
}

const encoder = new TextEncoder()

/** HMAC-SHA256 of `message` under `key`, as lowercase hex. */
export async function hmacSha256Hex(key: string | Uint8Array, message: string): Promise<string> {
  const keyBytes = typeof key === 'string' ? encoder.encode(key) : key
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message)))
  return Array.from(signature, byte => byte.toString(16).padStart(2, '0')).join('')
}

/** SHA-256 of `message`, as lowercase hex. */
export async function sha256Hex(message: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(message)))
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
}

/** Whether two strings are equal, in time that depends on their length alone. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let difference = 0
  for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return difference === 0
}

/** A metadata object reduced to its string values, as every provider's metadata is read. */
export function stringMetadata(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) return {}
  const out: Record<string, string> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'string') out[key] = item
    else if (typeof item === 'number' || typeof item === 'boolean') out[key] = String(item)
  }
  return out
}

/** The metadata key every adapter stores the billing entity id under. */
export const ENTITY_METADATA_KEY = 'entity_id'

/** A field read as a string, or `null`. */
export function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** A field read as an object's `id` or as the id string itself (an expandable reference). */
export function idOf(value: unknown): string | null {
  if (typeof value === 'string') return value || null
  if (typeof value === 'object' && value !== null) return str((value as { id?: unknown }).id)
  return null
}

/** A field read as a finite number, or `null`. */
export function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** An ISO date or Unix seconds read as Unix milliseconds, or `null`. */
export function millis(value: unknown, unit: 'seconds' | 'iso' = 'iso'): number | null {
  if (unit === 'seconds') return typeof value === 'number' ? value * 1000 : null
  if (typeof value !== 'string') return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}
