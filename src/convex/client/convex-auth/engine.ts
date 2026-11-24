import type { GenericCtx } from '@convex-dev/better-auth'
import type { GenericDataModel } from 'convex/server'

// The account engine of a Convex Auth app: the same Better Auth instance a
// Better Auth app serves on `/api/auth`, run in-process inside the app's
// Convex functions, with no HTTP route of its own. Every request goes
// through its whole pipeline (the request guards, the database hooks, the
// plugins), so a workspace, an invitation, a code or an admin action runs
// the same rules either way. Convex Auth owns what reaches the browser: the
// session, its refresh tokens and the access token.

/** A request to the engine, as the transport sends it. */
export interface EngineRequest {
  method: 'GET' | 'POST'
  /** The route under the auth base path, `/organization/set-active` say. */
  path: string
  /** The query string's parameters, for a GET. */
  query?: Record<string, string>
  /** The JSON body, for a POST. */
  body?: unknown
  /** Headers the request carries: the session's bearer token, the browser's own, a proof. */
  headers?: Headers
}

/** A cookie the engine set, as the transport hands it back. `maxAge` 0 deletes it. */
export interface EngineCookie {
  name: string
  value: string
  maxAge?: number
}

/** What the engine answered. */
export interface EngineResponse {
  status: number
  /** The JSON body, else the text, else `null`. */
  body: unknown
  /** The cookies it set, but the session's own (Convex Auth holds the session). */
  cookies: EngineCookie[]
  /** The session token of the session the request opened, when it opened one. */
  sessionToken: string | null
  /** Every cookie it set, the session's included, by name: what the transport reads for itself. */
  allCookies: Map<string, EngineCookie>
}

/** The engine for one ctx: `setupAuth`'s `createAuth`. */
export type EngineFactory<DM extends GenericDataModel> = (ctx: GenericCtx<DM>) => {
  handler: (request: Request) => Promise<Response>
  options: { baseURL?: unknown, basePath?: string }
}

/** The origin an engine request is made on: the app's site, which the engine trusts. */
function engineOrigin(options: { baseURL?: unknown }): string {
  const base = options.baseURL
  const url = typeof base === 'string' ? base : (base as { fallback?: string } | undefined)?.fallback
  return (url || 'http://localhost').replace(/\/+$/, '')
}

/** A cookie's value, decoded as it was encoded; a value that is no URI encoding stays as it came. */
function decodedValue(raw: string): string {
  try {
    return decodeURIComponent(raw)
  }
  catch {
    return raw
  }
}

/** How long a `Set-Cookie` line's attributes let the cookie live, in seconds: `0` for one that expired, `undefined` for a session cookie. */
function maxAgeOf(attributes: readonly string[]): number | undefined {
  const pairs = attributes.map((attribute) => {
    const at = attribute.indexOf('=')
    return at === -1 ? [attribute.trim().toLowerCase(), ''] : [attribute.slice(0, at).trim().toLowerCase(), attribute.slice(at + 1).trim()]
  })
  const maxAge = pairs.find(([key]) => key === 'max-age')?.[1]
  if (maxAge !== undefined && maxAge !== '' && !Number.isNaN(Number(maxAge))) return Number(maxAge)
  const expires = pairs.find(([key]) => key === 'expires')?.[1]
  return expires && new Date(expires).getTime() <= Date.now() ? 0 : undefined
}

/** One `Set-Cookie` line's cookie, or `null` for a line that names none. */
function parseSetCookie(line: string): EngineCookie | null {
  const [pair = '', ...attributes] = line.split(';')
  const at = pair.indexOf('=')
  if (at <= 0) return null
  const maxAge = maxAgeOf(attributes)
  return { name: pair.slice(0, at).trim(), value: decodedValue(pair.slice(at + 1).trim()), ...(maxAge === undefined ? {} : { maxAge }) }
}

/**
 * The cookies of a `Set-Cookie` header list, by name. Better Auth names its
 * own under its prefix (`better-auth.`, `__Secure-better-auth.` over HTTPS).
 */
export function parseSetCookies(values: readonly string[]): Map<string, EngineCookie> {
  const cookies = new Map<string, EngineCookie>()
  for (const cookie of values.map(parseSetCookie)) {
    if (cookie) cookies.set(cookie.name, cookie)
  }
  return cookies
}

/** The cookie's name without Better Auth's prefix: `session_token` for `__Secure-better-auth.session_token`. */
export function cookieBaseName(name: string): string {
  return name.replace(/^__(?:Secure|Host)-/, '').replace(/^[^.]*\./, '')
}

/**
 * The cookies that never leave the deployment: the session's own (Convex
 * Auth holds the session instead), its cache, and the administrator's
 * session an impersonation keeps aside.
 */
const SERVER_COOKIES = new Set(['session_token', 'session_data', 'dont_remember', 'admin_session'])

/** Whether a cookie stays on the deployment, out of the browser's jar. */
export function isServerCookie(name: string): boolean {
  return SERVER_COOKIES.has(cookieBaseName(name))
}

/**
 * Run one request through the engine, in-process, and read its answer.
 * The engine reads the request as it would over HTTP: the method, the
 * path under the auth base path, the headers and the body.
 */
export async function runEngine<DM extends GenericDataModel>(
  ctx: GenericCtx<DM>,
  createAuth: EngineFactory<DM>,
  request: EngineRequest,
): Promise<EngineResponse> {
  const auth = createAuth(ctx)
  const origin = engineOrigin(auth.options)
  const url = new URL(`${origin}${auth.options.basePath ?? '/api/auth'}${request.path}`)
  for (const [key, value] of Object.entries(request.query ?? {})) url.searchParams.set(key, value)
  const headers = new Headers(request.headers)
  // The engine checks a request's origin against the app's: an in-process one is the app's own.
  if (!headers.has('origin')) headers.set('origin', origin)
  const init: RequestInit = { method: request.method, headers }
  if (request.method === 'POST') {
    headers.set('content-type', 'application/json')
    init.body = JSON.stringify(request.body ?? {})
  }
  const response = await auth.handler(new Request(url, init))
  const text = await response.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    }
    catch {
      body = text
    }
  }
  const setCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : (response.headers.get('set-cookie') ?? '').split(/,(?=\s*[\w.-]+=)/)
  const allCookies = parseSetCookies(setCookies.filter(Boolean))
  // The bearer plugin names the session a request opened: its signed token.
  const signed = response.headers.get('set-auth-token')
  return {
    status: response.status,
    body,
    cookies: [...allCookies.values()].filter(cookie => !isServerCookie(cookie.name)),
    sessionToken: signed ? sessionTokenOf(signed) : null,
    allCookies,
  }
}

/** The session token of a signed session cookie (`<token>.<signature>`). */
export function sessionTokenOf(signed: string): string {
  const at = signed.indexOf('.')
  return at === -1 ? signed : signed.slice(0, at)
}

/** The `Cookie` header of a jar the browser holds: its cookies but the ones that stay on the deployment. */
export function jarCookieHeader(jar: Readonly<Record<string, string>> | undefined): string | undefined {
  if (!jar) return undefined
  const pairs = Object.entries(jar)
    .filter(([name, value]) => typeof value === 'string' && /^[\w.-]+$/.test(name) && !isServerCookie(name))
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
  return pairs.length > 0 ? pairs.join('; ') : undefined
}
