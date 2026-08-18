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

  it('reports missing optional email/billing env as warns describing the degradation', () => {
    const findings = collectPreflightFindings({ env: {}, siteUrlConfigured: true })
    for (const id of ['email-transport', 'email-webhook-secret', 'billing-access', 'billing-webhook-secret']) {
      expect(byId(findings, id).status).toBe('warn')
      expect(byId(findings, id).message).toContain('optional')
      // Optional tier never claims a deploy will fail.
      expect(byId(findings, id).message).not.toContain('deploy fails')
    }
    expect(byId(findings, 'email-transport').message).toContain('OTP')
    expect(byId(findings, 'billing-access').message).toContain('checkout')
  })

  it('passes each optional capability independently once its gate var is set', () => {
    const findings = collectPreflightFindings({
      env: { EMAIL_API_KEY: 're_123' },
      siteUrlConfigured: true,
    })
    expect(byId(findings, 'email-transport').status).toBe('pass')
    expect(byId(findings, 'email-webhook-secret').status).toBe('warn')
    expect(byId(findings, 'billing-access').status).toBe('warn')
  })

  it('produces no finding for fallback-only vars (EMAIL_FROM, EMAIL_TEST_MODE, BILLING_ENVIRONMENT)', () => {
    const findings = collectPreflightFindings({ env: fullEnv, siteUrlConfigured: true })
    const ids = findings.map(finding => finding.id)
    expect(ids).not.toContain('email-from')
    expect(ids).not.toContain('billing-environment')
  })

  it('reports the agent endpoint when enabled and stays silent when disabled', () => {
    const enabled = collectPreflightFindings({ env: fullEnv, siteUrlConfigured: true, mcp: { route: '/mcp' } })
    expect(byId(enabled, 'mcp').status).toBe('pass')
    expect(byId(enabled, 'mcp').message).toContain('/mcp')

    const disabled = collectPreflightFindings({ env: fullEnv, siteUrlConfigured: true })
    expect(disabled.map(finding => finding.id)).not.toContain('mcp')
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
