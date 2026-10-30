import { defineEventHandler, getCookie, getRequestProtocol, getRequestURL, readBody, setCookie, useRuntimeConfig, type RequestEvent } from 'nuxt/server'
import { backendError, refusalResponse } from '../../../convex/errors.js'
import { CALL_METHOD, HUMAN_PROOF_ROUTE, isActionName, isProtectedAuthPath, newVisitorId, PROOF_HEADER, proofAudience, proofSubject, readVisitor, requestSubject, SECURE_VISITOR_COOKIE, signProof, signVisitor, VISITOR_COOKIE, VISITOR_COOKIE_MAX_AGE_SECONDS, VISITOR_METHOD, withVisitor } from '../../../convex/proof.js'
import { readSiteUrl } from '../site-url'

// The app's server's half of bot protection: its own bot check, the secret
// it signs proofs with, the deployment a proof is for, the request header a
// proof travels in to the deployment, and the proof route for the calls that
// skip this server.

/** What the bot check said: a person, a bot, nothing (no check runs here), or that it failed to run. */
export type BotVerdict = 'human' | 'bot' | 'unchecked' | 'unavailable'

/** Said once per server: a proof secret here, no check to sign after, and no challenge beside it. */
let unsignedWarned = false

/** Said once per server: a build on Vercel without `botid` installed, so no bot check runs here. */
let absentWarned = false

/** Whether the build wired BotID: on Vercel, with `botid` installed. Unset (an older build) counts as wired. */
function botIdWired(): boolean {
  return (useRuntimeConfig().public.backend as { botDetection?: boolean } | undefined)?.botDetection !== false
}

/** Whether the app shows the challenge, which off Vercel does the work a proof cannot. */
function hasChallenge(): boolean {
  return Boolean((useRuntimeConfig().public.backend as { challengeSiteKey?: string } | undefined)?.challengeSiteKey)
}

/**
 * The bot check. On Vercel, BotID, with the headers its client added to the
 * request; a verified bot (a crawler, an agent) is a bot here too, since
 * these routes send mail and create accounts. In development it answers
 * human without asking, as BotID itself does there (BotID's own development
 * mode logs a misconfiguration on every request, since its client does not
 * run on a dev server). Anywhere else no check runs: off Vercel, the
 * challenge does the work, on the deployment.
 */
export async function botVerdict(): Promise<BotVerdict> {
  if (import.meta.dev) return 'human'
  if (process.env.VERCEL !== '1') {
    if (proofSecret() && !unsignedWarned && !hasChallenge()) {
      unsignedWarned = true
      console.warn('[nuxt-backend] PROTECTION_PROOF_SECRET is set, but this server is not on Vercel, so no bot check runs here and it signs no proof: a deployment that takes proofs and no challenge answer refuses every sign-in code request. Off Vercel, set the challenge keys (NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY, PROTECTION_CHALLENGE_SECRET_KEY) instead.')
    }
    return 'unchecked'
  }
  // On Vercel, but built without `botid` (an optional peer): no check to
  // run, so no proof to sign, as off Vercel.
  if (!botIdWired()) {
    if (!absentWarned) {
      absentWarned = true
      console.warn('[nuxt-backend] This app runs on Vercel without botid installed, so no bot check runs on its server and it signs no proof. Install botid (npm install botid) and redeploy, or use the challenge keys.')
    }
    return 'unchecked'
  }
  try {
    const { checkBotId } = await import('botid/server')
    return (await checkBotId()).isBot ? 'bot' : 'human'
  }
  catch (cause) {
    console.error('[nuxt-backend] BotID could not check a request, so it was refused:', cause)
    return 'unavailable'
  }
}

/** The secret the app's server signs proofs with, the same `PROTECTION_PROOF_SECRET` the deployment holds. */
export function proofSecret(): string | undefined {
  return process.env.PROTECTION_PROOF_SECRET || undefined
}

/**
 * The deployment a proof from this server is for: the host of the site URL
 * the auth proxy forwards to, which the deployment reads as its own
 * `CONVEX_SITE_URL`.
 */
export function serverAudience(): string {
  return proofAudience(readSiteUrl() ?? process.env.NUXT_PUBLIC_CONVEX_SITE_URL)
}

/**
 * The address a protected auth request names, read from a copy of the
 * request, so the auth proxy still forwards the body it came with.
 */
async function requestAddress(event: RequestEvent): Promise<string> {
  return requestSubject(await event.req.clone().json().catch(() => null) as unknown)
}

/**
 * Write the request's proof header, or take it off with `null`. A caller
 * never chooses its own proof: whatever one sent is dropped first. The
 * change is made on the request itself (`event.req`), the one object the
 * auth proxy forwards: the event, and with it its request, is the same for
 * every handler of one request.
 */
function setProofHeader(event: RequestEvent, proof: string | null): void {
  event.req.headers.delete(PROOF_HEADER)
  if (proof) event.req.headers.set(PROOF_HEADER, proof)
}

/** The refusal for a failed check, as the auth client and `getBackendError` read it. */
export function verdictRefusal(verdict: 'bot' | 'unavailable'): Response {
  return refusalResponse(verdict === 'bot'
    ? backendError('forbidden', { reason: 'bot_check' })
    : backendError('unavailable', { service: 'protection', reason: 'provider_refused' }))
}

/** The longest subject a call may name: an address, an id, a code. */
const MAX_SUBJECT_LENGTH = 320

/** The one field a body got wrong, refused as `invalid_input`. */
const invalid = (field: 'action' | 'subject') => refusalResponse(backendError('invalid_input', { field }))

/**
 * `POST /api/human-proof` with `{ action, subject? }`: the bot check for
 * one call that never passes through the app's server
 * (`useHumanCheck().token`). A person gets `{ proof }`, signed for `CALL`,
 * the action, the subject when one is named and the deployment, which
 * `verifyHuman` takes for a minute; `{ proof: null }` when this server
 * signs none (no `PROTECTION_PROOF_SECRET`, or no check runs here). A bot
 * gets the same refusal the auth routes give it.
 *
 * A call that names no subject is bound to the browser instead: the proof
 * is signed for the visitor its HttpOnly cookie names (set here on the
 * first such call, `__Host-` over HTTPS), and carries the visitor's id, so
 * `verifyHuman` hands it to `jobs.enqueue` for a guest job.
 */
async function proofForCall(event: RequestEvent): Promise<Response | { proof: string | null }> {
  const body = await readBody(event).catch(() => null) as { action?: unknown, subject?: unknown } | null
  const action = body?.action
  if (!isActionName(action)) return invalid('action')
  const subject = body?.subject
  if (subject !== undefined && subject !== null && (typeof subject !== 'string' || subject.length > MAX_SUBJECT_LENGTH)) return invalid('subject')
  const verdict = await botVerdict()
  if (verdict === 'bot' || verdict === 'unavailable') return verdictRefusal(verdict)
  const secret = proofSecret()
  if (verdict !== 'human' || !secret) return { proof: null }
  const audience = serverAudience()
  const named = proofSubject(subject)
  if (named) return { proof: await signProof(secret, { method: CALL_METHOD, path: action, audience, subject: named }) }
  const visitor = await visitorOf(event, secret, audience)
  return { proof: withVisitor(await signProof(secret, { method: VISITOR_METHOD, path: action, audience, subject: visitor }), visitor) }
}

/**
 * The browser's visitor: the one its cookie names when the cookie's MAC
 * holds for this deployment, else a new one, whose cookie this answer sets.
 */
async function visitorOf(event: RequestEvent, secret: string, audience: string): Promise<string> {
  const secure = getRequestProtocol(event, { xForwardedProto: true }) === 'https'
  const name = secure ? SECURE_VISITOR_COOKIE : VISITOR_COOKIE
  const known = await readVisitor(secret, getCookie(event, name), audience)
  if (known) return known
  const visitor = newVisitorId()
  setCookie(event, name, await signVisitor(secret, visitor, audience), { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS })
  return visitor
}

/**
 * The bot check in front of the auth routes that send a code, create an
 * account or try a password, before the auth proxy forwards them to the
 * deployment, and the proof route (`proofForCall`). A bot is refused here
 * (403, `forbidden` with reason `bot_check`). A person's request leaves
 * with a proof signed under `PROTECTION_PROOF_SECRET` for its method, path
 * and address and for the deployment it goes to, which that deployment
 * checks: Better Auth runs on the deployment's own public URL, and a
 * request that skipped this check carries none. Global middleware matched
 * in-handler, like the agent gate.
 */
export default defineEventHandler(async (event) => {
  const { method } = event.req
  if (method !== 'POST') return
  const path = getRequestURL(event).pathname
  if (path === HUMAN_PROOF_ROUTE) return proofForCall(event)
  const authRoute = (useRuntimeConfig().public.backend as { authRoute?: string } | undefined)?.authRoute ?? '/api/auth'
  if (!isProtectedAuthPath(path, authRoute)) return
  setProofHeader(event, null)
  const verdict = await botVerdict()
  if (verdict === 'bot' || verdict === 'unavailable') return verdictRefusal(verdict)
  const secret = proofSecret()
  if (verdict !== 'human' || !secret) return
  const proof = await signProof(secret, { method, path, audience: serverAudience(), subject: await requestAddress(event) })
  setProofHeader(event, proof)
})
