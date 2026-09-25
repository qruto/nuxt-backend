import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runConvex } from '../../src/convex-cli'
import { nonProductionDeployKey, runEnvPush } from '../../src/env-push'

// Which deployment a push acts on is decided by the flags handed to the Convex
// CLI. `.env.local` names a dev deployment, so a production push that does
// not say `--prod` lands on dev.
vi.mock('../../src/convex-cli', () => ({
  runConvex: vi.fn(async (_rootDir: string, args: string[]) => ({
    stdout: args[1] === 'list' ? 'AUTH_SECRET\nSITE_URL\n' : '',
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

describe('nonProductionDeployKey', () => {
  it.each([
    ['no key', {}, null],
    ['a prod key', { CONVEX_DEPLOY_KEY: 'prod:happy-otter-123|secret' }, null],
    ['a project key', { CONVEX_DEPLOY_KEY: 'project:team:app|secret' }, null],
    ['a legacy key with no type', { CONVEX_DEPLOY_KEY: 'secret' }, null],
    ['a dev key', { CONVEX_DEPLOY_KEY: 'dev:happy-otter-123|secret' }, 'dev'],
    ['a preview key', { CONVEX_DEPLOY_KEY: 'preview:team:app|secret' }, 'preview'],
    ['a dev deployment token', { CONVEX_DEPLOYMENT_TOKEN: 'dev:happy-otter-123|secret' }, 'dev'],
  ])('%s', (_label, env, expected) => {
    expect(nonProductionDeployKey(env)).toBe(expected)
  })
})

describe('env push target', () => {
  it('--prod reads and writes the production deployment', async () => {
    const run = await runEnvPush(rootDir, { prod: true })

    const calls = vi.mocked(runConvex).mock.calls.map(([, args]) => args)
    expect(calls[0]).toStrictEqual(['env', 'list', '--names-only', '--prod'])
    expect(calls).toContainEqual(['env', 'set', '--prod', 'EMAIL_FROM', 'Acme <hello@example.com>'])
    expect(calls.every(args => args.includes('--prod'))).toBe(true)
    // Reported as production, not as the dev deployment .env.local names.
    expect(run?.deployment).toBe('production')
  })

  it('without --prod acts on the configured deployment', async () => {
    const run = await runEnvPush(rootDir)

    const calls = vi.mocked(runConvex).mock.calls.map(([, args]) => args)
    expect(calls[0]).toStrictEqual(['env', 'list', '--names-only'])
    expect(calls.some(args => args.includes('--prod'))).toBe(false)
    expect(run?.deployment).toBe('dev:happy-otter-123')
  })
})
