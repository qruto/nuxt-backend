// The bot check's proof and the routes behind it: what the app's server
// signs once its own bot check passed, what the deployment's env sets, and
// what the deployment, doctor and the browser read. No import of its own, so the CLI, the Nuxt module, Nitro
// and the Convex runtime all load it as it is: Web Crypto only.

/** The request header a proof travels in, from the app's server to the deployment. */
export const PROOF_HEADER = 'x-backend-proof'

/** The request header Better Auth's captcha plugin reads a challenge answer from. */
export const CHALLENGE_HEADER = 'x-captcha-response'

/** How long a proof is accepted after the app's server signed it: a minute. */
export const PROOF_TTL_MS = 60_000

/** How far ahead of the verifier's clock a proof may be stamped, for the clocks of two machines. */
const PROOF_CLOCK_SKEW_MS = 5_000

/**
 * The auth routes behind the bot check, relative to the auth base path: the
 * requests that send a code (sign-in and sign-up both start there), create
 * an account, or try a password (when an app turns passwords on: the route
 * credential stuffing aims at). The code checks, passkeys and session
 * routes are not: each has its own limits, and none of them sends mail.
 */
export const PROTECTED_AUTH_ROUTES = [
  '/email-otp/send-verification-otp',
  '/email-otp/request-password-reset',
  '/forget-password/email-otp',
  '/sign-up/email',
  '/sign-in/email',
] as const

/**
 * The app's own route that answers a bot check with a proof for one call
 * (`useHumanCheck().token(action)`), for the calls that never pass through
 * the app's server: mutations and actions over the live connection.
 */
export const HUMAN_PROOF_ROUTE = '/api/human-proof'

/** The method a proof for a function call is signed with; its path is the call's action. */
export const CALL_METHOD = 'CALL'

/**
 * Whether a name can be an action: what a proof for a call is bound to, and
 * the challenge's own `action`, so an answer given for one form never passes
 * for another. The challenge provider allows up to 32 letters, digits, `_`
 * and `-`.
 */
export function isActionName(name: unknown): name is string {
  return typeof name === 'string' && /^[\w-]{1,32}$/.test(name)
}

/**
 * The challenge provider's documented test site keys: they render a widget
 * that always passes, always fails or always asks for an interaction, and
 * the answers they give pass only the matching test secret keys. A widget on
 * one is test mode, never protection.
 */
export const TEST_CHALLENGE_SITE_KEYS: readonly string[] = [
  '1x00000000000000000000AA',
  '2x00000000000000000000AB',
  '1x00000000000000000000BB',
  '2x00000000000000000000BB',
  '3x00000000000000000000FF',
]

/** The provider's documented test secret keys: always pass, always fail, and "already spent". */
export const TEST_CHALLENGE_SECRET_KEYS: readonly string[] = [
  '1x0000000000000000000000000000000AA',
  '2x0000000000000000000000000000000AA',
  '3x0000000000000000000000000000000AA',
]

/** What the deployment reads to decide how it checks people, from its env. */
export interface ProtectionEnv {
  /** `PROTECTION_PROOF_SECRET`: the protected routes and `verifyHuman` take a proof the app's server signed with it. */
  proofSecret?: string
  /** `PROTECTION_CHALLENGE_SECRET_KEY`: they take a challenge answer the deployment verifies with the provider. */
  challengeSecretKey?: string
}

/** A deployment env name, where the Convex runtime puts them; `undefined` without `process.env`. */
const deploymentEnv = (name: string): string | undefined => (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name]

/** The deployment's bot protection, as its env sets it; an empty value is unset. */
export function protectionEnv(read: (name: string) => string | undefined = deploymentEnv): ProtectionEnv {
  const proofSecret = read('PROTECTION_PROOF_SECRET') || undefined
  const challengeSecretKey = read('PROTECTION_CHALLENGE_SECRET_KEY') || undefined
  return { ...(proofSecret ? { proofSecret } : {}), ...(challengeSecretKey ? { challengeSecretKey } : {}) }
}

/**
 * Who a proof is for: the host of the deployment's site URL, which the app's
 * server forwards to (`convex.siteUrl`) and the deployment reads as its own
 * `CONVEX_SITE_URL`. A proof signed for one deployment never passes on
 * another, whatever secret they share: a dev server, which signs one for
 * every request, mints nothing production takes. Empty when there is none.
 */
export function proofAudience(siteUrl: string | null | undefined): string {
  if (!siteUrl) return ''
  try {
    return new URL(siteUrl).host.toLowerCase()
  }
  catch {
    return ''
  }
}

/** The deployment's own audience, from `CONVEX_SITE_URL`, which the Convex runtime sets. */
export function deploymentAudience(read: (name: string) => string | undefined = deploymentEnv): string {
  return proofAudience(read('CONVEX_SITE_URL'))
}

/**
 * What a proof is about, beside its route: the address a protected auth
 * request names (its body's `email`), or the subject a call names. Read
 * without case or edge spaces, so the app's server and the deployment
 * agree; empty when there is none.
 */
export function proofSubject(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

/** The subject of a protected auth request: its JSON body's `email`. */
export function requestSubject(body: unknown): string {
  return proofSubject(typeof body === 'object' && body !== null ? (body as { email?: unknown }).email : undefined)
}

/** Whether a request path is one of {@link PROTECTED_AUTH_ROUTES} under the auth base path. */
export function isProtectedAuthPath(pathname: string, basePath: string): boolean {
  const base = basePath.replace(/\/+$/, '')
  return PROTECTED_AUTH_ROUTES.some(route => pathname === `${base}${route}`)
}

/**
 * What a proof is bound to: the request's method and path, or a call's
 * `CALL` and its action; the deployment it is for; and what it is about.
 */
export interface ProofTarget {
  method: string
  path: string
  /** The deployment's {@link proofAudience}: the host of its site URL. */
  audience: string
  /** The {@link proofSubject}: a request's address, or a call's subject. Defaults to none. */
  subject?: string
  /** The clock, in milliseconds. Defaults to now. */
  now?: number
}

/** Why a proof was refused, or that it passed. */
export type ProofCheck = { ok: true } | { ok: false, reason: 'missing' | 'malformed' | 'expired' | 'early' | 'mismatch' }

/**
 * The bytes a proof signs: a domain tag, then the method, the path, the
 * audience, the subject and the time it was signed, as a JSON array, so no
 * field's text can pass for another's.
 */
function proofMessage({ method, path, audience, subject = '' }: ProofTarget, stamp: number): Uint8Array {
  return new TextEncoder().encode(`backend-proof:v1\n${JSON.stringify([method.toUpperCase(), path, audience, subject, stamp])}`)
}

function proofKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage])
}

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = ''
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '='))
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

/**
 * The keys a `PROTECTION_PROOF_SECRET` value holds: one, or a
 * comma-separated list while it rotates (`new,old`), as the webhook
 * secrets take theirs. A proof is signed with the first, and passes under
 * any of them.
 */
export function proofKeys(secret: string): string[] {
  return secret.split(',').map(key => key.trim()).filter(Boolean)
}

/**
 * A proof's shape: `v1.<milliseconds>.<HMAC-SHA-256, base64url>`, and a
 * visitor's id after a fourth dot when the proof is bound to a browser
 * rather than to a subject the call names (see {@link VISITOR_METHOD}).
 */
const PROOF_FORMAT = /^v1\.(\d{1,15})\.([\w-]{43})(?:\.([\w-]{22}))?$/

/** Whether a token is shaped like a proof (rather than a challenge answer). Says nothing of its signature. */
export function isProofFormat(token: string): boolean {
  return PROOF_FORMAT.test(token)
}

// --- The visitor -------------------------------------------------------------
// A browser that asks for a proof for a call naming no subject gets an
// HttpOnly cookie naming it (a random id with a MAC under the proof secret),
// and the proof is bound to that id: `verifyHuman` hands the visitor to
// `jobs.enqueue` (guest jobs, counted per visitor), and the account that
// signs up in that browser claims the visitor's jobs, read from the same
// cookie on the auth routes. Only the app's server mints one, and only the
// signed cookie, never the id alone, claims anything.

/** The visitor cookie's name; `__Host-` over HTTPS, so only this origin's own server sets it. */
export const VISITOR_COOKIE = 'backend.visitor'
export const SECURE_VISITOR_COOKIE = `__Host-${VISITOR_COOKIE}`

/** How long the visitor cookie lasts: a year, so a browser's free try stays used. */
export const VISITOR_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60

/** A new visitor's id: 128 random bits, base64url. */
export function newVisitorId(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(16)).buffer as ArrayBuffer)
}

/**
 * The method a visitor's proof is signed with: its path is the call's
 * action and its subject the visitor's id. A method of its own, so no proof
 * for a subject a call names (`CALL`) ever passes for a visitor.
 */
export const VISITOR_METHOD = 'VISITOR'

/** The visitor a proof is bound to, or `undefined` for a proof bound to a subject (or none). Says nothing of its signature. */
export function proofVisitor(proof: string): string | undefined {
  return PROOF_FORMAT.exec(proof)?.[3]
}

/** A proof bound to a visitor, as the browser passes it on: the proof, a dot, the visitor's id. */
export function withVisitor(proof: string, visitorId: string): string {
  return `${proof}.${visitorId}`
}

/** The bytes a visitor cookie's MAC covers: its own domain tag, the deployment, the id. */
function visitorMessage(visitorId: string, audience: string): Uint8Array {
  return new TextEncoder().encode(`backend-visitor:v1\n${JSON.stringify([audience, visitorId])}`)
}

/** The visitor cookie's value: `<id>.<HMAC-SHA-256, base64url>`, under the proof secret's first key, for one deployment. */
export async function signVisitor(secret: string, visitorId: string, audience: string): Promise<string> {
  const [key] = proofKeys(secret)
  if (!key) throw new TypeError('[nuxt-backend] signVisitor: no secret to sign with.')
  const signature = await crypto.subtle.sign('HMAC', await proofKey(key, 'sign'), visitorMessage(visitorId, audience) as BufferSource)
  return `${visitorId}.${toBase64Url(signature)}`
}

/**
 * The visitor a cookie's value names, when its MAC holds under any key of
 * `secret` for this deployment; `null` for a value that is missing,
 * malformed or signed for another deployment.
 */
export async function readVisitor(secret: string, value: string | null | undefined, audience: string): Promise<string | null> {
  const match = /^([\w-]{22})\.([\w-]{43})$/.exec(value ?? '')
  if (!match) return null
  const signature = fromBase64Url(match[2]!) as BufferSource
  const message = visitorMessage(match[1]!, audience) as BufferSource
  for (const key of proofKeys(secret)) {
    if (await crypto.subtle.verify('HMAC', await proofKey(key, 'verify'), signature, message)) return match[1]!
  }
  return null
}

/** A cookie's value in a `Cookie` header, by name; `undefined` when the header names none. */
export function cookieValue(header: string | null | undefined, name: string): string | undefined {
  for (const pair of (header ?? '').split(';')) {
    const at = pair.indexOf('=')
    if (at !== -1 && pair.slice(0, at).trim() === name) return pair.slice(at + 1).trim()
  }
  return undefined
}

/**
 * The visitor cookie a `Cookie` header carries: the `__Host-` one, or,
 * for a request that came over plain HTTP (`secure: false`), where the
 * proof route sets it without the prefix, the unprefixed one. Over HTTPS the
 * unprefixed name is never read: a sibling subdomain or a plain-HTTP
 * response could have planted it in the browser.
 */
export function visitorCookieOf(header: string | null | undefined, { secure }: { secure: boolean }): string | undefined {
  return cookieValue(header, SECURE_VISITOR_COOKIE) ?? (secure ? undefined : cookieValue(header, VISITOR_COOKIE))
}

/**
 * Sign a proof that a bot check passed for one request (its method, path
 * and address) or one call (`CALL`, its action and subject), on one
 * deployment, now: `v1.<ms>.<signature>`, an HMAC-SHA-256 under the secret
 * the app's server and the deployment share (its first key, during a
 * rotation). It is accepted for {@link PROOF_TTL_MS}, for that target only.
 */
export async function signProof(secret: string, target: ProofTarget): Promise<string> {
  const [key] = proofKeys(secret)
  if (!key) throw new TypeError('[nuxt-backend] signProof: no secret to sign with.')
  const stamp = Math.floor(target.now ?? Date.now())
  const signature = await crypto.subtle.sign('HMAC', await proofKey(key, 'sign'), proofMessage(target, stamp) as BufferSource)
  return `v1.${stamp}.${toBase64Url(signature)}`
}

/**
 * Check a proof against its target: signed under `secret` (any of its keys,
 * during a rotation) for this method, path, audience and subject, no older
 * than {@link PROOF_TTL_MS} and not from the future beyond a few seconds of
 * clock skew. The signature is compared by Web Crypto's own verify, in
 * constant time.
 */
export async function verifyProof(secret: string, proof: string | null | undefined, target: ProofTarget): Promise<ProofCheck> {
  const now = target.now ?? Date.now()
  if (!proof) return { ok: false, reason: 'missing' }
  const match = PROOF_FORMAT.exec(proof)
  if (!match) return { ok: false, reason: 'malformed' }
  const stamp = Number(match[1])
  if (now - stamp > PROOF_TTL_MS) return { ok: false, reason: 'expired' }
  if (stamp - now > PROOF_CLOCK_SKEW_MS) return { ok: false, reason: 'early' }
  const signature = fromBase64Url(match[2]!) as BufferSource
  const message = proofMessage(target, stamp) as BufferSource
  for (const key of proofKeys(secret)) {
    if (await crypto.subtle.verify('HMAC', await proofKey(key, 'verify'), signature, message)) return { ok: true }
  }
  return { ok: false, reason: 'mismatch' }
}
