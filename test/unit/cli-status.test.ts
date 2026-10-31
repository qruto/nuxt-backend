import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCommand } from 'citty'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderGenerated } from '../../src/cli/billing/generated'
import { main } from '../../src/cli/main'
import { formatStatus, terminalShowsColor, type StatusReport } from '../../src/cli/status'
import { REQUIRED_FUNCTION_EXPORTS } from '../../src/contract'
import { runConvex } from '../../src/convex-cli'
import { CAPABILITY_NAMES } from '../../src/capabilities'
import { scaffoldBackendFiles } from '../../src/scaffold'
import { BACKEND_FILE_TEMPLATES } from '../../src/templates'
import { contentFile, read } from '../docs/helpers'

// `nuxt-backend status`: doctor's checks, run once, read per capability. The
// deployment's env names are listed once and handed to doctor, so status
// probes nothing doctor does not. The app here is set up the way the CLI
// page's example shows: a cloud dev deployment with auth and email keys,
// test mode on, and no billing token. The two mode switches are the only
// values it reads, and only where the deployment sets them.
const deployed = vi.hoisted(() => ({ names: [] as string[], values: {} as Record<string, string>, unreadable: false }))
vi.mock('../../src/convex-cli', () => ({
  runConvex: vi.fn(async (_rootDir: string, args: string[]) => {
    if (args[0] === 'env' && args[1] === 'default') return { stdout: 'AUTH_SECRET\nSITE_URL\n', stderr: '' }
    if (args[0] === 'env' && args[1] === 'get') return { stdout: `${deployed.values[args.at(-1)!] ?? ''}\n`, stderr: '' }
    if (args[0] === 'env' && deployed.unreadable) throw new Error('could not reach the deployment')
    if (args[0] === 'env') return { stdout: `${deployed.names.join('\n')}\n`, stderr: '' }
    if (args[0] === 'function-spec') {
      const functions = Object.entries(REQUIRED_FUNCTION_EXPORTS).flatMap(([module, names]) => names.map(name => ({ identifier: `${module}.js:${name}` })))
      return { stdout: JSON.stringify({ url: 'https://happy-otter-123.convex.cloud', functions }), stderr: '' }
    }
    if (args[0] === 'run') return { stdout: '{}', stderr: '' }
    return { stdout: '', stderr: '' }
  }),
}))

// What the machine running the tests has set must not stand in for the app's.
const MACHINE_ENV = ['NUXT_PUBLIC_CONVEX_SITE_URL', 'NUXT_PUBLIC_BACKEND_URL', 'NUXT_PUBLIC_CONVEX_URL', 'CONVEX_DEPLOYMENT', 'CONVEX_DEPLOY_KEY', 'CONVEX_DEPLOYMENT_TOKEN', 'AUTH_SECRET', 'SITE_URL', 'BACKEND_ENVIRONMENT', 'EMAIL_API_KEY', 'EMAIL_FROM', 'EMAIL_WEBHOOK_SECRET', 'BILLING_ACCESS_TOKEN', 'BILLING_WEBHOOK_SECRET', 'MONITORING_DSN', 'NEXT_PUBLIC_SENTRY_DSN', 'VERCEL']

let rootDir: string

beforeEach(() => {
  // What `nuxt-backend dev` leaves on a dev deployment: the kind, derived.
  // `env push` generates the web push key pair on a dev deployment.
  deployed.names = ['AUTH_SECRET', 'SITE_URL', 'BACKEND_ENVIRONMENT', 'EMAIL_API_KEY', 'EMAIL_FROM', 'EMAIL_WEBHOOK_SECRET', 'PUSH_PUBLIC_KEY', 'PUSH_PRIVATE_KEY']
  deployed.values = { BACKEND_ENVIRONMENT: 'development' }
  deployed.unreadable = false
  for (const name of MACHINE_ENV) vi.stubEnv(name, undefined)
  rootDir = mkdtempSync(join(tmpdir(), 'nuxt-backend-status-'))
  writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:happy-otter-123\n')
  scaffoldBackendFiles(rootDir, { log: () => {} })
  mkdirSync(join(rootDir, 'backend/_generated'), { recursive: true })
  vi.mocked(runConvex).mockClear()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  // The routes answer the unsigned probe as mounted routes do.
  vi.stubGlobal('fetch', vi.fn(async () => new Response('unsigned', { status: 401 })))
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  process.exitCode = undefined
})

/** What `status` prints, line by line. */
async function status(args: string[] = []): Promise<string[]> {
  await runCommand(main, { rawArgs: ['status', ...args, '--cwd', rootDir] })
  return vi.mocked(console.log).mock.calls.map(call => call.join(' ')).join('\n').split('\n')
}

async function statusJson(args: string[] = []): Promise<StatusReport> {
  return JSON.parse((await status(['--json', ...args])).join('\n')) as StatusReport
}

describe('nuxt-backend status', () => {
  it('prints what the CLI page shows, line for line', async () => {
    const page = read(contentFile('/docs/reference/cli'))
    const section = page.slice(page.indexOf('## `status`'))
    const example = section.slice(section.indexOf('```text\n') + '```text\n'.length, section.indexOf('\n```', section.indexOf('```text')))
    expect(await status()).toEqual(example.split('\n'))
  })

  it('reads the deployment\'s env names once, and reuses doctor\'s checks for the rest', async () => {
    await status()
    const calls = vi.mocked(runConvex).mock.calls.map(([, args]) => args.slice(0, 2).join(' '))
    expect(calls.filter(call => call === 'env list')).toHaveLength(1)
    expect(calls).toContain('function-spec')
    // The one value read is the deployment's kind, once.
    expect(calls.filter(call => call === 'env get')).toHaveLength(1)
  })

  it('prints one JSON document: every capability, its state, providers, unset env and top finding', async () => {
    const report = await statusJson()
    expect(Object.keys(report)).toEqual(['deployment', 'status', 'capabilities', 'summary'])
    expect(report.deployment).toEqual({ kind: 'cloud-dev', id: 'dev:happy-otter-123' })
    expect(report.capabilities.map(capability => capability.name)).toEqual(CAPABILITY_NAMES)
    expect(report.status).toBe('degraded')
    expect(Object.fromEntries(report.capabilities.map(capability => [capability.name, capability.state]))).toEqual({
      auth: 'test',
      // A cloud dev deployment is a deployment that is not production: test.
      data: 'test',
      jobs: 'test',
      billing: 'missing',
      email: 'test',
      notifications: 'test',
      ai: 'missing',
      // The dev server's bot check answers human: test mode, whatever the deployment takes.
      protection: 'test',
      // No DSN on a dev deployment: the dev server's local error log stands in.
      monitoring: 'test',
      // Nothing to configure: always live.
      flags: 'live',
      // The billing provider's metrics, as missing as the billing they read.
      analytics: 'missing',
      // The dev server serves the app: no production deployment in view.
      hosting: 'missing',
    })
    expect(report.capabilities.find(capability => capability.name === 'protection')).toMatchObject({ missingEnv: [], top: null })
    const billing = report.capabilities.find(capability => capability.name === 'billing')!
    // BACKEND_ENVIRONMENT keeps the sandbox: nothing to fix outside production.
    expect(billing.missingEnv).toEqual(['BILLING_ACCESS_TOKEN', 'BILLING_WEBHOOK_SECRET'])
    expect(billing.top).toMatchObject({ id: 'billing-access', status: 'warn', docsUrl: 'https://nuxt-backend.dev/d/billing-access' })
    expect(report.summary).toBe('1 live · 7 test · 4 missing')
    expect(process.exitCode).toBeUndefined()
  })

  it('fails when a capability fails: a route the deployment does not mount', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => new Response('', { status: String(url).endsWith('/email/events') ? 404 : 401 })))
    const report = await statusJson()
    expect(report.capabilities.find(capability => capability.name === 'email')).toMatchObject({ state: 'failing', reason: 'Email webhook route failed', top: { id: 'email-webhook-route', status: 'fail' } })
    expect(report.status).toBe('failing')
    expect(process.exitCode).toBe(1)
  })

  const PRODUCTION = ['AUTH_SECRET', 'SITE_URL', 'BACKEND_ENVIRONMENT', 'EMAIL_API_KEY', 'EMAIL_FROM', 'EMAIL_WEBHOOK_SECRET', 'BILLING_ACCESS_TOKEN', 'BILLING_WEBHOOK_SECRET']

  it('checks production\'s capabilities under --prod, reading its environment off it', async () => {
    deployed.names = PRODUCTION
    deployed.values = { BACKEND_ENVIRONMENT: 'production', SITE_URL: 'https://app.example.com' }
    // The starter catalog synced to production, so doctor --prod finds an id
    // for every price, pack and meter wherever the catalog loads.
    writeFileSync(join(rootDir, 'backend/billing.generated.ts'), renderGenerated({
      production: {
        products: { 'starter': 'p_starter', 'starter:year': 'p_starter_year', 'pro': 'p_pro', 'pro:year': 'p_pro_year', 'credits100': 'p_100', 'credits500': 'p_500' },
        meters: { credits: { meterId: 'm_credits' } },
      },
    }))
    const report = await statusJson(['--prod'])
    const envCalls = vi.mocked(runConvex).mock.calls.map(([, args]) => args).filter(args => args[0] === 'env')
    expect(envCalls.every(args => args.includes('--prod'))).toBe(true)
    // The environment and the site's origin, each once, and nothing else: a key's value is never asked for.
    expect(envCalls.filter(args => args[1] === 'get').map(args => args.at(-1)).sort()).toEqual(['BACKEND_ENVIRONMENT', 'SITE_URL'])
    expect(report.deployment).toEqual({ kind: 'production' })
    expect(Object.fromEntries(report.capabilities.map(capability => [capability.name, capability.state]))).toMatchObject({ auth: 'live', email: 'live', billing: 'live', ai: 'live', data: 'live' })
    // Nothing checks for bots on production: doctor --prod warns, and both names count as missing.
    expect(report.capabilities.find(capability => capability.name === 'protection')).toMatchObject({
      state: 'missing',
      missingEnv: ['PROTECTION_PROOF_SECRET', 'PROTECTION_CHALLENGE_SECRET_KEY'],
      top: { id: 'bot-protection', status: 'warn' },
    })
  })

  it('reads production\'s bot protection as live once it takes proofs, and says the app\'s half cannot be seen from here', async () => {
    deployed.names = [...PRODUCTION, 'PROTECTION_PROOF_SECRET']
    deployed.values = { BACKEND_ENVIRONMENT: 'production' }
    // Linked to Vercel, where BotID signs the proofs.
    mkdirSync(join(rootDir, '.vercel'))
    writeFileSync(join(rootDir, '.vercel/project.json'), '{}')
    const report = await statusJson(['--prod'])
    expect(report.capabilities.find(capability => capability.name === 'protection')).toMatchObject({
      state: 'live',
      missingEnv: [],
      top: { id: 'protection-proof', status: 'warn' },
    })
    // Unlinked, proofs alone are no protection doctor can vouch for: nothing signs them off Vercel.
    rmSync(join(rootDir, '.vercel'), { recursive: true })
    vi.mocked(console.log).mockClear()
    expect((await statusJson(['--prod'])).capabilities.find(capability => capability.name === 'protection')).toMatchObject({ top: { id: 'bot-protection', status: 'warn' } })
    // The secret's value is never read off the deployment.
    const gets = vi.mocked(runConvex).mock.calls.map(([, args]) => args).filter(args => args[0] === 'env' && args[1] === 'get')
    expect(gets.map(args => args.at(-1))).not.toContain('PROTECTION_PROOF_SECRET')
  })

  it('catches production left in test mode or the sandbox, which the names alone would hide', async () => {
    deployed.names = PRODUCTION
    deployed.values = { BACKEND_ENVIRONMENT: 'sandbox', SITE_URL: 'https://app.example.com' }
    // The scaffold caps the day's AI spend, so AI on a sandbox runs, in its test mode too.
    const states = async () => Object.fromEntries((await statusJson(['--prod'])).capabilities.map(capability => [capability.name, capability.state]))
    expect(await states()).toMatchObject({ auth: 'test', email: 'test', billing: 'test', ai: 'test' })
    // Without spendLimit, AI on a sandbox is failing: it refuses every call.
    writeFileSync(join(rootDir, 'backend/ai.ts'), BACKEND_FILE_TEMPLATES['ai.ts']!.replace(', spendLimit: { usdPerDay: 10 }', ''))
    vi.mocked(console.log).mockClear()
    const report = await statusJson(['--prod'])
    expect(report.capabilities.find(capability => capability.name === 'ai')).toMatchObject({ state: 'failing', top: { id: 'ai-spend-limit', status: 'fail' } })
  })

  it('counts nothing as set on production when its env names cannot be read', async () => {
    deployed.unreadable = true
    // What the dev env holds is not production's.
    writeFileSync(join(rootDir, '.env.local'), `CONVEX_DEPLOYMENT=dev:happy-otter-123\nAUTH_SECRET=${'x'.repeat(40)}\nSITE_URL=https://app.example.com\nEMAIL_API_KEY=re_dev\nBACKEND_ENVIRONMENT=production\nBILLING_ACCESS_TOKEN=dev\n`)
    const report = await statusJson(['--prod'])
    const capability = (name: string) => report.capabilities.find(each => each.name === name)!
    for (const name of ['auth', 'ai']) {
      expect(capability(name), name).toMatchObject({ state: 'missing', reason: expect.stringContaining('production\'s env names could not be read') })
    }
    // Doctor's production posture fails their webhook checks on top: never live from the dev env.
    for (const name of ['email', 'billing']) expect(['missing', 'failing'], name).toContain(capability(name).state)
    expect(report.status).not.toBe('ok')
  })

  it('refuses --prod with a deploy key for another deployment', async () => {
    vi.stubEnv('CONVEX_DEPLOY_KEY', 'dev:happy-otter-123|secret')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await status(['--prod'])
    expect(process.exitCode).toBe(1)
    expect(vi.mocked(runConvex)).not.toHaveBeenCalled()
    expect(error.mock.calls.flat().join('\n')).toContain('dev deployment key')
  })
})

describe('the status console', () => {
  const report: StatusReport = {
    deployment: { kind: 'local', id: 'local:local-acme-app' },
    status: 'ok',
    capabilities: [{ name: 'data', title: 'Data', state: 'test', reason: 'runs on a local deployment', providers: ['Convex'], missingEnv: [], findings: { pass: 3, warn: 0, fail: 0 }, top: null, docsUrl: 'https://nuxt-backend.dev/docs/build/data', devtools: 'overview' }],
    summary: '1 test',
  }

  it('lights each state in its signal on a terminal that shows colour, and plain text elsewhere', () => {
    expect(formatStatus(report)[2]).toBe('◐ data          test       Convex: runs on a local deployment')
    expect(formatStatus(report, { color: true })[2]).toBe('\u001B[33m◐\u001B[39m data          test       Convex: runs on a local deployment')
    expect(formatStatus(report).at(-1)).toBe('1 test')
    // Colour only where the terminal says it shows it: never into a pipe.
    expect(terminalShowsColor({ isTTY: true, hasColors: () => true })).toBe(true)
    expect(terminalShowsColor({ isTTY: true, hasColors: () => false })).toBe(false)
    expect(terminalShowsColor({})).toBe(false)
  })

  it('names production in the doctor run it points to', () => {
    const failing: StatusReport = { ...report, capabilities: [{ ...report.capabilities[0]!, state: 'failing', top: { id: 'function-contract', status: 'fail', title: 'Function contract', message: 'Deployed functions missing.', fixHint: '', docsUrl: '' } }] }
    expect(formatStatus(failing, { prod: true }).at(-1)).toBe('1 test — fixes: npx nuxt-backend doctor --only data --prod')
  })
})
