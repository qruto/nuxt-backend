import type { BetterAuthClientPlugin } from 'better-auth/client'
import { CHALLENGE_HEADER, HUMAN_PROOF_ROUTE, isProtectedAuthPath, PROTECTED_AUTH_ROUTES } from '../../../convex/proof.js'

// The browser's half of bot protection: what the app's runtime config says
// this browser does, the auth client plugin that answers the challenge on
// the protected auth routes, and the token `useHumanCheck` hands a call.
// The challenge widget itself loads on first use (./challenge.ts).

/** How this browser proves it is a person: a challenge, BotID's invisible check alone, or neither (`off`). */
export type HumanCheckMode = 'detection' | 'challenge' | 'off'

/** What the protection plugin reads from the public runtime config. */
export interface ProtectionClientConfig {
  /** The auth proxy route (`backend.authRoute`). */
  authRoute: string
  /** BotID checks requests in this browser: the app is built and served on Vercel (`backend.botDetection`). */
  botDetection: boolean
  /** The challenge's public site key (`backend.challengeSiteKey`, `NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY`), or empty. */
  challengeSiteKey: string
  /** The caption over a challenge that asks for a click, in the reader's language. */
  caption: () => Promise<string>
}

let config: ProtectionClientConfig | null = null

/** Set by the protection plugin at start; `null` again in tests. */
export function configureProtection(next: ProtectionClientConfig | null): void {
  config = next
}

/**
 * How a browser of this app proves it is a person: the challenge widget
 * wherever the app has a site key (`challenge`; on Vercel BotID checks the
 * same requests too, and a deployment that takes either passes either),
 * BotID's invisible check alone on Vercel (`detection`), or `off`. A site
 * key is the app's choice, so it wins: a deployment that verifies challenge
 * answers only gets one, on Vercel too.
 */
export function modeOf(settings: Partial<Pick<ProtectionClientConfig, 'botDetection' | 'challengeSiteKey'>> | null | undefined): HumanCheckMode {
  if (settings?.challengeSiteKey) return 'challenge'
  return settings?.botDetection === true ? 'detection' : 'off'
}

/** How this browser proves it is a person, as the protection plugin configured it. */
function humanCheckMode(): HumanCheckMode {
  return modeOf(config)
}

/** The requests BotID's client checks: every protected auth route, and the proof route. */
export function protectedRequests(authRoute: string): Array<{ path: string, method: string }> {
  const base = authRoute.replace(/\/+$/, '')
  return [...PROTECTED_AUTH_ROUTES.map(route => ({ path: `${base}${route}`, method: 'POST' })), { path: HUMAN_PROOF_ROUTE, method: 'POST' }]
}

/** Answer the challenge, loading the widget on first use. */
async function answer(siteKey: string, action?: string): Promise<string> {
  const { challengeAnswer } = await import('./challenge')
  return challengeAnswer(siteKey, { action, caption: await config?.caption().catch(() => '') ?? '' })
}

/**
 * The auth client plugin: with a challenge, every request to a protected
 * auth route carries its answer, so `useLoginFlow`
 * and an app's own call to `client.emailOtp.sendVerificationOtp` all pass
 * the deployment's check alike. A challenge that fails sends the request
 * without one: the deployment refuses it, and says why (`bot_check`). An
 * answer the caller set itself is left as it is.
 */
export function protectionClient() {
  return {
    id: 'backend-protection' as const,
    fetchPlugins: [{
      id: 'backend-protection',
      name: 'Bot protection',
      hooks: {
        async onRequest(context) {
          if (humanCheckMode() !== 'challenge' || context.headers.has(CHALLENGE_HEADER)) return
          const url = new URL(String(context.url), globalThis.location?.href ?? 'http://localhost')
          if (!isProtectedAuthPath(url.pathname, config!.authRoute)) return
          try {
            context.headers.set(CHALLENGE_HEADER, await answer(config!.challengeSiteKey))
          }
          catch {
            // Sent without an answer: the deployment's refusal is the one the person reads.
          }
          return context
        },
      },
    }],
  } satisfies BetterAuthClientPlugin
}

/** A refusal the proof route answered, as `getBackendError` reads it. */
function routeRefusal(status: number, body: unknown): Error {
  const fields = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {}
  return Object.assign(new Error(typeof fields.message === 'string' ? fields.message : 'The bot check failed.'), { cause: { error: { ...fields, status } } })
}

/** A proof from the app's server for one call (`null` when it signs none), or its refusal. */
async function serverProof(action: string, subject: string | undefined): Promise<string | null> {
  // fallow-ignore-next-line security-sink -- a constant path on the page's own origin (the app's proof route); nothing a caller sends picks the destination; verified 2026-10-19
  const response = await fetch(HUMAN_PROOF_ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(subject === undefined ? { action } : { action, subject }),
  })
  const body = await response.json().catch(() => null) as { proof?: unknown } | null
  if (!response.ok) throw routeRefusal(response.status, body)
  return typeof body?.proof === 'string' ? body.proof : null
}

/**
 * A token for one call that `verifyHuman(ctx, token, { action, subject })`
 * checks on the deployment. On Vercel, or without a site key, a proof the
 * app's server signs once its own bot check passed, for `action` and
 * `subject` (BotID on Vercel; the dev server answers human): a proof passes
 * in a query or mutation too. Otherwise, or when the server signs none and
 * the app has a site key, a challenge answer given for `action`.
 * `null` when neither is to be had: the deployment then checks nobody, or
 * refuses. Rejects with the refusal when the check fails.
 */
export async function humanToken(action: string, subject?: string): Promise<string | null> {
  const challenge = humanCheckMode() === 'challenge'
  // With a site key off Vercel the server runs no check to sign after: straight to the challenge.
  if (!challenge || config!.botDetection) {
    const proof = await serverProof(action, subject)
    if (proof || !challenge) return proof
  }
  try {
    return await answer(config!.challengeSiteKey, action)
  }
  catch {
    throw routeRefusal(403, { code: 'forbidden', reason: 'bot_check' })
  }
}
