import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runConvex } from '../../src/convex-cli'
import { deployKeyType, devPushRefusal, nonProductionDeployKey, runEnvPush } from '../../src/env-push'

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
  vi.unstubAllEnvs()
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

describe('deployKeyType', () => {
  // The deployment kind a key names, read the way the Convex CLI reads it.
  it.each([
    ['no key', {}, null],
    ['a prod key', { CONVEX_DEPLOY_KEY: 'prod:happy-otter-123|secret' }, 'prod'],
    ['a legacy key with no type, which is a production one', { CONVEX_DEPLOY_KEY: 'secret' }, 'prod'],
    ['a project key', { CONVEX_DEPLOY_KEY: 'project:team:app|secret' }, 'project'],
    ['a dev key', { CONVEX_DEPLOY_KEY: 'dev:happy-otter-123|secret' }, 'dev'],
    ['a preview key', { CONVEX_DEPLOY_KEY: 'preview:team:app|secret' }, 'preview'],
    ['a deployment token, when no deploy key is set', { CONVEX_DEPLOYMENT_TOKEN: 'dev:happy-otter-123|secret' }, 'dev'],
    ['the Convex CLI\'s placeholder for none', { CONVEX_DEPLOY_KEY: '<ignore_deploy_key>' }, null],
  ])('%s', (_label, env, expected) => {
    expect(deployKeyType(env)).toBe(expected)
  })
})

describe('devPushRefusal', () => {
  // The Convex CLI follows the key whatever the flags say: only a dev key, or
  // none, leaves a push without --prod on a dev deployment.
  it.each([
    ['no key', undefined, false],
    ['a dev key', 'dev:happy-otter-123|secret', false],
    ['a prod key', 'prod:determined-horse-300|secret', true],
    ['a legacy key with no type', 'secret', true],
    ['a project key', 'project:team:app|secret', true],
    ['a preview key', 'preview:team:app|secret', true],
  ])('%s', (_label, key, refused) => {
    vi.stubEnv('CONVEX_DEPLOY_KEY', key)
    vi.stubEnv('CONVEX_DEPLOYMENT_TOKEN', undefined)
    expect(devPushRefusal(rootDir) !== null).toBe(refused)
  })
})

describe('env push target', () => {
  // .env.local names dev, the shell holds production's key: the Convex CLI
  // would write production, and the dev gap-filling with it.
  it.each([
    ['in the shell', () => vi.stubEnv('CONVEX_DEPLOY_KEY', 'prod:determined-horse-300|secret')],
    ['in .env.local', () => writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:happy-otter-123\nCONVEX_DEPLOY_KEY=prod:determined-horse-300|secret\n')],
  ])('refuses a dev push with a production deploy key %s, before the Convex CLI is asked anything', async (_where, place) => {
    vi.stubEnv('CONVEX_DEPLOY_KEY', undefined)
    vi.stubEnv('CONVEX_DEPLOYMENT_TOKEN', undefined)
    place()
    await expect(runEnvPush(rootDir)).rejects.toThrow(/env push refused: CONVEX_DEPLOY_KEY is a prod deploy key/)
    expect(vi.mocked(runConvex)).not.toHaveBeenCalled()
  })

  it('pushes to the dev deployment with a dev deploy key, and to production with --prod and its key', async () => {
    vi.stubEnv('CONVEX_DEPLOY_KEY', 'dev:happy-otter-123|secret')
    expect((await runEnvPush(rootDir))?.dev).toBe(true)
    vi.stubEnv('CONVEX_DEPLOY_KEY', 'prod:determined-horse-300|secret')
    expect((await runEnvPush(rootDir, { prod: true }))?.deployment).toBe('production')
  })

  it('--prod reads and writes the production deployment', async () => {
    const run = await runEnvPush(rootDir, { prod: true })

    const calls = vi.mocked(runConvex).mock.calls.map(([, args]) => args)
    expect(calls[0]).toStrictEqual(['env', 'list', '--names-only', '--prod'])
    // The value goes on stdin, never into argv.
    expect(vi.mocked(runConvex).mock.calls).toContainEqual([rootDir, ['env', 'set', '--prod', 'EMAIL_FROM'], { input: 'Acme <hello@example.com>' }])
    expect(calls.every(args => args.includes('--prod'))).toBe(true)
    // Reported as production, not as the dev deployment .env.local names.
    expect(run?.deployment).toBe('production')
  })

  it('marks no deployment for a stand-in model, a local one included', async () => {
    vi.stubEnv('CONVEX_DEPLOYMENT', undefined)
    vi.stubEnv('CONVEX_DEPLOY_KEY', undefined)
    vi.stubEnv('CONVEX_DEPLOYMENT_TOKEN', undefined)
    writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=local:local-happy-otter\n')
    await runEnvPush(rootDir)
    expect(vi.mocked(runConvex).mock.calls.some(([, args]) => args.join(' ') === 'env set NUXT_BACKEND_SIMULATE_MODELS')).toBe(false)
  })

  it('without --prod acts on the configured deployment', async () => {
    const run = await runEnvPush(rootDir)

    const calls = vi.mocked(runConvex).mock.calls.map(([, args]) => args)
    expect(calls[0]).toStrictEqual(['env', 'list', '--names-only'])
    expect(calls.some(args => args.includes('--prod'))).toBe(false)
    expect(run?.deployment).toBe('dev:happy-otter-123')
  })
})
