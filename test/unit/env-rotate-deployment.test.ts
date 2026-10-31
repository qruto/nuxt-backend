import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCommand } from 'citty'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { envRotate, runRotate } from '../../src/cli/rotate'
import { AUTH_SECRET_WINDOW_MS } from '../../src/convex/auth-secrets'
import type { EmailSyncReport } from '../../src/convex/integrations/email-sync'
import { createPolarFake, type PolarFake } from '../fixtures/polar-fake/server'

// `nuxt-backend env rotate` with nothing injected but the clock: the
// deployment is reached the way the command reaches it, through `convex env
// get`, `convex env set` (the value on stdin) and `convex run`, here an
// in-memory stand-in for the Convex CLI; the billing provider is the fake
// provider. env-rotate.test.ts holds the order of the writes with every seam
// replaced; this file holds what crosses each seam.

const OLD = 'old-secret-from-openssl-rand-base64-32xyz'
const NOW = 1_800_000_000_000
const VERSION = NOW / 1000
const CLOUD = 'https://happy-otter-123.convex.cloud'
const BILLING_ENDPOINT = 'https://happy-otter-123.convex.site/billing/events'

const deployment = vi.hoisted(() => ({
  env: new Map<string, string>(),
  url: 'https://happy-otter-123.convex.cloud' as string | null,
  /** `convex run` answers, by function name; a function left out is missing. */
  functions: {} as Record<string, (args: Record<string, unknown>) => unknown>,
  calls: [] as Array<{ args: string[], input?: string }>,
}))
vi.mock('../../src/convex-cli', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/convex-cli')>(),
  runConvex: vi.fn(async (_rootDir: string, args: string[], options: { input?: string } = {}) => {
    deployment.calls.push({ args, ...(options.input === undefined ? {} : { input: options.input }) })
    const words = args.filter(arg => arg !== '--prod')
    if (words[0] === 'env' && words[1] === 'list') return { stdout: [...deployment.env.keys()].join('\n'), stderr: '' }
    if (words[0] === 'env' && words[1] === 'get') return { stdout: `${deployment.env.get(words[2]!) ?? ''}\n`, stderr: '' }
    if (words[0] === 'env' && words[1] === 'set') {
      deployment.env.set(words[2]!, options.input!)
      return { stdout: '', stderr: '' }
    }
    if (words[0] === 'function-spec') {
      if (!deployment.url) throw new Error('convex function-spec exited with code 1')
      return { stdout: JSON.stringify({ url: deployment.url, functions: [] }), stderr: '' }
    }
    const fn = words.find(word => /^[\w/]+:\w+$/.test(word))!
    const handler = deployment.functions[fn]
    if (!handler) throw Object.assign(new Error(`convex run exited with code 1: Could not find function for '${fn}'`), { missingFunction: true })
    return { stdout: JSON.stringify(handler(JSON.parse(words.at(-1)!) as Record<string, unknown>)), stderr: '' }
  }),
}))

let rootDir: string
let lines: string[]
const print = (line: string) => void lines.push(line)
/** The clock is the one seam left in: the window and the versions are read off it. */
const clock = { now: () => NOW }

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'env-rotate-deployment-'))
  writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:happy-otter-123\n')
  for (const name of ['CONVEX_DEPLOY_KEY', 'CONVEX_DEPLOYMENT_TOKEN', 'CONVEX_DEPLOYMENT', 'BILLING_ACCESS_TOKEN', 'BACKEND_ENVIRONMENT', 'NUXT_PUBLIC_CONVEX_SITE_URL']) vi.stubEnv(name, undefined)
  deployment.env.clear()
  deployment.url = CLOUD
  deployment.functions = {
    'keys:rotate': () => ({ expired: 2 }),
    'keys:retire': () => ({ removed: 2 }),
    'access:staleInvites': () => ({ count: 0, more: false }),
  }
  deployment.calls.length = 0
  lines = []
  process.exitCode = undefined
})
afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  process.exitCode = undefined
})

/** Every argument the Convex CLI was given, and every line printed: where no secret may be. */
const exposed = () => `${deployment.calls.map(call => call.args.join(' ')).join('\n')}\n${lines.join('\n')}`

describe('env rotate AUTH_SECRET, on the deployment', () => {
  it('reads the secret with env get, writes the new pair on env set\'s stdin, then rotates the keys on the component', async () => {
    deployment.env.set('AUTH_SECRET', OLD)
    const { exitCode, output } = await runRotate(rootDir, 'AUTH_SECRET', {}, print, clock)
    expect(exitCode).toBe(0)
    expect(deployment.calls.map(call => call.args)).toEqual([
      ['env', 'get', 'AUTH_SECRET'],
      ['env', 'set', 'AUTH_SECRET'],
      ['run', '--component', 'backend', 'keys:rotate', '{}'],
    ])
    const written = deployment.env.get('AUTH_SECRET')!
    expect(written).toMatch(new RegExp(`^${VERSION}:[\\w+/=]{40,},0:${OLD}$`))
    expect(deployment.calls[1]!.input).toBe(written)
    expect(lines).toContain('  done     expire the session signing keys (keys:rotate): the next token is signed with a new key, the old keys stay published — 2 expired')
    expect(output).toMatchObject({ state: 'rotating', retiresAt: new Date(NOW + AUTH_SECRET_WINDOW_MS).toISOString() })
    const fresh = written.split(',')[0]!.split(':')[1]!
    expect(exposed()).not.toContain(fresh)
    expect(exposed()).not.toContain(OLD)
  })

  it('warns that .env.local still holds the old secret, which a forced push would put back', async () => {
    writeFileSync(join(rootDir, '.env.local'), `CONVEX_DEPLOYMENT=dev:happy-otter-123\nAUTH_SECRET=${OLD}\n`)
    deployment.env.set('AUTH_SECRET', OLD)
    await runRotate(rootDir, 'AUTH_SECRET', {}, print, clock)
    expect(lines.at(-1)).toContain('.env.local still holds the old AUTH_SECRET')
    expect(lines.at(-1)).not.toContain(OLD)

    // Production's secret is never .env.local's: nothing to warn of there.
    lines = []
    deployment.calls.length = 0
    deployment.env.set('AUTH_SECRET', OLD)
    await runRotate(rootDir, 'AUTH_SECRET', { prod: true }, print, clock)
    expect(lines.join('\n')).not.toContain('.env.local')
    expect(lines.join('\n')).toContain('npx nuxt-backend env rotate AUTH_SECRET --prod')
    expect(deployment.calls.every(call => call.args.includes('--prod'))).toBe(true)
  })

  it('refuses a deployment without the secret, naming the push that sets one', async () => {
    expect(await runRotate(rootDir, 'AUTH_SECRET', {}, print, clock)).toEqual({ exitCode: 1, output: null })
    expect(lines.at(-1)).toBe('[nuxt-backend] env rotate refused: AUTH_SECRET is not set on the deployment: set one first (`npx nuxt-backend env push`).')
    await runRotate(rootDir, 'AUTH_SECRET', { prod: true }, print, clock)
    expect(lines.at(-1)).toBe('[nuxt-backend] env rotate refused: AUTH_SECRET is not set on the production deployment: set one first (`npx nuxt-backend env push --prod`).')
  })

  it('counts the open invites under the old version before it retires, and says when there are more', async () => {
    deployment.env.set('AUTH_SECRET', `${VERSION}:new-secret-from-openssl-rand-base64-32abc,0:${OLD}`)
    const asked: unknown[] = []
    deployment.functions['access:staleInvites'] = (args) => {
      asked.push(args)
      return { count: 50, more: true }
    }
    const { exitCode, output } = await runRotate(rootDir, 'AUTH_SECRET', { retire: true }, print, clock)
    expect(exitCode).toBe(0)
    expect(asked).toEqual([{ keyVersion: VERSION, now: NOW }])
    expect(deployment.calls.map(call => call.args)).toEqual([
      ['env', 'get', 'AUTH_SECRET'],
      ['run', '--component', 'backend', 'access:staleInvites', JSON.stringify({ keyVersion: VERSION, now: NOW })],
      ['run', '--component', 'backend', 'keys:retire', '{}'],
      ['env', 'set', 'AUTH_SECRET'],
    ])
    expect(output?.steps[0]).toMatchObject({ outcome: 'done', note: '50+ open' })
    expect(lines.join('\n')).toContain('Warning: open invite codes or links still hashed under the old AUTH_SECRET: 50+.')
    expect(deployment.env.get('AUTH_SECRET')).toBe(`${VERSION}:new-secret-from-openssl-rand-base64-32abc`)
    expect(output?.state).toBe('rotated')
  })

  it('stops as failed, exit 1, when the deployment fails a step', async () => {
    deployment.env.set('AUTH_SECRET', OLD)
    deployment.functions['keys:rotate'] = () => {
      throw new Error('convex run exited with code 1: the backend component is not mounted')
    }
    expect(await runRotate(rootDir, 'AUTH_SECRET', {}, print, clock)).toEqual({ exitCode: 1, output: null })
    expect(lines.at(-1)).toBe('[nuxt-backend] env rotate failed: convex run exited with code 1: the backend component is not mounted')
  })

  it('refuses to rotate the dev deployment with a production deploy key in the shell', async () => {
    vi.stubEnv('CONVEX_DEPLOY_KEY', 'prod:happy-otter-123|secret-deploy-key')
    expect((await runRotate(rootDir, 'AUTH_SECRET', {}, print, clock)).exitCode).toBe(1)
    expect(lines.at(-1)).toContain('pass --prod to write production')
    expect(deployment.calls).toEqual([])
  })
})

describe('env rotate EMAIL_WEBHOOK_SECRET, through the deployment\'s email sync', () => {
  const synced = (overrides: Omit<Partial<EmailSyncReport>, 'webhook'> & { webhook?: Partial<EmailSyncReport['webhook']> } = {}) => (args: Record<string, unknown>) => ({
    key: 'full',
    ...overrides,
    dryRun: args.dryRun,
    webhook: { url: 'https://happy-otter-123.convex.site/email/events', action: 'exists', missingEvents: [], ...(args.dryRun ? {} : { changed: 'secret-rotated', secret: 'whsec_resend_rotated' }), ...overrides.webhook },
  })

  it('plans both steps on a dry run and writes nothing', async () => {
    const asked: unknown[] = []
    deployment.functions['email:syncEmail'] = (args) => {
      asked.push(args)
      return synced()(args)
    }
    const { exitCode, output } = await runRotate(rootDir, 'EMAIL_WEBHOOK_SECRET', { dryRun: true }, print, clock)
    expect(exitCode).toBe(0)
    expect(asked).toEqual([{ dryRun: true, rotateWebhookSecret: true }])
    expect(output?.steps.map(step => step.outcome)).toEqual(['planned', 'planned'])
    expect(output?.state).toBe('unchanged')
    expect(deployment.env.size).toBe(0)
  })

  it('stores the provider\'s new secret on env set\'s stdin', async () => {
    deployment.functions['email:syncEmail'] = synced()
    const { output } = await runRotate(rootDir, 'EMAIL_WEBHOOK_SECRET', {}, print, clock)
    expect(output?.state).toBe('rotated')
    expect(deployment.env.get('EMAIL_WEBHOOK_SECRET')).toBe('whsec_resend_rotated')
    expect(exposed()).not.toContain('whsec_resend_rotated')
  })

  it.each([
    ['the deployment has no email sync', null, 'The deployment has no email:syncEmail.'],
    ['no key is set', synced({ key: 'missing' }), 'EMAIL_API_KEY is not set on the deployment.'],
    ['the key may only send', synced({ key: 'restricted' }), 'EMAIL_API_KEY may only send: rotating the webhook\'s secret needs a full-access key.'],
    ['no webhook points at the deployment', synced({ webhook: { url: null, action: 'skipped' } }), 'Run `npx nuxt-backend email sync` to create it.'],
    ['the provider lost the webhook', synced({ webhook: { action: 'missing' } }), 'The email provider has no webhook for the deployment\'s /email/events.'],
    ['the provider returned no new secret', synced({ webhook: { secret: undefined } }), 'The email provider did not return the new signing secret.'],
  ])('refuses when %s, and writes nothing', async (_case, handler, message) => {
    if (handler) deployment.functions['email:syncEmail'] = handler as (args: Record<string, unknown>) => unknown
    expect(await runRotate(rootDir, 'EMAIL_WEBHOOK_SECRET', {}, print, clock)).toEqual({ exitCode: 1, output: null })
    expect(lines.at(-1)).toContain(message)
    expect(lines.at(-1)).toMatch(/^\[nuxt-backend\] env rotate refused: /)
    expect(deployment.env.size).toBe(0)
  })
})

describe('env rotate BILLING_WEBHOOK_SECRET, at the billing provider', () => {
  let fake: PolarFake
  beforeEach(() => {
    fake = createPolarFake({ baseUrl: 'http://127.0.0.1:4747', fetcher: async () => new Response('Accepted', { status: 202 }) })
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => fake.handle(new Request(input, init)))
    deployment.env.set('BILLING_WEBHOOK_SECRET', 'whsec_old')
  })
  afterEach(async () => {
    await fake.idle()
    fake.close()
  })

  const endpointSecret = () => Object.values(fake.state.endpoints).find(endpoint => endpoint.url === BILLING_ENDPOINT)!.secret

  it('resets the deployment\'s endpoint at the provider, holds new,old, then the new one alone', async () => {
    writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:happy-otter-123\nBILLING_ACCESS_TOKEN=polar_oat_sandbox\n')
    fake.ensureEndpoint(BILLING_ENDPOINT, 'whsec_old')
    const { exitCode, output } = await runRotate(rootDir, 'BILLING_WEBHOOK_SECRET', {}, print, clock)
    expect(exitCode).toBe(0)
    const fresh = endpointSecret()
    expect(fresh).not.toBe('whsec_old')
    expect(deployment.calls.filter(call => call.args[1] === 'set').map(call => call.input)).toEqual([`${fresh},whsec_old`, fresh])
    expect(deployment.env.get('BILLING_WEBHOOK_SECRET')).toBe(fresh)
    expect(output?.state).toBe('rotated')
    expect(exposed()).not.toContain('whsec_')
  })

  it('plans the reset and both writes on a dry run, and asks the provider nothing', async () => {
    const reached = vi.fn(fake.handle)
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => reached(new Request(input, init)))
    const { output } = await runRotate(rootDir, 'BILLING_WEBHOOK_SECRET', { dryRun: true }, print, clock)
    expect(output?.steps.map(step => step.outcome)).toEqual(['planned', 'planned', 'planned'])
    expect(reached).not.toHaveBeenCalled()
    expect(deployment.env.get('BILLING_WEBHOOK_SECRET')).toBe('whsec_old')
  })

  it('refuses without a token here, and reads production\'s from the shell alone', async () => {
    await runRotate(rootDir, 'BILLING_WEBHOOK_SECRET', {}, print, clock)
    expect(lines.at(-1)).toBe('[nuxt-backend] env rotate refused: BILLING_ACCESS_TOKEN is not visible here: the endpoint\'s secret is reset with it.')
    writeFileSync(join(rootDir, '.env.local'), 'BILLING_ACCESS_TOKEN=polar_oat_sandbox\n')
    await runRotate(rootDir, 'BILLING_WEBHOOK_SECRET', { prod: true }, print, clock)
    expect(lines.at(-1)).toContain('(under --prod, only the process env speaks for production)')
    expect(deployment.env.get('BILLING_WEBHOOK_SECRET')).toBe('whsec_old')
  })

  it('refuses when the provider has no endpoint at the deployment, naming the sync that creates it', async () => {
    vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_oat_production')
    await runRotate(rootDir, 'BILLING_WEBHOOK_SECRET', { prod: true }, print, clock)
    expect(lines.at(-1)).toBe(`[nuxt-backend] env rotate refused: The billing provider has no webhook endpoint at ${BILLING_ENDPOINT}. Run \`npx nuxt-backend billing sync --env production\` to create it.`)
  })

  it('refuses when the deployment\'s own address cannot be read, or holds no secret yet', async () => {
    vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_oat_sandbox')
    deployment.url = null
    await runRotate(rootDir, 'BILLING_WEBHOOK_SECRET', {}, print, clock)
    expect(lines.at(-1)).toContain('the deployment could not be read')

    deployment.env.clear()
    await runRotate(rootDir, 'BILLING_WEBHOOK_SECRET', {}, print, clock)
    expect(lines.at(-1)).toContain('BILLING_WEBHOOK_SECRET is not set on the deployment')
  })
})

describe('env rotate, the command', () => {
  it('prints the steps and the state as one JSON document under --json, never a value', async () => {
    deployment.env.set('AUTH_SECRET', OLD)
    const stdout: string[] = []
    const stderr: string[] = []
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => void stdout.push(String(line)))
    vi.spyOn(console, 'error').mockImplementation((line: unknown) => void stderr.push(String(line)))
    await runCommand(envRotate, { rawArgs: ['AUTH_SECRET', '--cwd', rootDir, '--dry-run', '--json'] })
    expect(stdout).toHaveLength(1)
    expect(JSON.parse(stdout[0]!)).toMatchObject({ name: 'AUTH_SECRET', deployment: 'dev', dryRun: true, state: 'rotating' })
    expect(stderr[0]).toBe('[nuxt-backend] env rotate AUTH_SECRET → the dev deployment — dry run')
    expect(`${stdout.join('')}${stderr.join('')}`).not.toContain(OLD)
    expect(process.exitCode).toBeUndefined()
  })

  it('exits 1 on a refusal, and prints no JSON', async () => {
    const stdout: string[] = []
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => void stdout.push(String(line)))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await runCommand(envRotate, { rawArgs: ['SITE_URL', '--cwd', rootDir, '--json'] })
    expect(process.exitCode).toBe(1)
    expect(stdout).toEqual([])
  })
})
