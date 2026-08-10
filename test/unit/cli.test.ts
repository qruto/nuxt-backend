import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runCommand } from 'citty'
import { main } from '../../src/cli/main'
import { scaffoldBackendFiles } from '../../src/scaffold'

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
    expect(readFileSync(join(rootDir, '.env.example'), 'utf-8')).toContain('NUXT_PUBLIC_CONVEX_URL')
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
  // The first doctor run pays a cold-start cost (~4s locally) that overshoots
  // the 5s default on CI runners.
  it('reports findings as json and flags missing codegen', async () => {
    await run(['doctor', '--json'])

    const output = vi.mocked(console.log).mock.calls.flat().join('\n')
    const report = JSON.parse(output) as { findings: Array<{ id: string, status: string }> }
    const codegen = report.findings.find(finding => finding.id === 'convex-codegen')
    expect(codegen?.status).toBe('warn')
    expect(report.findings.some(finding => finding.id === 'auth-secret')).toBe(true)
  }, 30_000)

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
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(report.findings.find(finding => finding.id === 'billing-webhook-route')?.status).toBe('pass')
    expect(report.findings.find(finding => finding.id === 'email-webhook-route')?.status).toBe('fail')
    expect(process.exitCode).toBe(1)
  }, 30_000)
})
