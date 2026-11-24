import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import { CHALLENGE_HEADER, HUMAN_PROOF_ROUTE, PROTECTED_AUTH_ROUTES } from '../../../convex/proof.js'
import { LAST_SIGN_IN_COOKIE, REAUTHENTICATE_HEADER } from '../../../convex/constants.js'
import { isEngineSignInPath } from '../../../convex/client/convex-auth/paths.js'

// The Better Auth client's fetch in a Convex Auth app. The account engine
// runs in the deployment's own functions (`auth:authRequest`, and
// `auth:signIn` for the routes that open a session, through the app's auth
// proxy so the refresh token lands in an HttpOnly cookie), not on an HTTP
// route: this turns each request the client makes into that call, and its
// answer back into the `Response` the client reads. Everything above it,
// the session store, the plugins, the package's composables, is unchanged.

/** The engine call's own answer. */
interface EngineAnswer {
  status: number
  body: unknown
  cookies: Array<{ name: string, value: string, maxAge?: number }>
}

/** A sign-in's answer, as the auth proxy hands it back. */
type SignInAnswer
  = | { status: 'complete', tokens: { accessToken: string }, response: EngineAnswer }
    | { status: 'error', userError?: { response?: EngineAnswer, recoveryToken?: string } }

/** What the transport needs of the app around it. */
export interface TransportContext {
  /** The deployment's URL. */
  convexUrl: string
  /** The app's base URL, `/` at the root. */
  baseURL: string
  /** The auth base path the engine's routes sit under on the deployment (`backend.authRoute`): what a proof is signed for. */
  authRoute: string
  /** The current Convex Auth access token, or `null` signed out. */
  token: () => string | null
  /** Adopt the session a sign-in opened (Convex Auth's `setSession`). */
  setSession: (tokens: { accessToken: string }) => Promise<void>
  /** End the session (Convex Auth's `signOut`). */
  signOut: () => Promise<void>
}

/** The base path the Better Auth client makes its requests under: its own default, whatever the app's auth route. */
const CLIENT_BASE_PATH = '/api/auth'

const AUTH_REQUEST = makeFunctionReference<'action'>('auth:authRequest')
const SIGN_IN = makeFunctionReference<'action'>('auth:signIn')

/** Where the browser keeps what the engine set for it: never a session's cookie, which stays on the deployment. */
const JAR_KEY = 'backend:convex-auth:jar'
/** Where a passkey-only account's recovery session waits for the passkey it saves. */
const RECOVERY_KEY = 'backend:convex-auth:recovery'

/** `sessionStorage`, or `undefined` where it cannot be read (a private window, a sandboxed frame). */
function storage(): Storage | undefined {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage
  }
  catch {
    return undefined
  }
}

/** `localStorage`, where the jar lasts as the cookies in it would (a trusted device's, for its 30 days). */
function lastingStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  }
  catch {
    return undefined
  }
}

function readJar(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(lastingStorage()?.getItem(JAR_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, string> : {}
  }
  catch {
    return {}
  }
}

/** Keep the cookies an answer set, drop the ones it deleted, and write the last sign-in method where the sign-in form reads it. */
function keepCookies(cookies: EngineAnswer['cookies']): void {
  if (cookies.length === 0) return
  const jar = readJar()
  for (const cookie of cookies) {
    if (cookie.maxAge === 0) Reflect.deleteProperty(jar, cookie.name)
    else jar[cookie.name] = cookie.value
    if (cookie.name === LAST_SIGN_IN_COOKIE && typeof document !== 'undefined') {
      const maxAge = cookie.maxAge ?? 30 * 24 * 60 * 60
      document.cookie = `${LAST_SIGN_IN_COOKIE}=${encodeURIComponent(cookie.value)}; path=/; max-age=${maxAge}; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`
    }
  }
  try {
    lastingStorage()?.setItem(JAR_KEY, JSON.stringify(jar))
  }
  catch {
    // A full or closed storage keeps the jar for this call only: a code then asks to be sent again.
  }
}

function recoveryToken(): string | undefined {
  try {
    return storage()?.getItem(RECOVERY_KEY) ?? undefined
  }
  catch {
    return undefined
  }
}

function setRecoveryToken(token: string | null): void {
  try {
    if (token) storage()?.setItem(RECOVERY_KEY, token)
    else storage()?.removeItem(RECOVERY_KEY)
  }
  catch {
    // Kept nowhere: the passkey it would save asks for the recovery code again.
  }
}

/** The request the client made, read whatever shape it came in. */
async function readRequest(input: RequestInfo | URL, init?: RequestInit) {
  const request = input instanceof Request ? input : undefined
  const url = new URL(request?.url ?? (input instanceof URL ? input.href : input as string), 'http://localhost')
  const method = (init?.method ?? request?.method ?? 'GET').toUpperCase()
  const headers = new Headers(init?.headers ?? request?.headers)
  const raw = init?.body ?? (request && method !== 'GET' ? await request.text() : undefined)
  let body: unknown
  if (typeof raw === 'string' && raw) {
    try {
      body = JSON.parse(raw)
    }
    catch {
      body = raw
    }
  }
  return { url, method, headers, body }
}

/** A JSON answer, as the client reads one. */
function json(status: number, body: unknown): Response {
  return new Response(body === undefined || body === null ? 'null' : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** The route under the auth base path, or `null` for a URL that is none of the engine's. */
export function enginePath(pathname: string, authRoute: string): string | null {
  const base = authRoute.replace(/\/+$/, '')
  if (pathname === base) return '/'
  return pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : null
}

/** Routes whose bot check or per-address limit the app's server signs for (`/api/human-proof`). */
function wantsServerContext(path: string, method: string): boolean {
  if (method !== 'POST') return false
  if ((PROTECTED_AUTH_ROUTES as readonly string[]).includes(path)) return true
  // A passkey's own routes run in the tap's task, where a wait could cost the prompt.
  return isEngineSignInPath(path) && !path.startsWith('/passkey/')
}

/** The proof and the signed client address the app's server gives one engine call, or nothing when it signs none. */
async function serverContext(context: TransportContext, path: string, body: unknown, headers: Headers): Promise<{ proof?: string, address?: string }> {
  try {
    // fallow-ignore-next-line security-sink -- the auth client's base URL (the app's own origin) and the module's fixed HUMAN_PROOF_ROUTE, never input; verified 2026-11-24
    const response = await fetch(`${context.baseURL.replace(/\/+$/, '')}${HUMAN_PROOF_ROUTE}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(headers.get(CHALLENGE_HEADER) ? { [CHALLENGE_HEADER]: headers.get(CHALLENGE_HEADER)! } : {}) },
      body: JSON.stringify({ auth: { path, body: body ?? null } }),
      credentials: 'same-origin',
    })
    if (response.status === 403) throw Object.assign(new Error('refused'), { response })
    if (!response.ok) return {}
    const answer = await response.json() as { proof?: unknown, address?: unknown }
    return {
      ...(typeof answer.proof === 'string' ? { proof: answer.proof } : {}),
      ...(typeof answer.address === 'string' ? { address: answer.address } : {}),
    }
  }
  catch (error) {
    // A bot check's refusal is the answer the route gives; anything else leaves the call to the deployment's own limits.
    if ((error as { response?: Response }).response) throw error
    return {}
  }
}

/** What the engine reads of the device: its browser, languages, and what the app's server signed for this call. */
function deviceOf(headers: Headers, server: { proof?: string, address?: string }): Record<string, string> {
  const language = headers.get('accept-language') ?? (typeof navigator === 'undefined' ? undefined : navigator.languages.join(','))
  const challenge = headers.get(CHALLENGE_HEADER)
  return {
    ...(typeof navigator === 'undefined' ? {} : { userAgent: navigator.userAgent }),
    ...(language ? { language } : {}),
    ...(server.address ? { address: server.address } : {}),
    ...(server.proof ? { proof: server.proof } : {}),
    ...(challenge ? { challenge } : {}),
  }
}

/** The engine call one request makes, with the device and the session's recovery token. */
function engineCall(request: { url: URL, method: string, headers: Headers, body: unknown }, path: string, server: { proof?: string, address?: string }, recovery: string | undefined) {
  const { url, method, headers, body } = request
  return {
    method: method as 'GET' | 'POST',
    path,
    ...(url.searchParams.size > 0 ? { query: Object.fromEntries(url.searchParams) } : {}),
    ...(method === 'POST' ? { body: body ?? {} } : {}),
    jar: readJar(),
    client: deviceOf(headers, server),
    ...(headers.get(REAUTHENTICATE_HEADER) ? { reauthenticate: true } : {}),
    ...(recovery ? { recoveryToken: recovery } : {}),
  }
}

/** A sign-in's answer: a complete one opens the session, a refusal keeps the engine's recovery token and cookies. */
async function signInAnswer(context: TransportContext, result: SignInAnswer): Promise<Response> {
  if (result.status === 'complete') {
    setRecoveryToken(null)
    keepCookies(result.response.cookies)
    await context.setSession(result.tokens)
    return json(result.response.status, result.response.body)
  }
  const answer = result.userError?.response
  if (result.userError?.recoveryToken) setRecoveryToken(result.userError.recoveryToken)
  if (answer) keepCookies(answer.cookies)
  return answer ? json(answer.status, answer.body) : json(401, { code: 'UNAUTHORIZED', message: 'The sign-in did not open a session.' })
}

/**
 * The client's `fetchOptions.customFetchImpl` in a Convex Auth app: each
 * engine route as a call to the deployment, its answer as a `Response`.
 */
export function createConvexAuthFetch(context: TransportContext): typeof fetch {
  const signInClient = () => new ConvexHttpClient(`${context.baseURL.replace(/\/+$/, '')}/api/_convex/auth/signin?path=`, { skipConvexDeploymentUrlCheck: true })
  const deployment = () => new ConvexHttpClient(context.convexUrl)
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const { url, method, headers, body } = await readRequest(input, init)
    const path = enginePath(url.pathname, CLIENT_BASE_PATH) ?? enginePath(url.pathname, context.authRoute)
    // fallow-ignore-next-line security-sink -- the auth client's own request, passed through unchanged: one this transport does not answer; verified 2026-11-24
    if (path === null || (method !== 'GET' && method !== 'POST')) return fetch(input, init)
    // Convex Auth ends the session: the engine's row goes with the core's.
    if (path === '/sign-out') {
      await context.signOut()
      setRecoveryToken(null)
      return json(200, { success: true })
    }
    let server: { proof?: string, address?: string }
    try {
      server = wantsServerContext(path, method) ? await serverContext(context, `${context.authRoute.replace(/\/+$/, '')}${path}`, body, headers) : {}
    }
    catch (error) {
      return (error as { response: Response }).response
    }
    const recovery = recoveryToken()
    const call = engineCall({ url, method, headers, body }, path, server, recovery)
    const token = context.token()
    // A route that opens a session goes through the app's auth proxy, which keeps its refresh token in an HttpOnly cookie.
    const opensSession = isEngineSignInPath(path) && (path !== '/passkey/verify-registration' || recovery)
    const client = opensSession ? signInClient() : deployment()
    if (token) client.setAuth(token)
    if (opensSession) return signInAnswer(context, await client.action(SIGN_IN, call) as SignInAnswer)
    const answer = await client.action(AUTH_REQUEST, call) as EngineAnswer
    keepCookies(answer.cookies)
    return json(answer.status, answer.body)
  }) as typeof fetch
}
