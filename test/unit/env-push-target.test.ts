import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runConvex } from '../../src/convex-cli'
import { runEnvPush } from '../../src/env-push'

// Which deployment a push acts on is decided by the flags handed to the Convex
// CLI. `.env.local` names a dev deployment and a project deploy key (Vercel's
// Convex integration issues one) resolves to a dev deployment too, so a
// production push that does not say `--prod` lands on dev.
vi.mock('../../src/convex-cli', () => ({
  runConvex: vi.fn(async (_rootDir: string, args: string[]) => ({
    stdout: args[1] === 'list' ? 'AUTH_SECRET=x\nSITE_URL=https://app.example.com\n' : '',
    stderr: '',
  })),
}))

let rootDir: string

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'env-push-target-'))
  writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:happy-otter-123\nEMAIL_FROM=Acme <hello@example.com>\n')
  vi.mocked(runConvex).mockClear()
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
})

describe('env push target', () => {
  it('--prod reads and writes the production deployment', async () => {
    const run = await runEnvPush(rootDir, { prod: true })

    const calls = vi.mocked(runConvex).mock.calls.map(([, args]) => args)
    expect(calls[0]).toStrictEqual(['env', 'list', '--prod'])
    expect(calls).toContainEqual(['env', 'set', '--prod', 'EMAIL_FROM', 'Acme <hello@example.com>'])
    expect(calls.every(args => args.includes('--prod'))).toBe(true)
    // Reported as production, not as the dev deployment .env.local names.
    expect(run?.deployment).toBe('production')
  })

  it('without --prod acts on the configured deployment', async () => {
    const run = await runEnvPush(rootDir)

    const calls = vi.mocked(runConvex).mock.calls.map(([, args]) => args)
    expect(calls[0]).toStrictEqual(['env', 'list'])
    expect(calls.some(args => args.includes('--prod'))).toBe(false)
    expect(run?.deployment).toBe('dev:happy-otter-123')
  })
})
