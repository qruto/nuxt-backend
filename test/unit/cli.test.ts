import { mkdirSync, mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runCommand } from 'citty'
import { organizationsListOrganizations } from '@polar-sh/sdk/funcs/organizationsListOrganizations.js'
import { main } from '../../src/cli/main'
import { scaffoldBackendFiles } from '../../src/scaffold'

vi.mock('@polar-sh/sdk/funcs/organizationsListOrganizations.js', () => ({ organizationsListOrganizations: vi.fn() }))

let rootDir: string

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'nuxt-backend-cli-'))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
  vi.restoreAllMocks()
  process.exitCode = undefined
})

async function run(args: string[]) {
  await runCommand(main, { rawArgs: [...args, '--cwd', rootDir] })
}

describe('scaffoldBackendFiles options', () => {
  it('scaffolds only the requested files subset', () => {
    scaffoldBackendFiles(rootDir, { files: ['billing.ts'], log: () => {} })
    expect(existsSync(join(rootDir, 'backend/billing.ts'))).toBe(true)
    expect(existsSync(join(rootDir, 'backend/auth.ts'))).toBe(false)
    // Subset scaffolds never write convex.json (init owns that).
    expect(existsSync(join(rootDir, 'convex.json'))).toBe(false)
  })

  it('never overwrites without force', () => {
    scaffoldBackendFiles(rootDir, { files: ['billing.ts'], log: () => {} })
    const target = join(rootDir, 'backend/billing.ts')
    writeFileSync(target, '// customized')

    scaffoldBackendFiles(rootDir, { files: ['billing.ts'], log: () => {} })
    expect(readFileSync(target, 'utf-8')).toBe('// customized')

    scaffoldBackendFiles(rootDir, { files: ['billing.ts'], force: true, log: () => {} })
    expect(readFileSync(target, 'utf-8')).not.toBe('// customized')
  })
})

describe('init', () => {
  it('scaffolds everything, writes .env.example, and wires nuxt.config', async () => {
    writeFileSync(join(rootDir, 'nuxt.config.ts'), 'export default defineNuxtConfig({})\n')

    await run(['init'])

    expect(existsSync(join(rootDir, 'backend/convex.config.ts'))).toBe(true)
    expect(existsSync(join(rootDir, 'backend/functions.ts'))).toBe(true)
    expect(readFileSync(join(rootDir, '.env.example'), 'utf-8')).toContain('nuxt-backend env push')
    expect(readFileSync(join(rootDir, 'nuxt.config.ts'), 'utf-8')).toContain('nuxt-backend')
  })

  it('falls back to printed instructions without a nuxt.config', async () => {
    await run(['init'])
    expect(existsSync(join(rootDir, 'backend/auth.ts'))).toBe(true)
    const logs = vi.mocked(console.log).mock.calls.flat().join('\n')
    expect(logs).toContain('Add the module yourself')
  })

  it('re-running init repairs missing files without touching customized ones', async () => {
    await run(['init'])

    const authPath = join(rootDir, 'backend/auth.ts')
    writeFileSync(authPath, '// customized')
    rmSync(join(rootDir, 'backend/billing.ts'))

    await run(['init'])

    expect(existsSync(join(rootDir, 'backend/billing.ts'))).toBe(true)
    expect(readFileSync(authPath, 'utf-8')).toBe('// customized')
  })
})

describe('doctor', () => {
  // The temp dir has no `convex` installed, so the deployment probes resolve
  // to "unreachable" at once — nothing is fetched from the registry.
  it('reports findings as json and flags missing codegen', async () => {
    await run(['doctor', '--json'])

    const output = vi.mocked(console.log).mock.calls.flat().join('\n')
    const report = JSON.parse(output) as { findings: Array<{ id: string, status: string }> }
    const codegen = report.findings.find(finding => finding.id === 'convex-codegen')
    expect(codegen?.status).toBe('warn')
    expect(report.findings.some(finding => finding.id === 'auth-secret')).toBe(true)
  })

  it('reads env from .env.local (weak secret fails, exit code 1)', async () => {
    writeFileSync(join(rootDir, '.env.local'), 'AUTH_SECRET=changeme\n')

    await run(['doctor', '--json'])

    const output = vi.mocked(console.log).mock.calls.flat().join('\n')
    const report = JSON.parse(output) as { findings: Array<{ id: string, status: string }> }
    expect(report.findings.find(finding => finding.id === 'auth-secret')?.status).toBe('fail')
    expect(process.exitCode).toBe(1)
  })

  it('probes webhook routes when a site URL is configured', async () => {
    writeFileSync(join(rootDir, '.env.local'), 'NUXT_PUBLIC_CONVEX_SITE_URL=https://demo.convex.site\n')
    const fetchMock = vi.fn(async (url: string | URL) => {
      // Billing mounted (empty probe rejected by signature check), email not.
      return String(url).includes('/billing/events')
        ? new Response('bad signature', { status: 400 })
        : new Response('not found', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    try {
      await run(['doctor', '--json'])
    }
    finally {
      vi.unstubAllGlobals()
    }

    const output = vi.mocked(console.log).mock.calls.flat().join('\n')
    const report = JSON.parse(output) as { findings: Array<{ id: string, status: string }> }
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(report.findings.find(finding => finding.id === 'billing-webhook-route')?.status).toBe('pass')
    expect(report.findings.find(finding => finding.id === 'email-webhook-route')?.status).toBe('fail')
    expect(report.findings.find(finding => finding.id === 'ai-stream-route')?.status).toBe('fail')
    expect(process.exitCode).toBe(1)
  })
})

describe('doctor — billing catalog', () => {
  // The catalog is imported for real (that is how `billing sync` reads it), so
  // the fixture stays import-free: `defineBillingCatalog` is identity anyway.
  function writeCatalog(source: string) {
    mkdirSync(join(rootDir, 'backend'), { recursive: true })
    writeFileSync(join(rootDir, 'backend/billing.catalog.ts'), source)
  }

  async function doctorFindings(): Promise<Array<{ id: string, status: string, message: string }>> {
    await run(['doctor', '--json'])
    const output = vi.mocked(console.log).mock.calls.flat().join('\n')
    return (JSON.parse(output) as { findings: Array<{ id: string, status: string, message: string }> }).findings
  }

  /** Every finding id the catalog cross-checks can produce. */
  const CATALOG_FINDINGS = [
    'billing-meter-usage',
    'billing-organization',
    'billing-multiple-subscriptions',
    'billing-proration',
    'billing-benefit-grace',
    'billing-trial-abuse',
    'billing-portal',
    'billing-feature-benefits',
  ]

  it('says nothing about billing when no catalog is declared', async () => {
    const findings = await doctorFindings()
    expect(findings.filter(finding => CATALOG_FINDINGS.includes(finding.id))).toEqual([])
  })

  it('checks the catalog alone when no access token is visible, and skips the provider half', async () => {
    writeCatalog('export default { meters: { credits: {}, tokens: {} }, plans: { pro: { name: \'Pro\', interval: \'month\', price: 2900, credits: { meter: \'credits\', units: 500 } } } }\n')

    const findings = await doctorFindings()

    // Nothing grants or bills `tokens`.
    expect(findings.find(finding => finding.id === 'billing-meter-usage')?.status).toBe('warn')
    expect(findings.some(finding => finding.id === 'billing-organization')).toBe(false)
    expect(findings.some(finding => finding.id === 'billing-proration')).toBe(false)
  })

  it('reports the provider checks as skipped when the token is refused', async () => {
    writeCatalog('export default { plans: { pro: { name: \'Pro\', interval: \'month\', price: 2900 } } }\n')
    writeFileSync(join(rootDir, '.env.local'), 'BILLING_ACCESS_TOKEN=polar_oat_expired\n')
    vi.mocked(organizationsListOrganizations).mockResolvedValue({ ok: false, error: new Error('401 Unauthorized') } as never)

    const findings = await doctorFindings()

    const organization = findings.find(finding => finding.id === 'billing-organization')
    expect(organization?.status).toBe('warn')
    expect(organization?.message).toContain('BILLING_ACCESS_TOKEN')
    expect(findings.some(finding => finding.id === 'billing-portal')).toBe(false)
  })
})
