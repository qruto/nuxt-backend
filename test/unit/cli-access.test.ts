import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runCommand } from 'citty'
import { main } from '../../src/cli/main'
import type { AccessAdmitReport } from '../../src/cli/admin'
import { ConvexCliError, runConvex } from '../../src/convex-cli'

// `nuxt-backend access admit`: an invitation by address for each address
// named, through the backend component's `access:admit`, cleaned as the
// admin console's Access tab cleans a pasted list. What the invitation does
// at sign-up runs in the access suites; the deployment here is a stub of
// `convex run`.

vi.mock('../../src/convex-cli', async importOriginal => ({ ...await importOriginal<typeof import('../../src/convex-cli')>(), runConvex: vi.fn() }))

const DAY = 24 * 60 * 60 * 1000
let dir: string
let stdout: string[]
let stderr: string[]

beforeEach(() => {
  for (const name of ['CONVEX_DEPLOY_KEY', 'CONVEX_DEPLOYMENT']) vi.stubEnv(name, undefined)
  dir = mkdtempSync(join(tmpdir(), 'nuxt-backend-access-'))
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

async function admit(...args: string[]): Promise<AccessAdmitReport> {
  await runCommand(main, { rawArgs: ['access', 'admit', ...args, '--cwd', dir, '--json'] })
  return JSON.parse(stdout.join('\n')) as AccessAdmitReport
}

/** What the component's `access:admit` was asked, parsed. */
function asked(): { emails: string[], source: string, label: string, expiresAt: number } {
  const args = vi.mocked(runConvex).mock.calls[0]![1]
  expect(args.slice(0, -1)).toEqual(['run', '--component', 'backend', 'access:admit'])
  return JSON.parse(args.at(-1)!)
}

describe('access admit', () => {
  it('admits each address named, cleaned, for thirty days under the command line\'s label', async () => {
    vi.mocked(runConvex).mockResolvedValueOnce({ stdout: JSON.stringify({ admitted: ['ada@acme.dev', 'grace@acme.dev'], ids: ['a', 'b'], skipped: [] }), stderr: '' })
    const before = Date.now()
    const report = await admit(' Ada@Acme.dev ', 'grace@acme.dev,not-an-address')
    expect(asked()).toMatchObject({ emails: ['ada@acme.dev', 'grace@acme.dev'], source: 'invitation', label: 'command line' })
    expect(asked().expiresAt).toBeGreaterThanOrEqual(before + 30 * DAY)
    expect(report).toMatchObject({ deployment: 'dev', status: 'admitted', admitted: ['ada@acme.dev', 'grace@acme.dev'], skipped: [{ email: 'not-an-address', reason: 'malformed' }] })
    expect(stderr.join('\n')).toContain('ada@acme.dev, grace@acme.dev may sign up on the dev deployment until')
    expect(process.exitCode).toBeUndefined()
  })

  it('skips an address with an account, and a reserved test domain without asking the deployment', async () => {
    vi.mocked(runConvex).mockResolvedValueOnce({ stdout: JSON.stringify({ admitted: [], ids: [], skipped: [{ email: 'ada@acme.dev', reason: 'account' }] }), stderr: '' })
    expect((await admit('ada@acme.dev', 'drill@example.com')).skipped).toEqual([{ email: 'drill@example.com', reason: 'reserved' }, { email: 'ada@acme.dev', reason: 'account' }])
    stdout = []
    vi.mocked(runConvex).mockClear()
    expect(await admit('drill@example.com')).toMatchObject({ status: 'admitted', admitted: [] })
    expect(runConvex).not.toHaveBeenCalled()
  })

  it('takes a label and a lifetime, and admits on production with --prod', async () => {
    vi.stubEnv('CONVEX_DEPLOY_KEY', `prod:app|${randomBytes(8).toString('hex')}`)
    vi.mocked(runConvex).mockResolvedValueOnce({ stdout: JSON.stringify({ admitted: ['ada@acme.dev'], ids: ['a'], skipped: [] }), stderr: '' })
    const before = Date.now()
    expect(await admit('ada@acme.dev', '--prod', '--label', 'drill', '--days', '2')).toMatchObject({ deployment: 'production', status: 'admitted' })
    expect(vi.mocked(runConvex).mock.calls[0]![1].slice(0, 2)).toEqual(['run', '--prod'])
    const { label, expiresAt } = JSON.parse(vi.mocked(runConvex).mock.calls[0]![1].at(-1)!) as { label: string, expiresAt: number }
    expect(label).toBe('drill')
    expect(expiresAt - before).toBeGreaterThanOrEqual(2 * DAY)
    expect(expiresAt - before).toBeLessThan(3 * DAY)
  })

  it('says a deployment without launch access has none to admit through, and fails', async () => {
    vi.mocked(runConvex).mockRejectedValueOnce(new ConvexCliError('convex run exited with code 1', { code: 1, signal: null, timedOut: false, stderrTail: '• billing:get', missingFunction: true }))
    expect(await admit('ada@acme.dev')).toMatchObject({ status: 'missing', admitted: [], note: expect.stringContaining('no launch access to admit through') })
    expect(process.exitCode).toBe(1)
  })

  it.each([
    [['ada@acme.dev', '--days', '0'], '--days is a whole number of days from 1 to 365.'],
    [['ada@acme.dev', '--days', '1.5'], '--days is a whole number of days from 1 to 365.'],
    [['ada@acme.dev', '--label', ' '], '--label is 1-64 characters.'],
    [['ada@acme.dev', '--label', 'x'.repeat(65)], '--label is 1-64 characters.'],
  ])('refuses %j before it runs anything', async (args, message) => {
    await runCommand(main, { rawArgs: ['access', 'admit', ...args, '--cwd', dir] })
    expect(stderr).toEqual([`[nuxt-backend] access admit refused: ${message}`])
    expect(runConvex).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })

  it('refuses a deploy key for another deployment than the flags name', async () => {
    vi.stubEnv('CONVEX_DEPLOY_KEY', `preview:app|${randomBytes(8).toString('hex')}`)
    await runCommand(main, { rawArgs: ['access', 'admit', 'ada@acme.dev', '--cwd', dir] })
    expect(stderr.join('\n')).toContain('access admit refused: CONVEX_DEPLOY_KEY is a preview deploy key')
    expect(runConvex).not.toHaveBeenCalled()
  })

  it.each([
    [['ada@acme.dev', '--days', 'soon'], undefined, '--days is a whole number of days from 1 to 365.'],
    [['ada@acme.dev', '--prod'], 'preview', 'CONVEX_DEPLOY_KEY is a preview deploy key'],
  ])('prints a refusal of %j as its JSON report too, with no expiry', async (args, keyType, message) => {
    if (keyType) vi.stubEnv('CONVEX_DEPLOY_KEY', `${keyType}:app|${randomBytes(8).toString('hex')}`)
    const report = await admit(...args)
    expect(report).toEqual({ deployment: args.includes('--prod') ? 'production' : 'dev', status: 'refused', admitted: [], skipped: [], expiresAt: null, note: expect.stringContaining(message) })
    expect(runConvex).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })
})
