/**
 * Dev-startup environment preflight — the doctor-style checks this module can
 * run from the Nuxt process. Deployment-side values (`AUTH_SECRET`, `EMAIL_*`,
 * `BILLING_*` set via `npx convex env set`) can only be *hinted at* here; the
 * CLI `doctor` command verifies them against the deployment.
 *
 * The env contract has two tiers (see `backendEnv` in `src/convex/app.ts`):
 * `AUTH_SECRET` + `SITE_URL` are required (a deploy fails without them);
 * everything else is optional and degrades in a designed way — those findings
 * describe the degradation instead of claiming a deploy will fail.
 *
 * Pure and injectable for tests. URL-shape validation of `url`/`siteUrl`
 * belongs to `nuxt-convex-module` — not duplicated here. Every id comes from
 * the findings registry (src/findings/), every env name from
 * src/env-registry.ts.
 */
import { OPTIONAL_DEPLOYMENT_ENV } from './env-registry'
import { DOCTOR_SCHEMA_URL, finding, type PreflightFinding } from './findings'

export type { PreflightFinding } from './findings'
export { DEV_ONLY_DEPLOYMENT_ENV, OPTIONAL_DEPLOYMENT_ENV, REQUIRED_DEPLOYMENT_ENV } from './env-registry'

export interface PreflightInput {
  /** Environment to inspect (inject `process.env` in real runs). */
  env: Record<string, string | undefined>
  /** Whether the backend site URL is configured (module option or env). */
  siteUrlConfigured: boolean
  /** The agent (MCP) endpoint, when enabled — omit to skip the finding. */
  mcp?: { route: string }
  /**
   * Env names known to be set on the deployment (`convex env list`, or a clean
   * `env push` run). A name set there but not visible here is not a problem:
   * the value lives where it is used.
   */
  deployedNames?: ReadonlySet<string>
}

const SECRET_PLACEHOLDERS = new Set(['secret', 'changeme', 'change-me', 'your-secret', 'placeholder', 'todo'])

/** Whether a name is set on the deployment but not visible to this process. */
type OnDeployment = (name: string) => boolean

function backendSiteUrlFinding(siteUrlConfigured: boolean): PreflightFinding {
  return siteUrlConfigured
    ? finding('backend-site-url', 'pass', 'Backend site URL configured — the auth proxy can reach the backend HTTP routes.')
    : finding('backend-site-url', 'warn', 'No backend site URL configured; the /api/auth proxy has no target.', 'Set NUXT_PUBLIC_BACKEND_SITE_URL (or backend.siteUrl in nuxt.config) — normally derived for you.')
}

function authSecretFinding(secret: string | undefined, onDeployment: OnDeployment): PreflightFinding {
  if (onDeployment('AUTH_SECRET')) {
    return finding('auth-secret', 'pass', 'AUTH_SECRET is set on the deployment (its value is not visible here).')
  }
  if (secret === undefined) {
    return finding(
      'auth-secret',
      'warn',
      'AUTH_SECRET is not visible here — it is required on the Convex deployment (a deploy fails without it) and cannot be verified from Nuxt.',
      'On a dev deployment `npx nuxt-backend env push` generates one; otherwise: npx convex env set AUTH_SECRET "$(openssl rand -base64 32)"',
    )
  }
  if (secret.length < 32 || SECRET_PLACEHOLDERS.has(secret.toLowerCase())) {
    return finding('auth-secret', 'fail', 'AUTH_SECRET is too short or a placeholder — sessions signed with it are guessable.', 'npx convex env set AUTH_SECRET "$(openssl rand -base64 32)"')
  }
  return finding('auth-secret', 'pass', 'AUTH_SECRET present and strong.')
}

function siteUrlFinding(siteUrl: string | undefined, onDeployment: OnDeployment): PreflightFinding {
  if (onDeployment('SITE_URL')) {
    return finding('site-url', 'pass', 'SITE_URL is set on the deployment (its value is not visible here).')
  }
  if (siteUrl === undefined) {
    return finding(
      'site-url',
      'warn',
      'SITE_URL is not visible here — it is required on the Convex deployment (invitation and gift emails link to it).',
      'On a dev deployment `npx nuxt-backend env push` sets http://localhost:3000; in production: npx convex env set SITE_URL https://app.example.com',
    )
  }
  if (!isHttpUrl(siteUrl)) {
    return finding('site-url', 'fail', `SITE_URL is not a valid http(s) URL: "${siteUrl}" — auth and invitation/gift links use it as the app origin.`, 'Set SITE_URL to your app origin, e.g. https://app.example.com')
  }
  return finding('site-url', 'pass', 'SITE_URL is a valid URL.')
}

/**
 * The optional tier's capability gates: absence is a designed degradation,
 * not a broken deploy. One finding per gate (transport, webhooks); the
 * fallback-only vars (EMAIL_FROM, EMAIL_TEST_MODE, BILLING_ENVIRONMENT) have
 * safe defaults and produce no finding on their own.
 */
const OPTIONAL_GATES = [
  {
    id: 'email-transport',
    name: 'EMAIL_API_KEY',
    on: 'transactional email is on',
    fixHint: 'Add EMAIL_API_KEY to .env.local and run `npx nuxt-backend env push` (EMAIL_FROM / EMAIL_TEST_MODE have safe defaults).',
  },
  {
    id: 'email-webhook-secret',
    name: 'EMAIL_WEBHOOK_SECRET',
    on: 'delivery events verify',
    fixHint: 'Create the provider webhook for /email/events, then add EMAIL_WEBHOOK_SECRET to .env.local and `npx nuxt-backend env push`.',
  },
  {
    id: 'billing-access',
    name: 'BILLING_ACCESS_TOKEN',
    on: 'billing is on',
    fixHint: 'Add BILLING_ACCESS_TOKEN to .env.local and run `npx nuxt-backend env push` (BILLING_ENVIRONMENT defaults to sandbox).',
  },
  {
    id: 'billing-webhook-secret',
    name: 'BILLING_WEBHOOK_SECRET',
    on: 'billing events verify',
    fixHint: 'Create the provider webhook for /billing/events, then add BILLING_WEBHOOK_SECRET to .env.local and `npx nuxt-backend env push`.',
  },
] as const satisfies ReadonlyArray<{ id: 'email-transport' | 'email-webhook-secret' | 'billing-access' | 'billing-webhook-secret', name: keyof typeof OPTIONAL_DEPLOYMENT_ENV, on: string, fixHint: string }>

const OPTIONAL_GATE_IDS: ReadonlySet<string> = new Set(OPTIONAL_GATES.map(gate => gate.id))

/**
 * Whether the required tier still needs attention: the backend URL,
 * AUTH_SECRET or SITE_URL, which `init` and `dev` take care of. An unset
 * optional service does not count; the app runs without it by design.
 */
export function needsSetup(findings: readonly PreflightFinding[]): boolean {
  return findings.some(finding => finding.status !== 'pass' && !OPTIONAL_GATE_IDS.has(finding.id))
}

function optionalGateFinding(gate: (typeof OPTIONAL_GATES)[number], env: PreflightInput['env'], onDeployment: OnDeployment): PreflightFinding {
  const where = env[gate.name] ? 'visible' : onDeployment(gate.name) ? 'set on the deployment' : null
  return where
    ? finding(gate.id, 'pass', `${gate.name} ${where} — ${gate.on}.`)
    : finding(gate.id, 'warn', `${gate.name} is not set (optional): ${OPTIONAL_DEPLOYMENT_ENV[gate.name]}.`, gate.fixHint)
}

export function collectPreflightFindings({ env, siteUrlConfigured, mcp, deployedNames }: PreflightInput): PreflightFinding[] {
  const onDeployment: OnDeployment = name => env[name] === undefined && deployedNames?.has(name) === true
  const findings: PreflightFinding[] = [
    backendSiteUrlFinding(siteUrlConfigured),
    authSecretFinding(env.AUTH_SECRET, onDeployment),
    siteUrlFinding(env.SITE_URL, onDeployment),
    ...OPTIONAL_GATES.map(gate => optionalGateFinding(gate, env, onDeployment)),
  ]
  // Only where the route is known: the module and the DevTools panel read it
  // from nuxt.config, the CLI does not.
  if (mcp) {
    findings.push(finding('mcp', 'pass', `OAuth-protected MCP endpoint at ${mcp.route} — agents sign in as your users and see only consented scopes.`))
  }
  return findings
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  }
  catch {
    return false
  }
}

/**
 * What `nuxt-backend doctor --json` prints, and the DevTools panel copies:
 * the findings, their summary, and the schema that describes them.
 */
export function doctorReport<F extends Pick<PreflightFinding, 'id' | 'status'>>(findings: F[]): { $schema: string, findings: F[], summary: string } {
  return { $schema: DOCTOR_SCHEMA_URL, findings, summary: formatPreflightSummary(findings) }
}

/** One-line summary for the dev-startup log, e.g. `auth ✓` or `2 findings`. */
export function formatPreflightSummary(findings: ReadonlyArray<Pick<PreflightFinding, 'id' | 'status'>>): string {
  const problems = findings.filter(finding => finding.status !== 'pass')
  if (problems.length === 0) return 'auth ✓'
  return `${problems.length} finding${problems.length === 1 ? '' : 's'}: ${problems.map(f => f.id).join(', ')}`
}
