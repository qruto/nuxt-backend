import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runCommand } from 'citty'
import { main } from '../../src/cli/main'
import type { BillingResyncReport } from '../../src/cli/billing/resync'
import { ConvexCliError, runConvex } from '../../src/convex-cli'

// `nuxt-backend billing resync`: the CLI half. It queues the deployment's
// `billing:resyncEntitlements` and says what the first page queued; the
// paging and each entity's read run in
// test/convex-component/billing-accounts.test.ts. The deployment is a stub
// of `convex run`.

vi.mock('../../src/convex-cli', async importOriginal => ({ ...await importOriginal<typeof import('../../src/convex-cli')>(), runConvex: vi.fn() }))

let dir: string
let stdout: string[]
let stderr: string[]

beforeEach(() => {
  for (const name of ['CONVEX_DEPLOY_KEY', 'CONVEX_DEPLOYMENT']) vi.stubEnv(name, undefined)
  dir = mkdtempSync(join(tmpdir(), 'nuxt-backend-resync-'))
  vi.mocked(runConvex).mockReset()
  stdout = []
  stderr = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void stdout.push(args.map(String).join(' ')))
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void stderr.push(args.map(String).join(' ')))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  process.exitCode = undefined
})

async function resync(...args: string[]): Promise<BillingResyncReport> {
  await runCommand(main, { rawArgs: ['billing', 'resync', ...args, '--cwd', dir, '--json'] })
  return JSON.parse(stdout.join('\n')) as BillingResyncReport
}

describe('billing resync', () => {
  it('queues every billing entity on the dev deployment, and says the first page\'s count', async () => {
    vi.mocked(runConvex).mockResolvedValueOnce({ stdout: JSON.stringify({ queued: 100, more: true }), stderr: '' })
    expect(await resync()).toEqual({ deployment: 'dev', status: 'queued', queued: 100, more: true })
    expect(vi.mocked(runConvex).mock.calls.map(([, args]) => args)).toEqual([['run', 'billing:resyncEntitlements', '{}']])
    expect(stderr.join('\n')).toContain('queued 100 billing entities on the dev deployment, and the pages after it follow on its scheduler')
    expect(process.exitCode).toBeUndefined()
  })

  it('resyncs production with --prod and a production key', async () => {
    vi.stubEnv('CONVEX_DEPLOY_KEY', `prod:app|${randomBytes(8).toString('hex')}`)
    vi.mocked(runConvex).mockResolvedValueOnce({ stdout: JSON.stringify({ queued: 1, more: false }), stderr: '' })
    expect(await resync('--prod')).toMatchObject({ deployment: 'production', status: 'queued', queued: 1 })
    expect(vi.mocked(runConvex).mock.calls[0]![1]).toEqual(['run', '--prod', 'billing:resyncEntitlements', '{}'])
  })

  it('names the export an app scaffolded before it lacks, and fails', async () => {
    vi.mocked(runConvex).mockRejectedValueOnce(new ConvexCliError('convex run exited with code 1', { code: 1, signal: null, timedOut: false, stderrTail: '• billing:syncProducts', missingFunction: true }))
    const report = await resync()
    expect(report).toMatchObject({ status: 'missing', queued: 0 })
    expect(report.note).toContain('Add `resyncEntitlements` to the names billing.ts re-exports from `billing.api`')
    expect(process.exitCode).toBe(1)
  })

  it('fails when the deployment refuses it', async () => {
    vi.mocked(runConvex).mockRejectedValueOnce(new ConvexCliError('convex run exited with code 1: Billing is not configured', { code: 1, signal: null, timedOut: false, stderrTail: 'Billing is not configured' }))
    expect((await resync()).status).toBe('failed')
    expect(process.exitCode).toBe(1)
  })

  it.each([
    [[], 'prod', 'it would act on that deployment instead of the dev one'],
    [['--prod'], 'preview', 'would act on that deployment instead of production'],
  ])('refuses %j with a %s deploy key, before it runs anything', async (args, type, message) => {
    vi.stubEnv('CONVEX_DEPLOY_KEY', `${type}:app|${randomBytes(8).toString('hex')}`)
    await runCommand(main, { rawArgs: ['billing', 'resync', ...args, '--cwd', dir] })
    expect(stderr.join('\n')).toContain(message)
    expect(runConvex).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })
})
