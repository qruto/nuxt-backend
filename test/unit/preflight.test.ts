import { describe, expect, it } from 'vitest'
import { collectPreflightFindings, formatPreflightSummary, type PreflightFinding } from '../../src/preflight'

function byId(findings: PreflightFinding[], id: string): PreflightFinding {
  const finding = findings.find(f => f.id === id)
  if (!finding) throw new Error(`missing finding: ${id}`)
  return finding
}

const fullEnv = {
  AUTH_SECRET: 'a'.repeat(44),
  SITE_URL: 'https://app.example.com',
  EMAIL_API_KEY: 're_123',
  EMAIL_FROM: 'hello@example.com',
  EMAIL_TEST_MODE: 'true',
  EMAIL_WEBHOOK_SECRET: 'whsec_email',
  BILLING_ACCESS_TOKEN: 'oat_123',
  BILLING_WEBHOOK_SECRET: 'whsec_billing',
  BILLING_ENVIRONMENT: 'sandbox',
}

describe('collectPreflightFindings', () => {
  it('passes on a fully configured environment', () => {
    const findings = collectPreflightFindings({ env: fullEnv, siteUrlConfigured: true })
    expect(findings.every(finding => finding.status === 'pass')).toBe(true)
  })

  it('warns when no Convex site URL is configured', () => {
    const findings = collectPreflightFindings({ env: {}, siteUrlConfigured: false })
    const finding = byId(findings, 'convex-site-url')
    expect(finding.status).toBe('warn')
    expect(finding.fixHint).toContain('NUXT_PUBLIC_CONVEX_SITE_URL')
  })

  it.each([
    ['short', 'too-short'],
    ['placeholder', 'changeme'],
    ['placeholder (case-insensitive)', 'SECRET'],
  ])('fails on a weak auth secret (%s)', (_label, secret) => {
    const findings = collectPreflightFindings({ env: { AUTH_SECRET: secret }, siteUrlConfigured: true })
    expect(byId(findings, 'auth-secret').status).toBe('fail')
  })

  it('only warns when the auth secret is not visible locally', () => {
    const findings = collectPreflightFindings({ env: {}, siteUrlConfigured: true })
    const finding = byId(findings, 'auth-secret')
    expect(finding.status).toBe('warn')
    expect(finding.message).toContain('required')
  })

  it.each(['not a url', 'ftp://example.com', 'app.example.com'])(
    'fails on an invalid SITE_URL (%s)',
    (siteUrl) => {
      const findings = collectPreflightFindings({ env: { SITE_URL: siteUrl }, siteUrlConfigured: true })
      expect(byId(findings, 'site-url').status).toBe('fail')
    },
  )

  it('surfaces missing required email/billing env as findings, never designed passes', () => {
    const findings = collectPreflightFindings({ env: {}, siteUrlConfigured: true })
    expect(byId(findings, 'email-env').status).toBe('warn')
    expect(byId(findings, 'billing-env').status).toBe('warn')
    expect(byId(findings, 'email-env').message).toContain('EMAIL_API_KEY')
    expect(byId(findings, 'billing-env').fixHint).toContain('convex env set')
  })

  it('lists only the missing vars of a partially configured feature', () => {
    const findings = collectPreflightFindings({
      env: { EMAIL_API_KEY: 're_123', EMAIL_FROM: 'a@b.co' },
      siteUrlConfigured: true,
    })
    const finding = byId(findings, 'email-env')
    expect(finding.status).toBe('warn')
    expect(finding.message).toContain('EMAIL_TEST_MODE')
    expect(finding.message).not.toContain('EMAIL_API_KEY,')
  })
})

describe('formatPreflightSummary', () => {
  it('summarizes a fully configured environment', () => {
    const findings = collectPreflightFindings({ env: fullEnv, siteUrlConfigured: true })
    expect(formatPreflightSummary(findings)).toBe('auth ✓')
  })

  it('counts problems and names them', () => {
    const findings = collectPreflightFindings({ env: { ...fullEnv, AUTH_SECRET: 'weak' }, siteUrlConfigured: false })
    expect(formatPreflightSummary(findings)).toContain('2 findings')
    expect(formatPreflightSummary(findings)).toContain('auth-secret')
  })
})
