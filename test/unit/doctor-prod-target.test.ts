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
const deployed = vi.hoisted(() => ({ authConfig: {} as Record<string, unknown>, previewDefaults: 'AUTH_SECRET\nSITE_URL\n' as string | null }))
vi.mock('../../src/convex-cli', () => ({
  runConvex: vi.fn(async (_rootDir: string, args: string[]) => {
    if (args[0] === 'env' && args[1] === 'default') {
      if (deployed.previewDefaults === null) throw new Error('convex env exited with code 1')
      return { stdout: deployed.previewDefaults, stderr: '' }
    }
    if (args[0] === 'env') return { stdout: 'AUTH_SECRET\nSITE_URL\nAUTH_TRUST_LOCAL_ORIGINS\n', stderr: '' }
    if (args[0] === 'function-spec') {
      return { stdout: JSON.stringify({ url: 'https://prod-slug-42.convex.cloud', functions: [{ identifier: 'auth.js:getAuthUser' }] }), stderr: '' }
    }
    if (args[0] === 'run') return { stdout: JSON.stringify(deployed.authConfig), stderr: '' }
    return { stdout: '', stderr: '' }
  }),
}))

let rootDir: string
let probed: string[]

// The URLs and the deploy key doctor reads come from the process env too:
// start from none, so a value set on the runner cannot stand in for the one
// under test.
const URL_VARS = ['NUXT_PUBLIC_CONVEX_SITE_URL', 'NUXT_PUBLIC_BACKEND_URL', 'NUXT_PUBLIC_CONVEX_URL', 'CONVEX_DEPLOYMENT', 'CONVEX_DEPLOY_KEY', 'CONVEX_DEPLOYMENT_TOKEN']

beforeEach(() => {
  deployed.authConfig = {}
  deployed.previewDefaults = 'AUTH_SECRET\nSITE_URL\n'
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
  return JSON.parse(vi.mocked(console.log).mock.calls.flat().join('\n')) as { findings: Array<{ id: string, capability: string, status: string, fixHint: string }> }
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

describe('a dev push with a deploy key for another deployment', () => {
  // .env.local names dev, but the Convex CLI follows the key: without --prod
  // the dev values (a generated AUTH_SECRET, echoed codes, loopback origins)
  // would land on production.
  it.each([
    ['env push', ['env', 'push']],
    ['doctor --fix', ['doctor', '--json', '--fix']],
  ])('%s refuses before touching the deployment', async (_label, args) => {
    vi.stubEnv('CONVEX_DEPLOY_KEY', 'prod:determined-horse-300|secret')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    await runCommand(main, { rawArgs: [...args, '--cwd', rootDir] })

    expect(process.exitCode).toBe(1)
    expect(vi.mocked(runConvex)).not.toHaveBeenCalled()
    expect(error.mock.calls.flat().join('\n')).toContain('CONVEX_DEPLOY_KEY is a prod deploy key')
  })

  it('doctor without --fix only reads, so it still runs', async () => {
    vi.stubEnv('CONVEX_DEPLOY_KEY', 'prod:determined-horse-300|secret')
    await doctor([])
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

  it('treats production as non-dev: no BACKEND_ENVIRONMENT there fails, and a variable 0.2.0 removed is named', async () => {
    const report = await doctor(['--prod'])
    expect(report.findings.find(finding => finding.id === 'deployment-backend-environment')?.status).toBe('fail')
    expect(report.findings.find(finding => finding.id === 'deployment-removed-env')).toMatchObject({ status: 'warn', message: expect.stringContaining('AUTH_TRUST_LOCAL_ORIGINS'), fixHint: 'npx convex env remove --prod AUTH_TRUST_LOCAL_ORIGINS' })
  })

  it('without --prod checks the deployment .env.local names', async () => {
    const report = await doctor([])

    const calls = vi.mocked(runConvex).mock.calls.map(([, args]) => args)
    expect(calls.some(args => args.includes('--prod'))).toBe(false)
    expect(probed.length).toBeGreaterThan(0)
    expect(probed.every(url => url.startsWith('https://happy-otter-123.convex.site/'))).toBe(true)
    // A dev deployment without its kind warns (env push derives it), and a removed variable is named there too.
    expect(report.findings.find(finding => finding.id === 'deployment-backend-environment')).toMatchObject({ status: 'warn', fixHint: expect.stringContaining('npx nuxt-backend env push') })
    expect(report.findings.find(finding => finding.id === 'deployment-removed-env')).toMatchObject({ status: 'warn', fixHint: 'npx convex env remove AUTH_TRUST_LOCAL_ORIGINS' })
  })

  // `billing sync` makes the endpoint and stores its secret on the deployment,
  // never printed. A secret kept in .env.local would ride `env push --prod`
  // from the sandbox to production, and then block production's own sync.
  it.each([
    ['without --prod', [], '`npx nuxt-backend billing sync`:'],
    ['with --prod', ['--prod'], '`npx nuxt-backend billing sync --env production`:'],
  ])('points the billing webhook secret at billing sync, never at .env.local (%s)', async (_label, args, command) => {
    const report = await doctor(args)
    for (const id of ['billing-webhook-secret', 'deployment-billing-webhook-secret', 'billing-webhook-route']) {
      const hint = report.findings.find(finding => finding.id === id)?.fixHint ?? ''
      expect(hint, id).toContain(id === 'billing-webhook-secret' ? '`npx nuxt-backend billing sync`' : command)
      expect(hint, id).not.toContain('.env.local')
    }
    // The email webhook's secret is still the app's to push.
    expect(report.findings.find(finding => finding.id === 'email-webhook-route')?.fixHint).toContain('EMAIL_WEBHOOK_SECRET to .env.local')
  })
})

describe('the page paths', () => {
  // The deployment reports the paths it links to and serves on (the
  // `auth:authConfig` read); nuxt.config declares them, here the defaults.
  // They differ when the deployed code does not carry the generated file.
  const paths = (acceptInvitation: string) => ({ paths: { authRoute: '/api/auth', acceptInvitation, keepAccount: '/account/keep', security: '/security', waitlist: '/waitlist' } })

  it.each([
    ['/accept-invitation', 'pass'],
    ['/join', 'fail'],
  ])('a deployment linking invitations to %s: %s', async (acceptInvitation, status) => {
    deployed.authConfig = paths(acceptInvitation)
    const report = await doctor([])
    const reported = report.findings.find(finding => finding.id === 'page-paths')
    expect(reported?.status).toBe(status)
    if (status === 'fail') expect((reported as { message?: string } | undefined)?.message).toContain('acceptInvitation is /join there and /accept-invitation in backend.pages.acceptInvitation, so invitees land on a 404')
  })

  // The check belongs to the `auth` capability: it reads the auth config for
  // it, and `billing` never needs the read.
  it('is what --only auth checks', async () => {
    deployed.authConfig = paths('/join')
    const report = await doctor(['--only', 'auth'])

    expect(report.findings.filter(finding => finding.id === 'page-paths').map(finding => [finding.id, finding.status, finding.capability])).toEqual([['page-paths', 'fail', 'auth']])
    expect(vi.mocked(runConvex).mock.calls.map(([, args]) => args)).toContainEqual(['run', 'auth:authConfig'])
  })

  it('is not read for --only billing', async () => {
    deployed.authConfig = paths('/join')
    const report = await doctor(['--only', 'billing'])

    expect(vi.mocked(runConvex).mock.calls.some(([, args]) => args[0] === 'run')).toBe(false)
    expect(report.findings.some(finding => finding.id === 'page-paths')).toBe(false)
  })
})

describe('the preview env defaults', () => {
  // `convex deploy` creates a preview and pushes to it in one run: unless the
  // project's preview defaults hold the required pair (or the build sets it),
  // that first push fails.
  const envDefaults = (report: Awaited<ReturnType<typeof doctor>>) => report.findings.find(finding => finding.id === 'env-defaults')

  it('warns when new previews would start without the required pair, and says how to set it', async () => {
    deployed.previewDefaults = 'EMAIL_TEST_MODE\n'
    const reported = envDefaults(await doctor([]))

    expect(reported).toMatchObject({ status: 'warn', fixHint: expect.stringContaining('env push --defaults preview --site-url') })
    expect(vi.mocked(runConvex).mock.calls.map(([, args]) => args)).toContainEqual(['env', 'default', 'list', '--names-only', '--type', 'preview'])
  })

  it('passes when the defaults hold both', async () => {
    expect(envDefaults(await doctor([]))?.status).toBe('pass')
  })

  it('reports nothing when the defaults cannot be read, or under --prod', async () => {
    deployed.previewDefaults = null
    expect(envDefaults(await doctor([]))).toBeUndefined()

    deployed.previewDefaults = ''
    vi.mocked(console.log).mockClear()
    vi.mocked(runConvex).mockClear()
    expect(envDefaults(await doctor(['--prod']))).toBeUndefined()
    expect(vi.mocked(runConvex).mock.calls.some(([, args]) => args[1] === 'default')).toBe(false)
  })
})
