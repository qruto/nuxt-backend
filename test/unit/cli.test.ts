import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runCommand } from 'citty'
import { main } from '../../src/cli/main'
import { scaffoldBackendFiles } from '../../src/scaffold'
import { FEATURES } from '../../src/templates'

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
})

describe('add', () => {
  it('scaffolds exactly the feature files', async () => {
    await run(['add', 'search'])
    expect(existsSync(join(rootDir, 'backend/search.ts'))).toBe(true)
    expect(existsSync(join(rootDir, 'backend/billing.ts'))).toBe(false)
  })

  it('rejects unknown features with the available list', async () => {
    await run(['add', 'blockchain'])
    expect(process.exitCode).toBe(1)
  })

  it('covers every feature in the FEATURES map', async () => {
    for (const feature of Object.keys(FEATURES)) {
      await run(['add', feature])
    }
    for (const files of Object.values(FEATURES)) {
      for (const file of files) {
        expect(existsSync(join(rootDir, 'backend', file))).toBe(true)
      }
    }
  })
})

describe('doctor', () => {
  it('reports findings as json and flags missing codegen', async () => {
    await run(['doctor', '--json'])

    const output = vi.mocked(console.log).mock.calls.flat().join('\n')
    const report = JSON.parse(output) as { findings: Array<{ id: string, status: string }> }
    const codegen = report.findings.find(finding => finding.id === 'convex-codegen')
    expect(codegen?.status).toBe('warn')
    expect(report.findings.some(finding => finding.id === 'better-auth-secret')).toBe(true)
  })

  it('reads env from .env.local (weak secret fails, exit code 1)', async () => {
    writeFileSync(join(rootDir, '.env.local'), 'BETTER_AUTH_SECRET=changeme\n')

    await run(['doctor', '--json'])

    const output = vi.mocked(console.log).mock.calls.flat().join('\n')
    const report = JSON.parse(output) as { findings: Array<{ id: string, status: string }> }
    expect(report.findings.find(finding => finding.id === 'better-auth-secret')?.status).toBe('fail')
    expect(process.exitCode).toBe(1)
  })
})
