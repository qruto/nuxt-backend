import { DEFAULT_AUTH_ROUTE } from '../convex/constants'
import { PROOF_HEADER, proofAudience, proofKeys, PROTECTED_AUTH_ROUTES, signProof, TEST_CHALLENGE_SECRET_KEYS, TEST_CHALLENGE_SITE_KEYS } from '../convex/proof'
import { deploymentEnvId, finding, type PreflightFinding } from '../findings'
import { protectionTakes } from '../capabilities/detect'

// doctor's bot protection half: what the deployment checks, whether the app
// side agrees (the proof secret both hold, the challenge's two keys), and on
// production whether anything checks at all. The secret's value never
// leaves this machine: the probe sends a proof signed with it, and the
// deployment's answer says whether the two match.

/** What the protection checks read. */
export interface ProtectionDoctorInput {
  /** The env visible here: the app's own, outside production; the process env under `--prod`. */
  env: Readonly<Record<string, string | undefined>>
  /** Under `--prod`: `.env.local`'s values, development's, which production's must not share. */
  devEnv?: Readonly<Record<string, string | undefined>>
  /** The deployment's env names; `null` when they could not be read. */
  deployed: readonly string[] | null
  /** Production posture: the env here is not production's app env. */
  prod: boolean
  /** The deployment is local, where bot checks run in test mode. */
  local: boolean
  /** The project is linked to Vercel (`.vercel/project.json`) or doctor runs there, where BotID signs proofs. */
  vercel?: boolean
  /** The deployment's site origin, where the proof probe goes; none skips it. */
  siteUrl?: string
  /** The app has `backend/waitlist.ts`: its join passes the bot check. */
  waitlist?: boolean
  /** The app's `backend/email.ts` re-exports `submitContactMessage`: its contact form passes the bot check. */
  contact?: boolean
}

/** How the deployment answered a proof signed with the secret here. */
export type ProofProbe = 'accepted' | 'refused' | 'unreachable'

/**
 * Ask the deployment whether it takes a proof signed with `secret`: an
 * empty code request (it sends nothing, and spends no limit), signed for its
 * method and path, no address, and the deployment at `siteUrl`. A proof
 * that does not pass is refused before anything else (`forbidden`, reason
 * `bot_check`); any other answer means it passed.
 */
export async function probeProof(siteUrl: string, secret: string, basePath = DEFAULT_AUTH_ROUTE): Promise<ProofProbe> {
  const path = `${basePath.replace(/\/+$/, '')}${PROTECTED_AUTH_ROUTES[0]}`
  try {
    // fallow-ignore-next-line security-sink -- the doctor probes the project's own deployment origin (its env file) with an empty body; verified 2026-10-19
    const response = await fetch(`${siteUrl.replace(/\/+$/, '')}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [PROOF_HEADER]: await signProof(secret, { method: 'POST', path, audience: proofAudience(siteUrl) }) },
      body: '{}',
      signal: AbortSignal.timeout(5000),
    })
    if (response.status === 404) return 'unreachable'
    const body = await response.json().catch(() => null) as { reason?: unknown } | null
    return response.status === 403 && body?.reason === 'bot_check' ? 'refused' : 'accepted'
  }
  catch {
    return 'unreachable'
  }
}

/**
 * How to put a value the app holds on the deployment: from `.env.local` with
 * `env push`, or, on production, which shares nothing with development, by
 * setting it there directly.
 */
const pushHint = (name: string, prod: boolean) => prod
  ? `Set production's own value on the deployment: \`npx convex env set --prod ${name}\` (it asks for the value).`
  : `Add ${name} to .env.local and run \`npx nuxt-backend env push\`.`

/** Production's own proof secret, on both of its sides, never development's. */
const PROD_SECRET_HINT = 'Generate production\'s own with `openssl rand -base64 32`, then set it on the deployment (`npx convex env set --prod PROTECTION_PROOF_SECRET`, which asks for it) and in the app host\'s production env (`vercel env add PROTECTION_PROOF_SECRET production`).'

/** Whether a name is set on the deployment, as its listing reads. */
const onDeployment = (input: ProtectionDoctorInput, name: string) => input.deployed?.includes(name) === true

/** The two names' presence on the deployment, and a value here never pushed. */
function presenceFindings(input: ProtectionDoctorInput): PreflightFinding[] {
  if (!input.deployed) return []
  return (['PROTECTION_PROOF_SECRET', 'PROTECTION_CHALLENGE_SECRET_KEY'] as const).map((name) => {
    const id = deploymentEnvId(name)
    if (onDeployment(input, name)) return finding(id, 'pass', `${name} is set on the deployment.`)
    if (!input.prod && input.env[name]) return finding(id, 'warn', `${name} is set here but not on the deployment, which checks none of what it signs or answers.`, pushHint(name, false))
    return finding(id, 'pass', `${name} is not set: the deployment takes no ${name === 'PROTECTION_PROOF_SECRET' ? 'proof' : 'challenge answer'}.`)
  })
}

/** Whether anything checks for bots, and how. */
function liveFinding(input: ProtectionDoctorInput): PreflightFinding {
  const proof = onDeployment(input, 'PROTECTION_PROOF_SECRET')
  const challenge = onDeployment(input, 'PROTECTION_CHALLENGE_SECRET_KEY')
  if (input.prod && !input.deployed) return finding('bot-protection', 'warn', 'Production\'s env names could not be read, so whether a bot check is live is unknown.', 'Check access to the production deployment, then run `npx nuxt-backend doctor --prod` again.')
  const takes = protectionTakes(proof, challenge)
  // Off Vercel no bot check runs on the app's server, which then signs no proof.
  if (input.prod && proof && !challenge && !input.vercel) {
    return finding('bot-protection', 'warn', 'Production takes proofs only, which the app\'s server signs after BotID passes, and nothing here says the app runs on Vercel: off Vercel no proof is signed, and every sign-in code request is refused.', 'On Vercel, link the project here (`vercel link`) and run doctor again. Elsewhere, set the challenge keys (NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY for the app, PROTECTION_CHALLENGE_SECRET_KEY on the deployment), or remove PROTECTION_PROOF_SECRET from the deployment.')
  }
  if (takes) return finding('bot-protection', 'pass', `The sign-in code requests take ${takes}.`)
  if (input.prod) {
    return finding('bot-protection', 'warn', 'No bot protection is live on production: a script can request sign-in codes and create accounts as fast as the rate limits allow.', 'On Vercel: set production\'s own PROTECTION_PROOF_SECRET in the app\'s env and on the deployment. Elsewhere: set NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY for the app and PROTECTION_CHALLENGE_SECRET_KEY on the deployment.')
  }
  return finding('bot-protection', 'pass', input.local
    ? 'Test mode: on this machine the bot check answers human, as BotID does in development.'
    : 'No bot check on this development deployment; production needs one (doctor --prod says so).')
}

/** The proof secret when only one side holds it: the deployment ignores proofs, or wants ones nobody signs. */
function oneSidedProofFinding(input: ProtectionDoctorInput, here: string | undefined): PreflightFinding[] {
  if (here) {
    if (!input.deployed) return []
    return [finding('protection-proof', 'warn', 'The app\'s server signs proofs the deployment ignores: it has no PROTECTION_PROOF_SECRET, so anyone who calls its own URL skips the bot check.', pushHint('PROTECTION_PROOF_SECRET', input.prod))]
  }
  if (input.prod) {
    return [finding('protection-proof', 'warn', 'Production takes proofs, and the app\'s server env is not visible here: doctor cannot check that the two hold the same PROTECTION_PROOF_SECRET.', 'Run `npx nuxt-backend doctor --prod` with production\'s PROTECTION_PROOF_SECRET in the env (`vercel env pull`), or compare the two by hand.')]
  }
  const challenge = onDeployment(input, 'PROTECTION_CHALLENGE_SECRET_KEY')
  return [finding(
    'protection-proof',
    challenge ? 'warn' : 'fail',
    `The deployment takes proofs, and the dev server has no PROTECTION_PROOF_SECRET to sign them: every sign-in code request${challenge ? ' without a challenge answer' : ''} is refused.`,
    'Set the same PROTECTION_PROOF_SECRET in .env.local, or remove it from the deployment.',
  )]
}

/** Whether production's secret shares a key with development's `.env.local`, whose dev server signs a proof for anyone. */
function sharesDevSecret(input: ProtectionDoctorInput, here: string): boolean {
  const dev = input.prod ? input.devEnv?.PROTECTION_PROOF_SECRET : undefined
  if (!dev) return false
  const devKeys = new Set(proofKeys(dev))
  return proofKeys(here).some(key => devKeys.has(key))
}

/** The deployment's answer to a proof signed with the secret here. */
async function probedProofFinding(input: ProtectionDoctorInput, secret: string): Promise<PreflightFinding[]> {
  if (!input.siteUrl) return []
  const probe = await probeProof(input.siteUrl, secret)
  if (probe === 'accepted') {
    return [sharesDevSecret(input, secret)
      ? finding('protection-proof', 'warn', 'Production holds the same PROTECTION_PROOF_SECRET as .env.local: a proof names its deployment, but a leaked .env.local now leaks production\'s secret.', PROD_SECRET_HINT)
      : finding('protection-proof', 'pass', 'The deployment takes the proofs signed with the PROTECTION_PROOF_SECRET here.')]
  }
  if (probe === 'refused') {
    return [finding('protection-proof', 'fail', `The deployment refuses the proofs signed with the PROTECTION_PROOF_SECRET here: the two secrets differ, or the deployment's own CONVEX_SITE_URL is not ${input.siteUrl}, the site the app forwards to and a proof names. Every sign-in code request is refused.`, input.prod
      ? PROD_SECRET_HINT
      : 'Set one value on both sides: in .env.local and with `npx nuxt-backend env push --force PROTECTION_PROOF_SECRET`. With a custom domain, make it the deployment\'s own site URL in the Convex dashboard.')]
  }
  return [finding('protection-proof', 'warn', 'The deployment\'s auth routes did not answer the proof probe (offline, not running, or a custom auth base path).', 'Run `npx convex dev` (or deploy), then re-run doctor.')]
}

/** The proof secret both sides hold: present on each, of a useful length, and the same. */
async function proofFinding(input: ProtectionDoctorInput): Promise<PreflightFinding[]> {
  const here = input.env.PROTECTION_PROOF_SECRET
  const there = onDeployment(input, 'PROTECTION_PROOF_SECRET')
  if (!here && !there) return []
  if (here && proofKeys(here).some(key => key.length < 32)) {
    return [finding('protection-proof', 'warn', 'PROTECTION_PROOF_SECRET is shorter than 32 characters.', 'Generate one with `openssl rand -base64 32`, and set it on both sides.')]
  }
  return here && there ? probedProofFinding(input, here) : oneSidedProofFinding(input, here)
}

/** Whether production runs the challenge on the provider's test keys, as far as the env here shows. */
function onTestKeys(input: ProtectionDoctorInput): boolean {
  return TEST_CHALLENGE_SITE_KEYS.includes(input.env.NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY ?? '') || TEST_CHALLENGE_SECRET_KEYS.includes(input.env.PROTECTION_CHALLENGE_SECRET_KEY ?? '')
}

/** The challenge with one key only: shown and never verified, or wanted and never shown. */
function oneKeyFinding(input: ProtectionDoctorInput, siteKey: string | undefined): PreflightFinding[] {
  if (siteKey) {
    if (!input.deployed) return []
    return [finding('protection-challenge-keys', 'warn', 'The app shows a challenge, and the deployment verifies none of its answers: PROTECTION_CHALLENGE_SECRET_KEY is not set there.', pushHint('PROTECTION_CHALLENGE_SECRET_KEY', input.prod))]
  }
  if (input.prod) {
    return [finding('protection-challenge-keys', 'warn', 'Production verifies challenge answers, and the app\'s env is not visible here: doctor cannot check that it shows a widget, or that its keys are not the provider\'s test keys.', 'Run `npx nuxt-backend doctor --prod` with NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY in the env (`vercel env pull`), or check the app host\'s env by hand.')]
  }
  const proof = onDeployment(input, 'PROTECTION_PROOF_SECRET')
  return [finding(
    'protection-challenge-keys',
    proof ? 'warn' : 'fail',
    `The deployment asks for a challenge answer, and the app shows no challenge (NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY is not set): every sign-in code request${proof ? ' without a proof' : ''} is refused.`,
    'Set NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY to the widget\'s site key, or remove PROTECTION_CHALLENGE_SECRET_KEY from the deployment.',
  )]
}

/** The challenge's two keys: both or neither, and no test key on production. */
function challengeFinding(input: ProtectionDoctorInput): PreflightFinding[] {
  const siteKey = input.env.NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY
  const there = onDeployment(input, 'PROTECTION_CHALLENGE_SECRET_KEY')
  if (!siteKey && !there) return []
  if (input.prod && onTestKeys(input)) {
    return [finding('protection-challenge-keys', 'fail', 'Production runs the challenge on the provider\'s test keys, which answer the same for everyone.', 'Create a widget in the provider\'s dashboard and set its site key and secret key.')]
  }
  if (!siteKey || !there) return oneKeyFinding(input, siteKey)
  return [finding('protection-challenge-keys', 'pass', TEST_CHALLENGE_SITE_KEYS.includes(siteKey)
    ? 'The challenge runs on the provider\'s test site key: test mode.'
    : 'The app shows a challenge, and the deployment verifies its answers.')]
}

/**
 * A waitlist's join passes `verifyHuman`, which lets everyone in while the
 * deployment holds neither secret. Production only: development answers
 * human, and says so.
 */
function waitlistFinding(input: ProtectionDoctorInput): PreflightFinding[] {
  if (!input.waitlist || !input.prod) return []
  if (!input.deployed) return [finding('waitlist-bot-check', 'warn', 'The app has a waitlist, and production\'s env names could not be read, so whether its join is checked for bots is unknown.', 'Check access to the production deployment, then run `npx nuxt-backend doctor --prod\' again.')]
  if (onDeployment(input, 'PROTECTION_PROOF_SECRET') || onDeployment(input, 'PROTECTION_CHALLENGE_SECRET_KEY')) {
    return [finding('waitlist-bot-check', 'pass', 'The waitlist\'s join is checked for bots: the deployment verifies a proof or a challenge answer.')]
  }
  return [finding('waitlist-bot-check', 'warn', 'The app has a waitlist and nothing checks who joins: a script can fill it with addresses as fast as the rate limits allow, and each address costs a sign-in code.', 'On Vercel: set production\'s own PROTECTION_PROOF_SECRET in the app\'s env and on the deployment. Elsewhere: set NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY for the app and PROTECTION_CHALLENGE_SECRET_KEY on the deployment.')]
}

/**
 * A contact form is refused on production while the deployment verifies
 * neither a proof nor a challenge answer, so nobody can write to the team.
 * Production only.
 */
function contactFinding(input: ProtectionDoctorInput): PreflightFinding[] {
  if (!input.contact || !input.prod) return []
  if (!input.deployed) return [finding('contact-bot-check', 'warn', 'The app has a contact form, and production\'s env names could not be read, so whether it is open is unknown.', 'Check access to the production deployment, then run `npx nuxt-backend doctor --prod\' again.')]
  if (onDeployment(input, 'PROTECTION_PROOF_SECRET') || onDeployment(input, 'PROTECTION_CHALLENGE_SECRET_KEY')) {
    return [finding('contact-bot-check', 'pass', 'The contact form is checked for bots: the deployment verifies a proof or a challenge answer.')]
  }
  return [finding('contact-bot-check', 'warn', 'The app has a contact form and production checks no one, so the form is refused: a message never reaches the team.', 'On Vercel: set production\'s own PROTECTION_PROOF_SECRET in the app\'s env and on the deployment. Elsewhere: set NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY for the app and PROTECTION_CHALLENGE_SECRET_KEY on the deployment.')]
}

/** Every bot protection finding, in report order. */
export async function protectionFindings(input: ProtectionDoctorInput): Promise<PreflightFinding[]> {
  return [
    liveFinding(input),
    ...await proofFinding(input),
    ...challengeFinding(input),
    ...waitlistFinding(input),
    ...contactFinding(input),
    ...presenceFindings(input),
  ]
}
