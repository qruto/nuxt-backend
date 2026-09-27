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
 * belongs to `nuxt-convex-module` — not duplicated here.
 */

export interface PreflightFinding {
  id: string
  title: string
  status: 'pass' | 'warn' | 'fail'
  message: string
  fixHint: string
}

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

/** Deployment env that must exist before a deploy succeeds. */
export const REQUIRED_DEPLOYMENT_ENV = ['AUTH_SECRET', 'SITE_URL'] as const

/**
 * Optional deployment env with the designed degradation each one's absence
 * causes — shared by preflight, doctor, and `env push` so the wording never
 * forks. Mirrors the optional tier of `backendEnv` (`src/convex/app.ts`);
 * `test/unit/preflight.test.ts` pins the two lists together.
 */
export const OPTIONAL_DEPLOYMENT_ENV = {
  AUTH_TRUST_LOCAL_ORIGINS: 'only SITE_URL is trusted as a browser origin (dev-only: set to "1" on a dev deployment to also trust http://localhost:* and http://127.0.0.1:*)',
  EMAIL_API_KEY: 'email sends no-op and OTP sign-in throws (NUXT_BACKEND_LOG_OTP=1 echoes codes to the convex dev console)',
  EMAIL_FROM: 'the provider onboarding sender is used',
  EMAIL_TEST_MODE: 'test mode stays ON (set to "false" to deliver for real)',
  EMAIL_WEBHOOK_SECRET: 'delivery events are rejected — useEmailStatus stays at "sent"',
  BILLING_ACCESS_TOKEN: 'billing queries return empty and checkout actions fail on invocation',
  BILLING_WEBHOOK_SECRET: 'billing events are rejected — entitlements refresh only on demand (syncEntitlements)',
  BILLING_ENVIRONMENT: 'the sandbox billing environment is used',
} as const satisfies Record<string, string>

/**
 * The optional vars that only make sense on a dev-class deployment: `env
 * push` never forwards them to a non-dev deployment, and `doctor` treats their
 * absence there as the healthy state (presence as a warning).
 */
export const DEV_ONLY_DEPLOYMENT_ENV: ReadonlySet<string> = new Set<keyof typeof OPTIONAL_DEPLOYMENT_ENV>(['AUTH_TRUST_LOCAL_ORIGINS'])

/** Whether a name is set on the deployment but not visible to this process. */
type OnDeployment = (name: string) => boolean

function backendSiteUrlFinding(siteUrlConfigured: boolean): PreflightFinding {
  return siteUrlConfigured
    ? {
        id: 'backend-site-url',
        title: 'Backend site URL',
        status: 'pass',
        message: 'Backend site URL configured — the auth proxy can reach the backend HTTP routes.',
        fixHint: '',
      }
    : {
        id: 'backend-site-url',
        title: 'Backend site URL',
        status: 'warn',
        message: 'No backend site URL configured; the /api/auth proxy has no target.',
        fixHint: 'Set NUXT_PUBLIC_BACKEND_SITE_URL (or backend.siteUrl in nuxt.config) — normally derived for you.',
      }
}

function authSecretFinding(secret: string | undefined, onDeployment: OnDeployment): PreflightFinding {
  const finding = { id: 'auth-secret', title: 'Auth secret' }
  if (onDeployment('AUTH_SECRET')) {
    return { ...finding, status: 'pass', message: 'AUTH_SECRET is set on the deployment (its value is not visible here).', fixHint: '' }
  }
  if (secret === undefined) {
    return {
      ...finding,
      status: 'warn',
      message: 'AUTH_SECRET is not visible here — it is required on the Convex deployment (a deploy fails without it) and cannot be verified from Nuxt.',
      fixHint: 'On a dev deployment `npx nuxt-backend env push` generates one; otherwise: npx convex env set AUTH_SECRET "$(openssl rand -base64 32)"',
    }
  }
  if (secret.length < 32 || SECRET_PLACEHOLDERS.has(secret.toLowerCase())) {
    return {
      ...finding,
      status: 'fail',
      message: 'AUTH_SECRET is too short or a placeholder — sessions signed with it are guessable.',
      fixHint: 'npx convex env set AUTH_SECRET "$(openssl rand -base64 32)"',
    }
  }
  return { ...finding, status: 'pass', message: 'AUTH_SECRET present and strong.', fixHint: '' }
}

function siteUrlFinding(siteUrl: string | undefined, onDeployment: OnDeployment): PreflightFinding {
  const finding = { id: 'site-url', title: 'App site URL' }
  if (onDeployment('SITE_URL')) {
    return { ...finding, status: 'pass', message: 'SITE_URL is set on the deployment (its value is not visible here).', fixHint: '' }
  }
  if (siteUrl === undefined) {
    return {
      ...finding,
      status: 'warn',
      message: 'SITE_URL is not visible here — it is required on the Convex deployment (invitation and gift emails link to it).',
      fixHint: 'On a dev deployment `npx nuxt-backend env push` sets http://localhost:3000; in production: npx convex env set SITE_URL https://app.example.com',
    }
  }
  if (!isHttpUrl(siteUrl)) {
    return {
      ...finding,
      status: 'fail',
      message: `SITE_URL is not a valid http(s) URL: "${siteUrl}" — auth and invitation/gift links use it as the app origin.`,
      fixHint: 'Set SITE_URL to your app origin, e.g. https://app.example.com',
    }
  }
  return { ...finding, status: 'pass', message: 'SITE_URL is a valid URL.', fixHint: '' }
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
    title: 'Email transport',
    name: 'EMAIL_API_KEY',
    on: 'transactional email is on',
    fixHint: 'Add EMAIL_API_KEY to .env.local and run `npx nuxt-backend env push` (EMAIL_FROM / EMAIL_TEST_MODE have safe defaults).',
  },
  {
    id: 'email-webhook-secret',
    title: 'Email webhooks',
    name: 'EMAIL_WEBHOOK_SECRET',
    on: 'delivery events verify',
    fixHint: 'Create the provider webhook for /email/events, then add EMAIL_WEBHOOK_SECRET to .env.local and `npx nuxt-backend env push`.',
  },
  {
    id: 'billing-access',
    title: 'Billing access',
    name: 'BILLING_ACCESS_TOKEN',
    on: 'billing is on',
    fixHint: 'Add BILLING_ACCESS_TOKEN to .env.local and run `npx nuxt-backend env push` (BILLING_ENVIRONMENT defaults to sandbox).',
  },
  {
    id: 'billing-webhook-secret',
    title: 'Billing webhooks',
    name: 'BILLING_WEBHOOK_SECRET',
    on: 'billing events verify',
    fixHint: 'Create the provider webhook for /billing/events, then add BILLING_WEBHOOK_SECRET to .env.local and `npx nuxt-backend env push`.',
  },
] as const satisfies ReadonlyArray<{ id: string, title: string, name: keyof typeof OPTIONAL_DEPLOYMENT_ENV, on: string, fixHint: string }>

function optionalGateFinding(gate: (typeof OPTIONAL_GATES)[number], env: PreflightInput['env'], onDeployment: OnDeployment): PreflightFinding {
  const where = env[gate.name] ? 'visible' : onDeployment(gate.name) ? 'set on the deployment' : null
  return where
    ? { id: gate.id, title: gate.title, status: 'pass', message: `${gate.name} ${where} — ${gate.on}.`, fixHint: '' }
    : { id: gate.id, title: gate.title, status: 'warn', message: `${gate.name} is not set (optional): ${OPTIONAL_DEPLOYMENT_ENV[gate.name]}.`, fixHint: gate.fixHint }
}

export function collectPreflightFindings({ env, siteUrlConfigured, mcp, deployedNames }: PreflightInput): PreflightFinding[] {
  const onDeployment: OnDeployment = name => env[name] === undefined && deployedNames?.has(name) === true
  const findings: PreflightFinding[] = [
    backendSiteUrlFinding(siteUrlConfigured),
    authSecretFinding(env.AUTH_SECRET, onDeployment),
    siteUrlFinding(env.SITE_URL, onDeployment),
    ...OPTIONAL_GATES.map(gate => optionalGateFinding(gate, env, onDeployment)),
  ]
  // Skipped entirely when the agent surface is disabled (`backend.mcp: false`)
  // — a finding about a removed endpoint would be noise.
  if (mcp) {
    findings.push({
      id: 'mcp',
      title: 'Agent endpoint',
      status: 'pass',
      message: `OAuth-protected MCP endpoint at ${mcp.route} — agents sign in as your users and see only consented scopes.`,
      fixHint: '',
    })
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

/** One-line summary for the dev-startup log, e.g. `auth ✓` or `2 findings`. */
export function formatPreflightSummary(findings: PreflightFinding[]): string {
  const problems = findings.filter(finding => finding.status !== 'pass')
  if (problems.length === 0) return 'auth ✓'
  return `${problems.length} finding${problems.length === 1 ? '' : 's'}: ${problems.map(f => f.id).join(', ')}`
}
