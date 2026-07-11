/**
 * Dev-startup environment preflight — the doctor-style checks this module can
 * run from the Nuxt process. Deployment-side values (`BETTER_AUTH_SECRET`,
 * `RESEND_*`, `POLAR_*` set via `npx convex env set`) can only be *hinted at*
 * here; the CLI `doctor` command verifies them against the deployment.
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

  const secret = env.BETTER_AUTH_SECRET
  if (secret === undefined) {
    findings.push({
      id: 'better-auth-secret',
      title: 'Better Auth secret',
      status: 'warn',
      message: 'BETTER_AUTH_SECRET is not visible here — it lives on the Convex deployment and cannot be verified from Nuxt.',
      fixHint: 'If unset there: npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"',
    })
  }
  else if (secret.length < 32 || SECRET_PLACEHOLDERS.has(secret.toLowerCase())) {
    findings.push({
      id: 'better-auth-secret',
      title: 'Better Auth secret',
      status: 'fail',
      message: 'BETTER_AUTH_SECRET is too short or a placeholder — sessions signed with it are guessable.',
      fixHint: 'npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"',
    })
  }
  else {
    findings.push({
      id: 'better-auth-secret',
      title: 'Better Auth secret',
      status: 'pass',
      message: 'BETTER_AUTH_SECRET present and strong.',
      fixHint: '',
    })
  }

  const siteUrl = env.SITE_URL
  if (siteUrl !== undefined && !isHttpUrl(siteUrl)) {
    findings.push({
      id: 'site-url',
      title: 'App site URL',
      status: 'fail',
      message: `SITE_URL is not a valid http(s) URL: "${siteUrl}" — Better Auth uses it as baseURL.`,
      fixHint: 'Set SITE_URL to your app origin, e.g. https://app.example.com',
    })
  }
  else {
    findings.push({
      id: 'site-url',
      title: 'App site URL',
      status: 'pass',
      message: siteUrl ? 'SITE_URL is a valid URL.' : 'SITE_URL not set locally (the deployment falls back to CONVEX_SITE_URL).',
      fixHint: '',
    })
  }

  // Email and billing are designed graceful no-ops when unconfigured — these
  // never warn, only surface as a note in the summary.
  findings.push({
    id: 'email-env',
    title: 'Email (Resend)',
    status: 'pass',
    message: env.RESEND_API_KEY ? 'RESEND_API_KEY visible.' : 'Email unconfigured — sending no-ops until RESEND_API_KEY is set on the deployment.',
    fixHint: '',
  })
  findings.push({
    id: 'billing-env',
    title: 'Billing (Polar)',
    status: 'pass',
    message: env.POLAR_ORGANIZATION_TOKEN ? 'POLAR_ORGANIZATION_TOKEN visible.' : 'Billing unconfigured — checkout/entitlements no-op until POLAR_ORGANIZATION_TOKEN is set on the deployment.',
    fixHint: '',
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

/** One-line summary for the dev-startup log, e.g. `auth ✓ · unconfigured (no-op): email, billing`. */
export function formatPreflightSummary(findings: PreflightFinding[]): string {
  const problems = findings.filter(finding => finding.status !== 'pass')
  const unconfigured = findings
    .filter(finding => finding.status === 'pass' && finding.message.includes('unconfigured'))
    .map(finding => finding.id.replace('-env', ''))

  const parts: string[] = []
  parts.push(problems.length === 0 ? 'auth ✓' : `${problems.length} finding${problems.length === 1 ? '' : 's'}`)
  if (unconfigured.length > 0) {
    parts.push(`unconfigured (no-op): ${unconfigured.join(', ')}`)
  }
  return parts.join(' · ')
}
