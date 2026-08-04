/**
 * Dev-startup environment preflight — the doctor-style checks this module can
 * run from the Nuxt process. Deployment-side values (`AUTH_SECRET`, `EMAIL_*`,
 * `BILLING_*` set via `npx convex env set`) can only be *hinted at* here; the
 * CLI `doctor` command verifies them against the deployment. All backend env
 * vars are required — a Convex deploy fails until they are set — so a missing
 * var is a finding, never a designed no-op.
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

const EMAIL_VARS = ['EMAIL_API_KEY', 'EMAIL_FROM', 'EMAIL_TEST_MODE', 'EMAIL_WEBHOOK_SECRET'] as const
const BILLING_VARS = ['BILLING_ACCESS_TOKEN', 'BILLING_WEBHOOK_SECRET', 'BILLING_ENVIRONMENT'] as const

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
      fixHint: 'If unset there: npx convex env set AUTH_SECRET "$(openssl rand -base64 32)"',
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
      fixHint: 'If unset there: npx convex env set SITE_URL https://app.example.com',
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

  // Email and billing env vars are required on the deployment — a deploy fails
  // while any is missing. From the Nuxt process we can only check visibility.
  const missingEmail = EMAIL_VARS.filter(name => !env[name])
  findings.push(missingEmail.length === 0
    ? {
        id: 'email-env',
        title: 'Email',
        status: 'pass',
        message: 'Email env vars visible (EMAIL_API_KEY, EMAIL_FROM, EMAIL_TEST_MODE, EMAIL_WEBHOOK_SECRET).',
        fixHint: '',
      }
    : {
        id: 'email-env',
        title: 'Email',
        status: 'warn',
        message: `Required email env not visible here: ${missingEmail.join(', ')}. A Convex deploy fails until they are set on the deployment.`,
        fixHint: 'npx convex env set EMAIL_API_KEY <key> (repeat for EMAIL_FROM, EMAIL_TEST_MODE, EMAIL_WEBHOOK_SECRET)',
      })

  const missingBilling = BILLING_VARS.filter(name => !env[name])
  findings.push(missingBilling.length === 0
    ? {
        id: 'billing-env',
        title: 'Billing',
        status: 'pass',
        message: 'Billing env vars visible (BILLING_ACCESS_TOKEN, BILLING_WEBHOOK_SECRET, BILLING_ENVIRONMENT).',
        fixHint: '',
      }
    : {
        id: 'billing-env',
        title: 'Billing',
        status: 'warn',
        message: `Required billing env not visible here: ${missingBilling.join(', ')}. A Convex deploy fails until they are set on the deployment.`,
        fixHint: 'npx convex env set BILLING_ACCESS_TOKEN <token> (repeat for BILLING_WEBHOOK_SECRET, BILLING_ENVIRONMENT)',
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
