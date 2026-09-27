import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { parseEnvFile } from '../../src/deployment'
import {
  buildDevtoolsInfo,
  computeDeployment,
  computeDevtoolsPages,
  computeMcpStatus,
  envTier,
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

describe('envTier', () => {
  it('reduces the two-tier env contract to presence booleans', () => {
    const env: Record<string, string> = { AUTH_SECRET: 'x', EMAIL_API_KEY: 'y' }
    const tier = envTier(name => Boolean(env[name]))

    expect(tier.required).toEqual({ AUTH_SECRET: true, SITE_URL: false })
    expect(tier.optional.EMAIL_API_KEY).toBe(true)
    expect(tier.optional.BILLING_ACCESS_TOKEN).toBe(false)
    // Every optional-tier var is reported, none invented.
    expect(Object.keys(tier.optional)).toContain('BILLING_ENVIRONMENT')
  })
})

describe('computeDeployment', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'nuxt-backend-devtools-deployment-'))
  afterAll(() => rmSync(rootDir, { recursive: true, force: true }))

  it('names the kind from the deployment id, with the cloud dashboard', () => {
    expect(computeDeployment(rootDir, { CONVEX_DEPLOYMENT: 'dev:brave-fox-123' })).toEqual({
      kind: 'cloud-dev',
      id: 'dev:brave-fox-123',
      url: 'https://brave-fox-123.convex.cloud',
      siteUrl: 'https://brave-fox-123.convex.site',
      dashboardUrl: 'https://dashboard.convex.dev/d/brave-fox-123',
    })
    expect(computeDeployment(rootDir, { CONVEX_DEPLOYMENT: 'prod:steady-owl-456' })).toMatchObject({ kind: 'production', dashboardUrl: 'https://dashboard.convex.dev/d/steady-owl-456' })
    expect(computeDeployment(rootDir, { CONVEX_DEPLOYMENT: 'preview:branch-1' })).toMatchObject({ kind: 'preview' })
  })

  it('knows a local backend by the URLs the CLI wrote, and gives it no dashboard', () => {
    const local = computeDeployment(rootDir, { CONVEX_DEPLOYMENT: 'anonymous:anonymous-agent', CONVEX_URL: 'http://127.0.0.1:3210', CONVEX_SITE_URL: 'http://127.0.0.1:3211' })
    expect(local).toEqual({ kind: 'anonymous', id: 'anonymous:anonymous-agent', url: 'http://127.0.0.1:3210', siteUrl: 'http://127.0.0.1:3211' })
    expect(computeDeployment(rootDir, { CONVEX_DEPLOYMENT: 'local:my-app' }).kind).toBe('local')
  })

  it('reports a self-hosted backend and no deployment at all', () => {
    expect(computeDeployment(rootDir, { CONVEX_SELF_HOSTED_URL: 'https://convex.example.com/' })).toEqual({ kind: 'self-hosted', url: 'https://convex.example.com' })
    expect(computeDeployment(rootDir, {})).toEqual({ kind: 'none' })
  })
})

describe('computeMcpStatus', () => {
  it('lists every built-in tool with its scope, and every scope', () => {
    const status = computeMcpStatus({ route: '/mcp' })
    expect(status).toMatchObject({ enabled: true, route: '/mcp', exchangePath: '/mcp/exchange' })
    expect(status.tools).toHaveLength(9)
    expect(status.tools.every(tool => tool.enabled)).toBe(true)
    expect(status.scopes).toContain('billing:checkout')
  })

  it('gives each tool the scope its own tool file declares', () => {
    const toolsDir = join(process.cwd(), 'src/runtime/server/mcp/tools')
    for (const tool of computeMcpStatus({ route: '/mcp' }).tools) {
      const source = readFileSync(join(toolsDir, `${tool.name}.ts`), 'utf-8')
      expect(source, tool.name).toContain(`scope: '${tool.scope}'`)
    }
  })

  it('applies per-tool disables and the builtin:false wipe', () => {
    const trimmed = computeMcpStatus({ route: '/mcp', builtin: { 'billing-portal-link': false } })
    expect(trimmed.tools.filter(tool => !tool.enabled).map(tool => tool.name)).toEqual(['billing-portal-link'])
    expect(computeMcpStatus({ route: '/mcp', builtin: false }).tools.every(tool => !tool.enabled)).toBe(true)
  })

  it('is fully off when the surface is disabled', () => {
    expect(computeMcpStatus(null)).toEqual({ enabled: false, tools: [], scopes: [] })
  })
})

describe('buildDevtoolsInfo', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'nuxt-backend-devtools-info-'))
  afterAll(() => rmSync(rootDir, { recursive: true, force: true }))

  const input = (env: Record<string, string | undefined>, extra: Partial<BuildDevtoolsInfoInput> = {}): BuildDevtoolsInfoInput => ({
    rootDir,
    env,
    siteUrlConfigured: true,
    options: { installation: 'default', scaffold: 'auto', authRoute: '/api/auth' },
    pages: [{ key: 'login', path: '/login', auth: false, shadowed: false }],
    mcp: { route: '/mcp' },
    versions: { 'nuxt-backend': '0.1.0' },
    functionsDir: 'backend',
    deploymentEnv: null,
    provisionedNames: undefined,
    ...extra,
  })

  it('never leaks env values — only presence booleans and findings cross the RPC', () => {
    const sentinels = {
      AUTH_SECRET: 'sentinel-auth-secret-value-0123456789abcdef',
      EMAIL_API_KEY: 'sentinel-email-key-value',
      EMAIL_WEBHOOK_SECRET: 'sentinel-email-webhook-value',
      BILLING_ACCESS_TOKEN: 'sentinel-billing-token-value',
      BILLING_WEBHOOK_SECRET: 'sentinel-billing-webhook-value',
      CONVEX_DEPLOY_KEY: 'dev:brave-fox-123|sentinel-deploy-key-value',
      SOME_UNRELATED_TOKEN: 'sentinel-unrelated-value',
    }
    // The module hands over the env files merged under the process env, the
    // way Nuxt reads them: a secret in .env.local must not leak either.
    writeFileSync(join(rootDir, '.env.local'), 'EMAIL_FROM=sentinel-from@example.com\n')
    const env = { ...parseEnvFile(readFileSync(join(rootDir, '.env.local'), 'utf-8')), ...sentinels, SITE_URL: 'https://app.example.com', CONVEX_DEPLOYMENT: 'dev:brave-fox-123' }
    const deploymentEnv = { status: 'ok' as const, readAt: 1, names: envTier(() => true) }
    const info = buildDevtoolsInfo(input(env, { deploymentEnv }))

    const serialized = JSON.stringify(info)
    for (const value of [...Object.values(sentinels), 'sentinel-from@example.com']) {
      expect(serialized).not.toContain(value)
    }
    expect(info.env.visible.required).toEqual({ AUTH_SECRET: true, SITE_URL: true })
    expect(info.env.visible.optional.EMAIL_FROM).toBe(true)
    expect(info.env.deployment).toEqual(deploymentEnv)
    // Vars outside the deployment contract are not reported at all.
    expect(serialized).not.toContain('SOME_UNRELATED_TOKEN')
  })

  it('collects live preflight findings with the mcp finding included', () => {
    const info = buildDevtoolsInfo(input({}))
    expect(info.findings.some(finding => finding.id === 'mcp' && finding.status === 'pass')).toBe(true)
    expect(info.findings.find(finding => finding.id === 'auth-secret')?.status).toBe('warn')
  })

  it('counts a name set on the deployment as set, from a read or from env push', () => {
    const read = { status: 'ok' as const, readAt: 1, names: envTier(name => name === 'AUTH_SECRET' || name === 'EMAIL_API_KEY') }
    const fromRead = buildDevtoolsInfo(input({}, { deploymentEnv: read }))
    expect(fromRead.findings.find(finding => finding.id === 'auth-secret')?.status).toBe('pass')
    expect(fromRead.findings.find(finding => finding.id === 'email-transport')?.status).toBe('pass')
    expect(fromRead.findings.find(finding => finding.id === 'site-url')?.status).toBe('warn')

    const fromPush = buildDevtoolsInfo(input({}, { provisionedNames: new Set(['AUTH_SECRET', 'SITE_URL']) }))
    expect(fromPush.findings.find(finding => finding.id === 'site-url')?.status).toBe('pass')
  })

  it('snapshots options as wiring flags, and the deployment', () => {
    const info = buildDevtoolsInfo(input({ CONVEX_DEPLOYMENT: 'dev:brave-fox-123' }))
    expect(info.options).toEqual({
      installation: 'default',
      scaffold: true,
      css: true,
      autoEnv: true,
      workspaces: true,
      authRoute: '/api/auth',
      loginPath: null,
      pagesEnabled: true,
    })
    expect(info.deployment).toMatchObject({ kind: 'cloud-dev', id: 'dev:brave-fox-123' })
    expect(info.mcp).toMatchObject({ enabled: true, route: '/mcp' })
  })

  it('reflects disabled wiring in the snapshot', () => {
    const info = buildDevtoolsInfo({
      ...input({}),
      options: { scaffold: false, css: false, autoEnv: false, loginPath: '/signin', pages: false, workspaces: false },
      mcp: null,
    })
    expect(info.options).toMatchObject({
      scaffold: false,
      css: false,
      autoEnv: false,
      workspaces: false,
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
