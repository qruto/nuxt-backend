import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runCommand } from 'citty'
import { main } from '../../src/cli/main'
import { runConvex } from '../../src/convex-cli'

// `doctor --prod` checks the production deployment, while `.env.local` names
// a dev one. Every Convex CLI read has to say `--prod`, and the routes it
// probes have to be production's — taken from the function spec, not from
// the dev URLs in `.env.local`.
vi.mock('../../src/convex-cli', () => ({
  runConvex: vi.fn(async (_rootDir: string, args: string[]) => {
    if (args[0] === 'env') return { stdout: 'AUTH_SECRET\nSITE_URL\nAUTH_TRUST_LOCAL_ORIGINS\n', stderr: '' }
    if (args[0] === 'function-spec') {
      return { stdout: JSON.stringify({ url: 'https://prod-slug-42.convex.cloud', functions: [{ identifier: 'auth.js:getAuthUser' }] }), stderr: '' }
    }
    if (args[0] === 'run') return { stdout: JSON.stringify({ invitationPath: null }), stderr: '' }
    return { stdout: '', stderr: '' }
  }),
}))

let rootDir: string
let probed: string[]

// The URLs and the deploy key doctor reads come from the process env too:
// start from none, so a value set on the runner cannot stand in for the one
// under test.
const URL_VARS = ['NUXT_PUBLIC_BACKEND_SITE_URL', 'NUXT_PUBLIC_CONVEX_SITE_URL', 'NUXT_PUBLIC_BACKEND_URL', 'NUXT_PUBLIC_CONVEX_URL', 'CONVEX_DEPLOYMENT', 'CONVEX_DEPLOY_KEY', 'CONVEX_DEPLOYMENT_TOKEN']

beforeEach(() => {
  for (const name of URL_VARS) vi.stubEnv(name, undefined)
  rootDir = mkdtempSync(join(tmpdir(), 'doctor-prod-'))
  writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:happy-otter-123\nNUXT_PUBLIC_CONVEX_SITE_URL=https://happy-otter-123.convex.site\n')
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.mocked(runConvex).mockClear()
  probed = []
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
    probed.push(String(url))
    return new Response('secret not set', { status: 503 })
  }))
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  process.exitCode = undefined
})

async function doctor(args: string[]) {
  await runCommand(main, { rawArgs: ['doctor', '--json', ...args, '--cwd', rootDir] })
  return JSON.parse(vi.mocked(console.log).mock.calls.flat().join('\n')) as { findings: Array<{ id: string, status: string }> }
}

describe('--prod with a non-production deploy key', () => {
  // The Convex CLI follows CONVEX_DEPLOY_KEY and ignores --prod: a dev key
  // would make a production command act on dev without saying so.
  it.each([
    ['env push', ['env', 'push', '--prod']],
    ['doctor', ['doctor', '--json', '--prod']],
  ])('%s refuses before touching the deployment', async (_label, args) => {
    vi.stubEnv('CONVEX_DEPLOY_KEY', 'dev:happy-otter-123|secret')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    await runCommand(main, { rawArgs: [...args, '--cwd', rootDir] })

    expect(process.exitCode).toBe(1)
    expect(vi.mocked(runConvex)).not.toHaveBeenCalled()
    expect(error.mock.calls.flat().join('\n')).toContain('dev deployment key')
  })

  // The Convex CLI loads the key from the project's env files too (the shell
  // wins, then .env.local, then .env), so a key kept there counts the same.
  it.each([
    ['.env.local', ['env', 'push', '--prod']],
    ['.env', ['doctor', '--json', '--prod']],
  ])('a dev key in %s is refused too (%s)', async (file, args) => {
    writeFileSync(join(rootDir, file), 'CONVEX_DEPLOY_KEY=dev:happy-otter-123|secret\n')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    await runCommand(main, { rawArgs: [...args, '--cwd', rootDir] })

    expect(process.exitCode).toBe(1)
    expect(vi.mocked(runConvex)).not.toHaveBeenCalled()
    expect(error.mock.calls.flat().join('\n')).toContain('dev deployment key')
  })

  it('a production key in the shell wins over a dev key in .env.local', async () => {
    writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOY_KEY=dev:happy-otter-123|secret\n')
    vi.stubEnv('CONVEX_DEPLOY_KEY', 'prod:determined-horse-300|secret')
    await doctor(['--prod'])
    expect(vi.mocked(runConvex)).toHaveBeenCalled()
  })

  it('a production key is allowed through', async () => {
    vi.stubEnv('CONVEX_DEPLOY_KEY', 'prod:determined-horse-300|secret')
    await doctor(['--prod'])
    expect(vi.mocked(runConvex)).toHaveBeenCalled()
  })
})

describe('doctor --prod target', () => {
  it('reads production with --prod on every Convex CLI call', async () => {
    await doctor(['--prod'])

    const calls = vi.mocked(runConvex).mock.calls.map(([, args]) => args)
    expect(calls.map(args => args[0])).toEqual(expect.arrayContaining(['env', 'function-spec', 'run']))
    expect(calls.every(args => args.includes('--prod'))).toBe(true)
    // Names only: production values are never requested.
    expect(calls.find(args => args[0] === 'env')).toContain('--names-only')
  })

  it('probes production routes, never the dev site URL .env.local names', async () => {
    await doctor(['--prod'])

    expect(probed.length).toBeGreaterThan(0)
    expect(probed.every(url => url.startsWith('https://prod-slug-42.convex.site/'))).toBe(true)
  })

  it('treats production as non-dev: a dev-only var set there is flagged', async () => {
    const report = await doctor(['--prod'])
    expect(report.findings.find(finding => finding.id === 'deployment-auth-trust-local-origins')?.status).toBe('fail')
  })

  it('without --prod checks the deployment .env.local names', async () => {
    const report = await doctor([])

    const calls = vi.mocked(runConvex).mock.calls.map(([, args]) => args)
    expect(calls.some(args => args.includes('--prod'))).toBe(false)
    expect(probed.length).toBeGreaterThan(0)
    expect(probed.every(url => url.startsWith('https://happy-otter-123.convex.site/'))).toBe(true)
    // On a dev deployment the dev-only var is the healthy state.
    expect(report.findings.find(finding => finding.id === 'deployment-auth-trust-local-origins')?.status).toBe('pass')
  })
})
