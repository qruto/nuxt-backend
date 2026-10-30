import { runConvex } from '../convex-cli'
import type { EmailPosture, EmailProviderReadout } from '../convex/email-posture'
import { isLoopbackUrl } from '../convex/loopback'
import type { BackendEnvironment } from '../convex/environment'
import { deploymentBackendEnvironment, deploymentSiteOrigin } from '../env-push'
import { finding, type FindingGroup, type PreflightFinding } from '../findings'

// doctor --prod's posture half: what production's env names alone cannot
// say. Two values read off the deployment, none of them secret:
// BACKEND_ENVIRONMENT (the kind of deployment, which decides every provider's
// mode) and SITE_URL's origin; and the facts the deployment derives from its own email env with
// its own key (`posture:email`), so no key and no address leaves it. A
// setting left at its unset default fails; the same setting chosen on
// purpose (a deliberate `sandbox`) only warns.

/** A value read off production: `unset` when it does not list the name, `unread` when the read failed. */
type Read<T> = T | 'unset' | 'unread'

/** What `doctor --prod` reads off production beyond its env names. */
export interface ProductionPosture {
  /** `BACKEND_ENVIRONMENT`, as the backend tells it apart. */
  environment: Read<BackendEnvironment>
  /** `SITE_URL`'s origin: the site the live probes check. */
  siteOrigin: Read<{ origin: string } | 'malformed'>
  /** The deployment's own email facts (`posture:email`). */
  email: Read<EmailPosture>
}

/** Whether a value is a provider readout `posture:email` reports. */
function isReadout(value: unknown): value is EmailProviderReadout {
  return typeof value === 'object' && value !== null && ['full', 'sending', 'refused', 'unreachable'].includes((value as { access?: unknown }).access as string)
}

/** Whether the Convex CLI's output is the posture `posture:email` reports. */
export function isEmailPosture(value: unknown): value is EmailPosture {
  if (typeof value !== 'object' || value === null) return false
  const { sender, provider } = value as Record<string, unknown>
  const senderOk = sender === 'unset' || sender === 'malformed' || (typeof sender === 'object' && sender !== null && typeof (sender as { domain?: unknown }).domain === 'string')
  return senderOk && (provider === null || isReadout(provider))
}

/**
 * How long the Convex CLI may take to run `posture:email`: the action's
 * provider reads wait up to 5 seconds each (`PROVIDER_TIMEOUT_MS`), six
 * at most, so a slow provider still answers inside it.
 */
const EMAIL_POSTURE_TIMEOUT_MS = 60_000

/** Production's email posture, from its own action; `unread` when the CLI could not run it, or it answered something else. */
async function readEmailPosture(rootDir: string): Promise<Read<EmailPosture>> {
  try {
    const { stdout } = await runConvex(rootDir, ['run', '--prod', '--component', 'backend', 'posture:email'], { timeout: EMAIL_POSTURE_TIMEOUT_MS })
    const parsed: unknown = JSON.parse(stdout)
    return isEmailPosture(parsed) ? parsed : 'unread'
  }
  catch {
    return 'unread'
  }
}

/** A value read only when production lists its name, and only when a wanted check needs it. */
async function readListed<T>(names: readonly string[], name: string, wanted: boolean, read: () => Promise<T | null>): Promise<Read<T>> {
  if (!wanted || !names.includes(name)) return 'unset'
  return (await read()) ?? 'unread'
}

/**
 * Read production's posture, side by side: each read happens only when a
 * wanted check needs it (a skipped one reads as `unset`, and nothing
 * reports on it). `names` are production's env names.
 */
export async function readProductionPosture(rootDir: string, names: readonly string[], wants: (group: FindingGroup) => boolean): Promise<ProductionPosture> {
  const target = { prod: true }
  const probes = (['auth', 'site', 'monitoring'] as const).some(wants)
  const [environment, siteOrigin, email] = await Promise.all([
    readListed(names, 'BACKEND_ENVIRONMENT', (['deployment', 'email', 'billing'] as const).some(wants), () => deploymentBackendEnvironment(rootDir, target)),
    readListed(names, 'SITE_URL', probes, () => deploymentSiteOrigin(rootDir, target)),
    wants('email') ? readEmailPosture(rootDir) : 'unset' as const,
  ])
  return { environment, siteOrigin, email }
}

/**
 * `BACKEND_ENVIRONMENT` on production: `production` passes; unset,
 * `development` and `preview` fail, since every provider stays in its test mode
 * (and a `development` deployment trusts local origins and logs sign-in
 * codes); `sandbox`, a demo or staging app on purpose, warns.
 */
function environmentFinding(posture: ProductionPosture): PreflightFinding {
  const environment = posture.environment
  switch (environment) {
    case 'production':
      return finding('deployment-backend-environment', 'pass', 'BACKEND_ENVIRONMENT is production: mail reaches real inboxes and billing bills live.')
    case 'sandbox':
      return finding('deployment-backend-environment', 'warn', 'BACKEND_ENVIRONMENT is sandbox on production, on purpose: it runs in production mode on the providers\' test modes, so mail reaches only the email provider\'s test addresses and checkout takes test cards, and nobody pays.', 'For a live product: verify the sending domain, run npx nuxt-backend billing sync --env production, then npx convex env set --prod BACKEND_ENVIRONMENT production')
    case 'development':
    case 'preview':
      return finding('deployment-backend-environment', 'fail', `BACKEND_ENVIRONMENT is ${environment} on production: every provider stays in its test mode${environment === 'development' ? ', local origins are trusted and sign-in codes are logged' : ''}.`, 'Set it: npx convex env set --prod BACKEND_ENVIRONMENT production (npx nuxt-backend env push --prod --force BACKEND_ENVIRONMENT derives it).')
    case 'unread':
      return finding('deployment-backend-environment', 'warn', 'BACKEND_ENVIRONMENT is set on production, and its value could not be read as development, preview, sandbox or production: the backend keeps every provider in its test mode on any other value.', 'Check it: npx convex env get --prod BACKEND_ENVIRONMENT')
    default:
      return finding('deployment-backend-environment', 'fail', 'BACKEND_ENVIRONMENT is not set on production, so every provider stays in its test mode: mail reaches only the email provider\'s test addresses, checkout takes test cards, and nobody else can get a sign-in code.', 'Run npx nuxt-backend env push --prod: it derives production. A deliberate demo or staging app sets it to sandbox instead, which doctor reports as a warning.')
  }
}

/** `EMAIL_FROM` on production: unset fails, unless the deployment is a deliberate `sandbox`. */
function senderFinding(set: boolean, posture: ProductionPosture): PreflightFinding {
  if (set) {
    const sender = typeof posture.email === 'object' ? posture.email.sender : null
    return finding('deployment-email-from', 'pass', typeof sender === 'object' && sender ? `EMAIL_FROM is set on production: mail comes from ${sender.domain}.` : 'EMAIL_FROM is set on production.')
  }
  if (posture.environment === 'sandbox') {
    return finding('deployment-email-from', 'warn', 'EMAIL_FROM is not set on production: in this deliberate sandbox, mail comes from the email provider\'s onboarding address.', 'Before going live: npx convex env set --prod EMAIL_FROM "Acme <hello@acme.com>", an address on your verified domain.')
  }
  return finding('deployment-email-from', 'fail', 'EMAIL_FROM is not set on production: mail comes from the email provider\'s onboarding address, which delivers only to its test addresses and the account owner, so sign-in codes, invitations and gifts to anyone else are refused.', 'Set a sender on your verified domain: npx convex env set --prod EMAIL_FROM "Acme <hello@acme.com>"')
}

/**
 * The value-aware finding of the environment or a sender on production, in
 * place of the presence check every other optional name gets; `null` for any
 * other name.
 */
export function productionEnvFinding(name: string, deployed: readonly string[], posture: ProductionPosture): PreflightFinding | null {
  if (name === 'BACKEND_ENVIRONMENT') return environmentFinding(posture)
  if (name === 'EMAIL_FROM') return senderFinding(deployed.includes(name), posture)
  return null
}

/** The kinds of deployment that may publish the dev inbox: any one but production. */
const INBOX_ENVIRONMENTS: ReadonlySet<unknown> = new Set(['development', 'preview', 'sandbox'])

/**
 * `EMAIL_DEV_INBOX` set, the dev inbox's page reader: opted into on purpose
 * outside production (unset, doctor says nothing of it). Left set on production it answers nothing there, so it
 * warns until removed. Under --prod, production's own `BACKEND_ENVIRONMENT`
 * decides: a deliberate sandbox may publish it.
 */
export function devInboxFinding({ prod, posture, set = true }: { prod: boolean, posture: ProductionPosture | null, set?: boolean }): PreflightFinding {
  const environment = posture?.environment
  if (!set) {
    // Only asked for a sandbox that re-exports the reader: a public demo whose sign-in codes are read off the page.
    return finding(
      'deployment-email-dev-inbox',
      'warn',
      'The backend re-exports getSandboxInbox and production\'s BACKEND_ENVIRONMENT is sandbox, but EMAIL_DEV_INBOX is not set: the dev inbox answers nothing, so a visitor of the demo reads no sign-in code.',
      `Set it on purpose: npx convex env set${prod ? ' --prod' : ''} EMAIL_DEV_INBOX 1`,
    )
  }
  if (environment === 'production' || (prod && !INBOX_ENVIRONMENTS.has(environment))) {
    return finding(
      'deployment-email-dev-inbox',
      'warn',
      `EMAIL_DEV_INBOX is set on ${environment === 'production' ? 'a deployment whose BACKEND_ENVIRONMENT is production' : 'production'}: the dev inbox answers nothing there, and the variable says it would.`,
      `Remove it: npx convex env remove${prod ? ' --prod' : ''} EMAIL_DEV_INBOX`,
    )
  }
  return finding('deployment-email-dev-inbox', 'pass', `EMAIL_DEV_INBOX is set${typeof environment === 'string' && INBOX_ENVIRONMENTS.has(environment) ? ` on a ${environment} deployment` : ''}: pages read the dev inbox of test addresses through getSandboxInbox.`)
}

/** `SITE_URL` on production: an https origin of its own, never the dev default. */
export function siteOriginFinding(posture: ProductionPosture): PreflightFinding[] {
  const site = posture.siteOrigin
  if (site === 'unset') return []
  if (site === 'unread') return [finding('site-url-origin', 'warn', 'SITE_URL is set on production, and its value could not be read, so the live site was not probed.', 'Check it: npx convex env get --prod SITE_URL')]
  const hint = 'Set the app\'s public origin: npx convex env set --prod SITE_URL https://app.example.com'
  if (site === 'malformed') return [finding('site-url-origin', 'fail', 'SITE_URL on production is not an http(s) URL: auth trusts no browser origin, and every emailed link is broken.', hint)]
  if (isLoopbackUrl(site.origin)) {
    return [finding('site-url-origin', 'fail', `SITE_URL on production is ${site.origin}, an origin on this machine (a dev default): emailed links and the one trusted browser origin point there.`, hint)]
  }
  if (!site.origin.startsWith('https:')) {
    return [finding('site-url-origin', 'fail', `SITE_URL on production is ${site.origin}, not HTTPS: browsers keep passkeys and secure cookies from a plain HTTP origin.`, hint)]
  }
  return [finding('site-url-origin', 'pass', `SITE_URL on production is ${site.origin}: the live probes check that site.`)]
}

/**
 * The origin the live probes check: production's https origin, never one
 * on this machine. A plain HTTP one is `site-url-origin`'s failure alone,
 * and nothing is probed over it.
 */
export function probedOrigin(posture: ProductionPosture): string | null {
  const site = posture.siteOrigin
  return typeof site === 'object' && site.origin.startsWith('https:') && !isLoopbackUrl(site.origin) ? site.origin : null
}

/** The fix for a SITE_URL the live probes cannot check. */
const SITE_URL_HINT = 'Set production\'s public origin: npx convex env set --prod SITE_URL https://app.example.com (npx nuxt-backend doctor --prod --only auth says more).'

/**
 * Why the live site is not probed, for a run that leaves out the auth
 * layer, whose `site-url-origin` or `deployment-site-url` says it
 * otherwise; `null` when it is probed. `posture` is `null` when
 * production's env names could not be read.
 */
export function unprobedReason(posture: ProductionPosture | null): { why: string, fixHint: string } | null {
  if (!posture) return { why: 'Production\'s env names could not be read', fixHint: 'Check that npx convex env list --prod runs here (CONVEX_DEPLOY_KEY), then run npx nuxt-backend doctor --prod again.' }
  const site = posture.siteOrigin
  if (site === 'unset') return { why: 'SITE_URL is not set on production', fixHint: SITE_URL_HINT }
  if (site === 'unread') return { why: 'SITE_URL is set on production, and its value could not be read', fixHint: 'Check it: npx convex env get --prod SITE_URL' }
  if (site === 'malformed') return { why: 'SITE_URL on production is not an http(s) URL', fixHint: SITE_URL_HINT }
  if (isLoopbackUrl(site.origin)) return { why: `SITE_URL on production is ${site.origin}, an origin on this machine`, fixHint: SITE_URL_HINT }
  if (!site.origin.startsWith('https:')) return { why: `SITE_URL on production is ${site.origin}, not HTTPS`, fixHint: SITE_URL_HINT }
  return null
}

/** Why the provider gave nothing back, in a clause. */
function accessFinding(domain: string, readout: EmailProviderReadout): PreflightFinding {
  const reason = readout.reason ? ` (${readout.reason})` : ''
  if (readout.access === 'sending') {
    return finding('email-sender-domain', 'warn', `Production's EMAIL_API_KEY may only send, so doctor cannot read whether ${domain} is verified, nor the last week's bounces and the quota.`, 'Check the domain in the email provider\'s dashboard, or give production a full-access key.')
  }
  if (readout.access === 'refused') {
    return finding('email-sender-domain', 'fail', `The email provider refused production's EMAIL_API_KEY${reason}: it was deleted, deactivated or suspended, and nothing is sent with it.`, 'Create a key in the email provider\'s dashboard and set it: npx convex env set --prod EMAIL_API_KEY (it asks for the value).')
  }
  return finding('email-sender-domain', 'warn', `The email provider did not answer production's read${reason}, so whether ${domain} is verified is unknown.`, 'Run npx nuxt-backend doctor --prod again later.')
}

/** The sender's domain at the provider: verified passes; partly verified warns; unverified, absent or not sending fails. */
function domainFinding(domain: string, found: EmailProviderReadout['domain']): PreflightFinding {
  if (found === undefined) return finding('email-sender-domain', 'warn', `${domain} was not found among the first domains the email provider listed, so whether it is verified is unknown.`, 'Check it in the email provider\'s dashboard.')
  const fix = `Verify ${domain} in the email provider's dashboard (publish the DNS records it lists), or set EMAIL_FROM to an address on a verified domain.`
  if (found === 'absent') return finding('email-sender-domain', 'fail', `${domain} is not a domain of the email provider account production's key belongs to: every send from it is refused.`, fix)
  if (!found.sending) return finding('email-sender-domain', 'fail', `Sending from ${domain} is turned off at the email provider: every send from it is refused.`, `Turn sending on for ${domain} in the email provider's dashboard.`)
  if (found.status === 'verified') return finding('email-sender-domain', 'pass', `${domain} is verified with the email provider.`)
  if (found.status === 'partially_verified' || found.status === 'temporary_failure') {
    return finding('email-sender-domain', 'warn', `${domain} is ${found.status.replace(/_/g, ' ')} at the email provider: mail goes out, but a DNS record it checks is missing.`, `Fix the record the dashboard flags for ${domain}.`)
  }
  return finding('email-sender-domain', 'fail', `${domain} is ${found.status.replace(/_/g, ' ')} at the email provider, not verified: it refuses mail from it.`, fix)
}

/** The provider's bounce and complaint limits: above either, it may pause the account's sending. */
export const EMAIL_LIMITS = { bounce: 0.04, complaint: 0.0008 } as const

/** Below this many sends a week, one bounce moves a rate too far to fail on it. */
export const RATE_VOLUME = 100

/** A rate as a percentage, to two significant decimals. */
const percent = (rate: number) => `${Number((rate * 100).toFixed(rate < 0.01 ? 3 : 2))}%`

/** The last week's bounces and complaints against the provider's limits. */
function reputationFinding(readout: EmailProviderReadout): PreflightFinding[] {
  const week = readout.week
  if (!week) return []
  if (week.sent === 0) return [finding('email-reputation', 'pass', 'Nothing was sent in the last 7 days.')]
  const bounce = week.bounced / week.sent
  const complaint = week.delivered > 0 ? week.complained / week.delivered : 0
  const summary = `Last 7 days: ${week.sent} sent, a bounce rate of ${percent(bounce)} (the provider's limit is ${percent(EMAIL_LIMITS.bounce)}) and a complaint rate of ${percent(complaint)} (limit ${percent(EMAIL_LIMITS.complaint)})`
  const over = bounce >= EMAIL_LIMITS.bounce || complaint >= EMAIL_LIMITS.complaint
  const near = bounce >= EMAIL_LIMITS.bounce / 2 || complaint >= EMAIL_LIMITS.complaint / 2
  if (!near) return [finding('email-reputation', 'pass', `${summary}.`)]
  const hint = 'Find the cause in the email provider\'s dashboard: addresses that no longer exist, or sign-ups by bots (turn on bot protection), then send less until the rates fall.'
  if (over && week.sent >= RATE_VOLUME) return [finding('email-reputation', 'fail', `${summary}: above the limit, the provider may pause the account's sending, sign-in codes included.`, hint)]
  return [finding('email-reputation', 'warn', `${summary}${over ? ': above the limit, on few sends' : ': close to the limit'}.`, hint)]
}

/** The quota used: a daily quota (the free plan's) stops every send for the rest of the day once it is reached. */
function quotaFinding(readout: EmailProviderReadout): PreflightFinding[] {
  const quota = readout.quota
  if (!quota) return []
  const month = quota.monthly !== undefined ? `, ${quota.monthly} this month` : ''
  if (quota.daily !== undefined) {
    return [finding('email-quota', 'warn', `The email provider account has a daily sending quota (the free plan's): ${quota.daily} used today${month}. Once it is reached, every send stops until midnight UTC, sign-in codes included.`, 'Move the account to a paid plan before launch: its quota is monthly only.')]
  }
  return [finding('email-quota', 'pass', `The email provider account has no daily quota${quota.monthly !== undefined ? `: ${quota.monthly} sent this month` : ''}.`)]
}

/**
 * What production's own email posture says: the sender's domain at the
 * provider, the last week's bounces and complaints, and the quota. A sender
 * or key that is not set reports nothing here: their `deployment-*`
 * findings do.
 */
export function emailPostureFindings(posture: ProductionPosture): PreflightFinding[] {
  const email = posture.email
  if (email === 'unset') return []
  if (email === 'unread') {
    return [finding('email-sender-domain', 'warn', 'Production did not report its email posture: it runs a release without posture:email, or the Convex CLI could not run it here (no access to production, or it timed out).', 'Deploy the current version if production runs an older one (npx convex deploy), then run npx nuxt-backend doctor --prod again.')]
  }
  if (email.sender === 'unset' || !email.provider) return []
  if (email.sender === 'malformed') {
    return [finding('email-sender-domain', 'fail', 'EMAIL_FROM on production holds no address: the email provider refuses every send.', 'Set it to a sender such as "Acme <hello@acme.com>": npx convex env set --prod EMAIL_FROM')]
  }
  const { domain } = email.sender
  const readout = email.provider
  if (readout.access !== 'full') return [accessFinding(domain, readout)]
  return [domainFinding(domain, readout.domain), ...reputationFinding(readout), ...quotaFinding(readout)]
}
