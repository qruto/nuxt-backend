import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runCommand } from 'citty'
import { lastRunPath } from '../../src/analyze/report'
import type { AnalyzeReport, BundleReport } from '../../src/analyze/types'
import { COMMAND_CONTRACTS } from '../../src/cli/contract'
import { main } from '../../src/cli/main'

// The analyzer and the Nuxt build, which the command runs: nothing here bundles or builds.
const measured = vi.hoisted(() => ({ convex: vi.fn(), nuxt: vi.fn() }))
vi.mock('../../src/analyze/convex', async original => ({ ...await original<typeof import('../../src/analyze/convex')>(), analyzeConvex: measured.convex }))
vi.mock('../../src/analyze/nuxt', async original => ({ ...await original<typeof import('../../src/analyze/nuxt')>(), analyzeNuxt: measured.nuxt }))

let rootDir: string

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'nuxt-backend-analyze-cli-'))
  measured.convex.mockReset()
  measured.nuxt.mockReset()
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
  vi.restoreAllMocks()
  process.exitCode = undefined
})

const bundle = (id: BundleReport['id'], bytes: number, packages: Array<[string, number]> = []): BundleReport => ({
  id,
  title: `${id} bundle`,
  bytes,
  parts: [],
  packages: packages.map(([name, size]) => ({ name, bytes: size })),
  shares: [],
  insights: [],
  notes: [],
})

describe('the analyze command', () => {
  const run = (args: string[]) => runCommand(main, { rawArgs: ['analyze', ...args, '--cwd', rootDir] })
  let out: string[]
  let err: string[]

  beforeEach(() => {
    out = []
    err = []
    vi.spyOn(console, 'log').mockImplementation((...lines: unknown[]) => void out.push(lines.join(' ')))
    vi.spyOn(console, 'error').mockImplementation((...lines: unknown[]) => void err.push(lines.join(' ')))
    measured.convex.mockResolvedValue({ ...bundle('convex', 5_000_000, [['zod', 1_000_000]]), title: 'Convex bundle' })
    measured.nuxt.mockResolvedValue([{ ...bundle('client', 300_000), title: 'Nuxt client bundle' }, { ...bundle('server', 900_000), title: 'Nuxt server bundle' }])
  })

  it('is declared with a contract that says it reads only', () => {
    expect(COMMAND_CONTRACTS.get('analyze')).toMatchObject({ sideEffects: ['reads only'] })
  })

  it('prints a section per bundle and exits 0 within its budgets', async () => {
    await run(['--max-convex', '8MB', '--max-client', '350kB'])
    expect(out.join('\n')).toContain('Convex bundle')
    expect(out.join('\n')).toContain('every bundle is within its budget (convex 8.00 MB, client 350 kB)')
    expect(process.exitCode).toBeUndefined()
  })

  it('exits 1 over a budget, and names what is over', async () => {
    await run(['--max-convex', '4MB'])
    expect(err.join('\n')).toContain('over budget: convex bundle is 5.00 MB, 1.00 MB over --max-convex 4.00 MB')
    expect(process.exitCode).toBe(1)
  })

  it('prints the report as one JSON document with --json', async () => {
    await run(['--json', '--only', 'convex'])
    const printed = JSON.parse(out.join('\n')) as AnalyzeReport
    expect(printed).toMatchObject({ version: 1, failures: [] })
    expect(printed.bundles.map(item => item.id)).toEqual(['convex'])
    expect(measured.nuxt).not.toHaveBeenCalled()
  })

  it('exits 1 when a half could not be measured', async () => {
    measured.convex.mockRejectedValue(new Error('backend/_generated/ is missing'))
    await run([])
    expect(out.join('\n')).toContain('Not measured')
    expect(process.exitCode).toBe(1)
  })

  it('refuses what it cannot do before measuring anything', async () => {
    await run(['--only', 'both'])
    expect(err.join('\n')).toContain('--only takes convex or nuxt, not "both"')
    await run(['--max-client', 'big'])
    expect(err.join('\n')).toContain('--max-client takes a size such as 8MB or 350kB, not "big"')
    await run(['--only', 'convex', '--max-server', '1MB'])
    expect(err.join('\n')).toContain('--max-server needs the Nuxt build: drop --only convex')
    await run(['--only', 'nuxt', '--max-convex', '1MB'])
    expect(err.join('\n')).toContain('--max-convex needs the Convex bundle: drop --only nuxt')
    expect(process.exitCode).toBe(1)
    expect(measured.convex).not.toHaveBeenCalled()
  })

  it('writes the run where doctor reads it', async () => {
    await run(['--only', 'convex'])
    expect(JSON.parse(readFileSync(lastRunPath(rootDir), 'utf-8')).bundles[0]).toMatchObject({ id: 'convex' })
  })
})
