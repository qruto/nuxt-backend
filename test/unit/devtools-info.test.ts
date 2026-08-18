import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  buildDevtoolsInfo,
  collectEnvPresence,
  computeDevtoolsPages,
  computeMcpStatus,
  resolveBackendSource,
  type BuildDevtoolsInfoInput,
} from '../../src/devtools/info'
import { resolvedBackendPages } from '../../src/pages'

describe('computeDevtoolsPages', () => {
  it('flags pages whose path an app page already occupies', () => {
    const resolved = resolvedBackendPages(undefined)
    const pages = computeDevtoolsPages(resolved, new Set(['/login', '/settings']))

    expect(pages.find(page => page.key === 'login')).toEqual(
      { key: 'login', path: '/login', auth: false, shadowed: true },
    )
    expect(pages.find(page => page.key === 'settings')).toMatchObject({ auth: true, shadowed: true })
    expect(pages.find(page => page.key === 'pricing')).toMatchObject({ path: '/pricing', shadowed: false })
  })

  it('omits disabled pages and honors custom paths', () => {
    const resolved = resolvedBackendPages({ profile: false, login: '/sign-in' })
    const pages = computeDevtoolsPages(resolved, new Set(['/sign-in']))

    expect(pages.some(page => page.key === 'profile')).toBe(false)
    expect(pages.find(page => page.key === 'login')).toMatchObject({ path: '/sign-in', shadowed: true })
  })

  it('is empty when the whole page set is off', () => {
    expect(computeDevtoolsPages(resolvedBackendPages(false), new Set())).toEqual([])
  })
})

describe('collectEnvPresence', () => {
  it('reduces the two-tier env contract to presence booleans', () => {
    const presence = collectEnvPresence({ AUTH_SECRET: 'x', EMAIL_API_KEY: 'y' })

    expect(presence.required).toEqual({ AUTH_SECRET: true, SITE_URL: false })
    expect(presence.optional.EMAIL_API_KEY).toBe(true)
    expect(presence.optional.BILLING_ACCESS_TOKEN).toBe(false)
    // Every optional-tier var is reported, none invented.
    expect(Object.keys(presence.optional)).toContain('BILLING_ENVIRONMENT')
  })
})

describe('computeMcpStatus', () => {
  it('reports the enabled surface with the full built-in tool set', () => {
    const status = computeMcpStatus({ route: '/mcp' })
    expect(status.enabled).toBe(true)
    expect(status.route).toBe('/mcp')
    expect(status.builtinTools).toContain('credits-balance')
    expect(status.builtinTools).toHaveLength(9)
  })

  it('applies per-tool disables and the builtin:false wipe', () => {
    const trimmed = computeMcpStatus({ route: '/mcp', builtin: { 'billing-portal-link': false } })
    expect(trimmed.builtinTools).not.toContain('billing-portal-link')
    expect(trimmed.builtinTools).toHaveLength(8)

    expect(computeMcpStatus({ route: '/mcp', builtin: false }).builtinTools).toEqual([])
  })

  it('is fully off when the surface is disabled', () => {
    expect(computeMcpStatus(null)).toEqual({ enabled: false, builtinTools: [] })
  })
})

describe('buildDevtoolsInfo', () => {
  const input = (env: Record<string, string | undefined>): BuildDevtoolsInfoInput => ({
    env,
    siteUrlConfigured: true,
    options: { installation: 'default', scaffold: 'auto', authRoute: '/api/auth' },
    pages: [{ key: 'login', path: '/login', auth: false, shadowed: false }],
    appConfig: { billing: { plans: [{ key: 'pro', credits: 500 }], packs: [] }, brand: { name: 'Acme' } },
    mcp: { route: '/mcp' },
    versions: { 'nuxt-backend': '0.1.0' },
    functionsDir: 'backend',
  })

  it('never leaks env values — only presence booleans and findings cross the RPC', () => {
    const sentinels = {
      AUTH_SECRET: 'sentinel-auth-secret-value-0123456789abcdef',
      EMAIL_API_KEY: 'sentinel-email-key-value',
      EMAIL_WEBHOOK_SECRET: 'sentinel-email-webhook-value',
      BILLING_ACCESS_TOKEN: 'sentinel-billing-token-value',
      BILLING_WEBHOOK_SECRET: 'sentinel-billing-webhook-value',
      SOME_UNRELATED_TOKEN: 'sentinel-unrelated-value',
    }
    const info = buildDevtoolsInfo(input({ ...sentinels, SITE_URL: 'https://app.example.com' }))

    const serialized = JSON.stringify(info)
    for (const value of Object.values(sentinels)) {
      expect(serialized).not.toContain(value)
    }
    expect(info.env.required).toEqual({ AUTH_SECRET: true, SITE_URL: true })
    expect(info.env.optional.EMAIL_API_KEY).toBe(true)
    // Vars outside the deployment contract are not reported at all.
    expect(serialized).not.toContain('SOME_UNRELATED_TOKEN')
  })

  it('collects live preflight findings with the mcp finding included', () => {
    const info = buildDevtoolsInfo(input({}))
    expect(info.findings.some(finding => finding.id === 'mcp' && finding.status === 'pass')).toBe(true)
    expect(info.findings.find(finding => finding.id === 'auth-secret')?.status).toBe('warn')
  })

  it('snapshots options as wiring flags and passes the content layer through', () => {
    const info = buildDevtoolsInfo(input({}))
    expect(info.options).toEqual({
      installation: 'default',
      scaffold: true,
      css: true,
      autoEnv: true,
      authRoute: '/api/auth',
      loginPath: null,
      pagesEnabled: true,
    })
    expect(info.appConfig.billing.plans).toEqual([{ key: 'pro', credits: 500 }])
    expect(info.appConfig.brand.name).toBe('Acme')
    expect(info.mcp).toEqual({ enabled: true, route: '/mcp', builtinTools: expect.any(Array) })
  })

  it('reflects disabled wiring in the snapshot', () => {
    const info = buildDevtoolsInfo({
      ...input({}),
      options: { scaffold: false, css: false, autoEnv: false, loginPath: '/signin', pages: false },
      mcp: null,
    })
    expect(info.options).toMatchObject({
      scaffold: false,
      css: false,
      autoEnv: false,
      loginPath: '/signin',
      pagesEnabled: false,
    })
    expect(info.mcp.enabled).toBe(false)
    expect(info.findings.some(finding => finding.id === 'mcp')).toBe(false)
  })
})

describe('resolveBackendSource', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'nuxt-backend-devtools-source-'))
  const functionsDir = 'backend'
  const base = join(rootDir, functionsDir)

  mkdirSync(join(base, 'lib'), { recursive: true })
  writeFileSync(join(base, 'billing.ts'), '')
  writeFileSync(join(base, 'legacy.js'), '')
  writeFileSync(join(base, 'lib', 'shared.ts'), '')

  afterAll(() => rmSync(rootDir, { recursive: true, force: true }))

  it('maps a file name (extension optional) into the functions dir', () => {
    expect(resolveBackendSource(rootDir, functionsDir, 'billing.ts'))
      .toEqual({ filepath: join(base, 'billing.ts') })
    expect(resolveBackendSource(rootDir, functionsDir, 'billing'))
      .toEqual({ filepath: join(base, 'billing.ts') })
    expect(resolveBackendSource(rootDir, functionsDir, 'legacy'))
      .toEqual({ filepath: join(base, 'legacy.js') })
    expect(resolveBackendSource(rootDir, functionsDir, 'lib/shared'))
      .toEqual({ filepath: join(base, 'lib', 'shared.ts') })
  })

  it('returns {} for unknown files', () => {
    expect(resolveBackendSource(rootDir, functionsDir, 'missing.ts')).toEqual({})
  })

  it('rejects traversal and degenerate paths — the name crosses the RPC', () => {
    expect(resolveBackendSource(rootDir, functionsDir, '../package.json')).toEqual({})
    expect(resolveBackendSource(rootDir, functionsDir, 'lib/../../secrets')).toEqual({})
    expect(resolveBackendSource(rootDir, functionsDir, './billing.ts')).toEqual({})
    expect(resolveBackendSource(rootDir, functionsDir, '')).toEqual({})
  })
})
