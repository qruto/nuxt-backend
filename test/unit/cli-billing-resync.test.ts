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
    expect(await resync()).toEqual({ deployment: 'dev', status: 'queued', queued: 100, more: true, entities: [] })
    expect(vi.mocked(runConvex).mock.calls.map(([, args]) => args)).toEqual([['run', 'billing:resyncEntitlements', '{}']])
    expect(stderr.join('\n')).toContain('started on the dev deployment, 100 billing entities on its first page, and more pages after it. It reads them in turn, at most one a second')
    // Where its outcome shows: each entity given up on, and the tally at the end.
    expect(stderr.join('\n')).toContain('(billing.resync_failed) and, at the end, how many were read (billing.resync_done): npx convex logs --history 100')
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

  it('prints a refusal as its JSON report too, so a script reads why', async () => {
    vi.stubEnv('CONVEX_DEPLOY_KEY', `prod:app|${randomBytes(8).toString('hex')}`)
    const report = await resync()
    expect(report).toMatchObject({ deployment: 'dev', status: 'refused', queued: 0, more: false, entities: [] })
    expect(report.note).toContain('instead of the dev one')
    expect(stderr.join('\n')).toContain('billing resync refused:')
    expect(runConvex).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })

  it('pages nothing for an app that bills entities of its own, and says to name them', async () => {
    vi.mocked(runConvex).mockResolvedValueOnce({ stdout: '"custom_entities"', stderr: '' })
    const report = await resync()
    expect(report).toMatchObject({ status: 'custom_entities', queued: 0, more: false, entities: [] })
    expect(report.note).toContain('billing resync --entity <id>')
    expect(process.exitCode).toBe(1)
  })

  it('reads the entities --entity names, one at a time, and says which an erasure is deleting', async () => {
    vi.mocked(runConvex)
      .mockResolvedValueOnce({ stdout: '"synced"', stderr: '' })
      .mockResolvedValueOnce({ stdout: '"gone"', stderr: '' })
      .mockResolvedValueOnce({ stdout: '"synced"', stderr: '' })
    expect(await resync('--entity', 'team_1, team_2,team_3')).toEqual({
      deployment: 'dev',
      status: 'synced',
      queued: 0,
      more: false,
      entities: [{ id: 'team_1', outcome: 'synced' }, { id: 'team_2', outcome: 'gone' }, { id: 'team_3', outcome: 'synced' }],
    })
    expect(vi.mocked(runConvex).mock.calls.map(([, args]) => args.at(-1))).toEqual(['{"entityId":"team_1"}', '{"entityId":"team_2"}', '{"entityId":"team_3"}'])
    expect(stderr.join('\n')).toContain('read the entitlements of 2 billing entities again on the dev deployment')
    expect(stderr.join('\n')).toContain('left team_2 alone: an erasure is deleting it')
    expect(process.exitCode).toBeUndefined()
  })

  it('reads on past an entity the provider kept refusing, names it, and fails', async () => {
    vi.mocked(runConvex)
      .mockResolvedValueOnce({ stdout: '"failed"', stderr: '' })
      .mockResolvedValueOnce({ stdout: '"synced"', stderr: '' })
    const report = await resync('--entity', 'team_1,team_2')
    expect(report).toMatchObject({ status: 'failed', entities: [{ id: 'team_1', outcome: 'failed' }, { id: 'team_2', outcome: 'synced' }] })
    expect(report.note).toContain('the provider kept refusing team_1')
    expect(report.note).toContain('billing resync --entity team_1 again')
    expect(stderr.join('\n')).toContain('read the entitlements of 1 billing entity again')
    expect(process.exitCode).toBe(1)
  })

  it('keeps the entities read before one the deployment refused', async () => {
    vi.mocked(runConvex)
      .mockResolvedValueOnce({ stdout: '"synced"', stderr: '' })
      .mockRejectedValueOnce(new ConvexCliError('convex run exited with code 1: rate limited', { code: 1, signal: null, timedOut: false, stderrTail: 'rate limited' }))
    expect(await resync('--entity', 'team_1,team_2,team_3')).toMatchObject({ status: 'failed', entities: [{ id: 'team_1', outcome: 'synced' }] })
    expect(runConvex).toHaveBeenCalledTimes(2)
    expect(process.exitCode).toBe(1)
  })

  it.each([
    [' , ', 'name at least one billing entity id'],
    [Array.from({ length: 101 }, (_, i) => `team_${i}`).join(','), 'at most 100 entities at a time'],
  ])('refuses an --entity list it cannot run (%#)', async (list, message) => {
    const report = await resync('--entity', list)
    expect(report.status).toBe('refused')
    expect(report.note).toContain(message)
    expect(runConvex).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })
})
