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
  /** Whether a Convex site URL is configured (module option or env). */
  siteUrlConfigured: boolean
}

const SECRET_PLACEHOLDERS = new Set(['secret', 'changeme', 'change-me', 'your-secret', 'placeholder', 'todo'])

/** Deployment env that must exist before a deploy succeeds. */
export const REQUIRED_DEPLOYMENT_ENV = ['AUTH_SECRET', 'SITE_URL'] as const

/**
 * Optional deployment env with the designed degradation each one's absence
 * causes — shared by preflight, doctor, and `env push` so the wording never
 * forks.
 */
export const OPTIONAL_DEPLOYMENT_ENV = {
  EMAIL_API_KEY: 'email sends no-op and OTP sign-in throws (NUXT_BACKEND_LOG_OTP=1 echoes codes to the convex dev console)',
  EMAIL_FROM: 'the provider onboarding sender is used',
  EMAIL_TEST_MODE: 'test mode stays ON (set to "false" to deliver for real)',
  EMAIL_WEBHOOK_SECRET: 'delivery events are rejected — useEmailStatus stays at "sent"',
  BILLING_ACCESS_TOKEN: 'billing queries return empty and checkout actions fail on invocation',
  BILLING_WEBHOOK_SECRET: 'billing events are rejected — entitlements refresh only on demand (syncEntitlements)',
  BILLING_ENVIRONMENT: 'the sandbox billing environment is used',
} as const satisfies Record<string, string>

export function collectPreflightFindings({ env, siteUrlConfigured }: PreflightInput): PreflightFinding[] {
  const findings: PreflightFinding[] = []

  findings.push(siteUrlConfigured
    ? {
        id: 'convex-site-url',
        title: 'Convex site URL',
        status: 'pass',
        message: 'Site URL configured — the auth proxy can reach Convex HTTP actions.',
        fixHint: '',
      }
    : {
        id: 'convex-site-url',
        title: 'Convex site URL',
        status: 'warn',
        message: 'No Convex site URL configured; the /api/auth proxy has no target.',
        fixHint: 'Set NUXT_PUBLIC_CONVEX_SITE_URL=https://<slug>.convex.site (or backend.siteUrl in nuxt.config).',
      })

  const secret = env.AUTH_SECRET
  if (secret === undefined) {
    findings.push({
      id: 'auth-secret',
      title: 'Auth secret',
      status: 'warn',
      message: 'AUTH_SECRET is not visible here — it is required on the Convex deployment (a deploy fails without it) and cannot be verified from Nuxt.',
      fixHint: 'On a dev deployment `npx nuxt-backend env push` generates one; otherwise: npx convex env set AUTH_SECRET "$(openssl rand -base64 32)"',
    })
  }
  else if (secret.length < 32 || SECRET_PLACEHOLDERS.has(secret.toLowerCase())) {
    findings.push({
      id: 'auth-secret',
      title: 'Auth secret',
      status: 'fail',
      message: 'AUTH_SECRET is too short or a placeholder — sessions signed with it are guessable.',
      fixHint: 'npx convex env set AUTH_SECRET "$(openssl rand -base64 32)"',
    })
  }
  else {
    findings.push({
      id: 'auth-secret',
      title: 'Auth secret',
      status: 'pass',
      message: 'AUTH_SECRET present and strong.',
      fixHint: '',
    })
  }

  const siteUrl = env.SITE_URL
  if (siteUrl !== undefined && !isHttpUrl(siteUrl)) {
    findings.push({
      id: 'site-url',
      title: 'App site URL',
      status: 'fail',
      message: `SITE_URL is not a valid http(s) URL: "${siteUrl}" — auth and invitation/gift links use it as the app origin.`,
      fixHint: 'Set SITE_URL to your app origin, e.g. https://app.example.com',
    })
  }
  else if (siteUrl === undefined) {
    findings.push({
      id: 'site-url',
      title: 'App site URL',
      status: 'warn',
      message: 'SITE_URL is not visible here — it is required on the Convex deployment (invitation and gift emails link to it).',
      fixHint: 'On a dev deployment `npx nuxt-backend env push` sets http://localhost:3000; in production: npx convex env set SITE_URL https://app.example.com',
    })
  }
  else {
    findings.push({
      id: 'site-url',
      title: 'App site URL',
      status: 'pass',
      message: 'SITE_URL is a valid URL.',
      fixHint: '',
    })
  }

  // Optional tier: absence is a designed degradation, not a broken deploy.
  // One finding per capability gate (transport, webhooks) — the fallback-only
  // vars (EMAIL_FROM, EMAIL_TEST_MODE, BILLING_ENVIRONMENT) have safe defaults
  // and produce no finding on their own.
  findings.push(env.EMAIL_API_KEY
    ? {
        id: 'email-transport',
        title: 'Email transport',
        status: 'pass',
        message: 'EMAIL_API_KEY visible — transactional email is on.',
        fixHint: '',
      }
    : {
        id: 'email-transport',
        title: 'Email transport',
        status: 'warn',
        message: `EMAIL_API_KEY is not set (optional): ${OPTIONAL_DEPLOYMENT_ENV.EMAIL_API_KEY}.`,
        fixHint: 'Add EMAIL_API_KEY to .env.local and run `npx nuxt-backend env push` (EMAIL_FROM / EMAIL_TEST_MODE have safe defaults).',
      })

  findings.push(env.EMAIL_WEBHOOK_SECRET
    ? {
        id: 'email-webhook-secret',
        title: 'Email webhooks',
        status: 'pass',
        message: 'EMAIL_WEBHOOK_SECRET visible — delivery events verify.',
        fixHint: '',
      }
    : {
        id: 'email-webhook-secret',
        title: 'Email webhooks',
        status: 'warn',
        message: `EMAIL_WEBHOOK_SECRET is not set (optional): ${OPTIONAL_DEPLOYMENT_ENV.EMAIL_WEBHOOK_SECRET}.`,
        fixHint: 'Create the provider webhook for /email/events, then add EMAIL_WEBHOOK_SECRET to .env.local and `npx nuxt-backend env push`.',
      })

  findings.push(env.BILLING_ACCESS_TOKEN
    ? {
        id: 'billing-access',
        title: 'Billing access',
        status: 'pass',
        message: 'BILLING_ACCESS_TOKEN visible — billing is on.',
        fixHint: '',
      }
    : {
        id: 'billing-access',
        title: 'Billing access',
        status: 'warn',
        message: `BILLING_ACCESS_TOKEN is not set (optional): ${OPTIONAL_DEPLOYMENT_ENV.BILLING_ACCESS_TOKEN}.`,
        fixHint: 'Add BILLING_ACCESS_TOKEN to .env.local and run `npx nuxt-backend env push` (BILLING_ENVIRONMENT defaults to sandbox).',
      })

  findings.push(env.BILLING_WEBHOOK_SECRET
    ? {
        id: 'billing-webhook-secret',
        title: 'Billing webhooks',
        status: 'pass',
        message: 'BILLING_WEBHOOK_SECRET visible — billing events verify.',
        fixHint: '',
      }
    : {
        id: 'billing-webhook-secret',
        title: 'Billing webhooks',
        status: 'warn',
        message: `BILLING_WEBHOOK_SECRET is not set (optional): ${OPTIONAL_DEPLOYMENT_ENV.BILLING_WEBHOOK_SECRET}.`,
        fixHint: 'Create the provider webhook for /billing/events, then add BILLING_WEBHOOK_SECRET to .env.local and `npx nuxt-backend env push`.',
      })

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
