import { describe, expect, it } from 'vitest'
import { collectPreflightFindings, formatPreflightSummary, type PreflightFinding } from '../../src/preflight'

function byId(findings: PreflightFinding[], id: string): PreflightFinding {
  const finding = findings.find(f => f.id === id)
  if (!finding) throw new Error(`missing finding: ${id}`)
  return finding
}

describe('collectPreflightFindings', () => {
  it('passes on a fully configured environment', () => {
    const findings = collectPreflightFindings({
      env: {
        BETTER_AUTH_SECRET: 'a'.repeat(44),
        SITE_URL: 'https://app.example.com',
        RESEND_API_KEY: 're_123',
        POLAR_ORGANIZATION_TOKEN: 'polar_oat_123',
      },
      siteUrlConfigured: true,
    })
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
  ])('fails on a weak Better Auth secret (%s)', (_label, secret) => {
    const findings = collectPreflightFindings({ env: { BETTER_AUTH_SECRET: secret }, siteUrlConfigured: true })
    expect(byId(findings, 'better-auth-secret').status).toBe('fail')
  })

  it('only warns when the Better Auth secret is not visible locally', () => {
    const findings = collectPreflightFindings({ env: {}, siteUrlConfigured: true })
    const finding = byId(findings, 'better-auth-secret')
    expect(finding.status).toBe('warn')
    expect(finding.message).toContain('Convex deployment')
  })

  it.each(['not a url', 'ftp://example.com', 'app.example.com'])(
    'fails on an invalid SITE_URL (%s)',
    (siteUrl) => {
      const findings = collectPreflightFindings({ env: { SITE_URL: siteUrl }, siteUrlConfigured: true })
      expect(byId(findings, 'site-url').status).toBe('fail')
    },
  )

  it('treats missing email/billing env as a designed no-op, never a warning', () => {
    const findings = collectPreflightFindings({ env: {}, siteUrlConfigured: true })
    expect(byId(findings, 'email-env').status).toBe('pass')
    expect(byId(findings, 'billing-env').status).toBe('pass')
    expect(byId(findings, 'email-env').message).toContain('no-op')
  })
})

describe('formatPreflightSummary', () => {
  it('summarizes a healthy environment with unconfigured integrations', () => {
    const findings = collectPreflightFindings({
      env: { BETTER_AUTH_SECRET: 'a'.repeat(44) },
      siteUrlConfigured: true,
    })
    expect(formatPreflightSummary(findings)).toBe('auth ✓ · unconfigured (no-op): email, billing')
  })

  it('counts problems', () => {
    const findings = collectPreflightFindings({ env: { BETTER_AUTH_SECRET: 'weak' }, siteUrlConfigured: false })
    expect(formatPreflightSummary(findings)).toContain('2 findings')
  })
})
