import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { runCommand } from 'citty'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deploy } from '../../src/cli/deploy'
import { createPolarFake } from '../fixtures/polar-fake/server'

// `nuxt-backend deploy` as a person or a host's build runs it: the flags,
// the refusals, what reaches production through the project's Convex CLI
// (an in-memory stand-in here: env names, env set on stdin, `convex deploy`,
// a deploy key), what reaches the linked Vercel project through a fake
// `vercel` on PATH, and what is printed where. cli-deploy.test.ts holds the
// steps themselves, against stand-ins for every seam.

const CLOUD = 'https://happy-otter-123.convex.cloud'
const DEPLOY_KEY = 'prod:happy-otter-123|host-deploy-key-secret'

const production = vi.hoisted(() => ({
  env: new Map<string, string>(),
  /** Whether the project has a production deployment: one that does not answers no env list. */
  exists: true,
  calls: [] as Array<{ args: string[], input?: string }>,
  spawned: [] as string[][],
}))
vi.mock('../../src/convex-cli', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/convex-cli')>(),
  runConvex: vi.fn(async (_rootDir: string, args: string[], options: { input?: string } = {}) => {
    production.calls.push({ args, ...(options.input === undefined ? {} : { input: options.input }) })
    const words = args.filter(arg => arg !== '--prod')
    if (words[0] === 'deployment' && words[1] === 'create') {
      production.exists = true
      return { stdout: 'Created', stderr: '' }
    }
    if (!production.exists) throw new Error(`convex ${words[0]} exited with code 1: no production deployment`)
    if (words[0] === 'env' && words[1] === 'list') return { stdout: [...production.env.keys()].join('\n'), stderr: '' }
    if (words[0] === 'env' && words[1] === 'get') return { stdout: `${production.env.get(words[2]!) ?? ''}\n`, stderr: '' }
    if (words[0] === 'env' && words[1] === 'set') {
      production.env.set(words[2]!, options.input!)
      return { stdout: '', stderr: '' }
    }
    if (words[0] === 'function-spec') return { stdout: JSON.stringify({ url: CLOUD, functions: [] }), stderr: '' }
    if (words[0] === 'deploy') return { stdout: 'Deployed', stderr: '' }
    if (words[0] === 'deployment' && words[1] === 'token') return { stdout: `Created a deploy key.\n${'prod:happy-otter-123|host-deploy-key-secret'}\n`, stderr: '' }
    throw Object.assign(new Error(`convex ${words[0]} exited with code 1: Could not find function`), { missingFunction: true })
  }),
  spawnConvex: vi.fn(async (_rootDir: string, args: string[]) => {
    production.spawned.push(args)
    return 0
  }),
}))

let dir: string
let rootDir: string
let stdout: string[]
let stderr: string[]

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'deploy-command-')))
  rootDir = join(dir, 'app')
  mkdirSync(rootDir)
  for (const name of ['CONVEX_DEPLOY_KEY', 'CONVEX_DEPLOYMENT_TOKEN', 'CONVEX_DEPLOYMENT', 'SITE_URL', 'NUXT_SITE_URL', 'BILLING_ACCESS_TOKEN', 'EMAIL_API_KEY', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_BRANCH_URL', 'BACKEND_ENVIRONMENT']) vi.stubEnv(name, undefined)
  production.env.clear()
  production.exists = true
  production.calls.length = 0
  production.spawned.length = 0
  stdout = []
  stderr = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void stdout.push(args.join(' ')))
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void stderr.push(args.join(' ')))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  // doctor --prod probes the site and the routes: nothing answers.
  vi.stubGlobal('fetch', vi.fn(async () => {
    throw new TypeError('fetch failed')
  }))
  process.exitCode = undefined
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  process.exitCode = undefined
})

const run = (...args: string[]) => runCommand(deploy, { rawArgs: ['--cwd', rootDir, ...args] })
const sets = () => production.calls.filter(call => call.args[0] === 'env' && call.args[1] === 'set')

/** A fake `vercel` on PATH that logs each call and its stdin, linked to a project. */
function linkVercel(): () => Array<{ args: string[], stdin: string }> {
  const bin = join(dir, 'bin')
  const log = join(dir, 'vercel.jsonl')
  mkdirSync(bin)
  mkdirSync(join(rootDir, '.vercel'))
  writeFileSync(join(rootDir, '.vercel/project.json'), JSON.stringify({ projectId: 'prj_panels', orgId: 'team_acme' }))
  writeFileSync(join(dir, 'vercel.cjs'), `
const fs = require('node:fs')
let stdin = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => { stdin += chunk })
process.stdin.on('end', () => {
  fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ args: process.argv.slice(2), stdin }) + '\\n')
})
`)
  writeFileSync(join(bin, 'vercel'), `#!/bin/sh\nexec "${process.execPath}" "${join(dir, 'vercel.cjs')}" "$@"\n`)
  chmodSync(join(bin, 'vercel'), 0o755)
  vi.stubEnv('PATH', bin)
  return () => {
    try {
      return readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as { args: string[], stdin: string })
    }
    catch {
      return []
    }
  }
}

describe('nuxt-backend deploy, the command', () => {
  it('refuses another flag beside --build, and changes nothing', async () => {
    for (const flag of ['--sandbox', '--dry-run']) {
      process.exitCode = undefined
      await run('--build', flag)
      expect(process.exitCode).toBe(1)
    }
    expect(stderr).toEqual(Array.from({ length: 2 }, () => '[nuxt-backend] deploy --build takes no other flag: it never sets BACKEND_ENVIRONMENT, and it writes.'))
    expect(production.calls).toEqual([])
    expect(production.spawned).toEqual([])
  })

  it('refuses a deploy key for another deployment, without quoting it', async () => {
    writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOY_KEY=dev:happy-otter-123|dev-key-secret\n')
    await run()
    expect(process.exitCode).toBe(1)
    expect(stderr.join('\n')).toContain('deploy refused: CONVEX_DEPLOY_KEY is a dev deployment key')
    expect(stderr.join('\n')).not.toContain('dev-key-secret')
    expect(production.calls).toEqual([])
  })

  it('as the host\'s build command, puts the first push\'s env on production by stdin, then ships both halves', async () => {
    vi.stubEnv('CONVEX_DEPLOY_KEY', DEPLOY_KEY)
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'panels.vercel.app')
    await run('--build')
    expect(sets().map(call => call.args)).toEqual([['env', 'set', '--prod', 'AUTH_SECRET'], ['env', 'set', '--prod', 'SITE_URL']])
    expect(production.env.get('SITE_URL')).toBe('https://panels.vercel.app')
    expect(production.spawned).toEqual([['deploy', '--cmd', 'npm run build', '--cmd-url-env-var-name', 'NUXT_PUBLIC_BACKEND_URL']])
    expect(process.exitCode).toBe(0)
    expect(stderr.join('\n')).not.toContain(production.env.get('AUTH_SECRET')!)
  })

  it('prints every step it would take as one JSON document under --dry-run --json, and writes nothing', async () => {
    for (const name of ['AUTH_SECRET', 'SITE_URL']) production.env.set(name, 'kept')
    production.env.set('BACKEND_ENVIRONMENT', 'production')
    await run('--dry-run', '--json')
    expect(stdout).toHaveLength(1)
    const report = JSON.parse(stdout[0]!) as { dryRun: boolean, host: string, steps: Array<{ id: string, outcome: string }>, doctor: unknown }
    expect(report).toMatchObject({ dryRun: true, host: 'other', doctor: null })
    expect(report.steps.every(step => step.outcome !== 'done')).toBe(true)
    expect(stderr[0]).toBe('[nuxt-backend] deploy → production, a host you set by hand — dry run')
    expect(sets()).toEqual([])
    expect(production.calls.some(call => call.args[0] === 'deploy')).toBe(false)
  })

  it('at a terminal, pushes the backend with the CLI\'s own output, and names what to set on another host', async () => {
    for (const name of ['AUTH_SECRET', 'SITE_URL']) production.env.set(name, 'kept')
    production.env.set('BACKEND_ENVIRONMENT', 'production')
    await run()
    expect(production.spawned).toEqual([['deploy']])
    expect(stdout[0]).toBe('[nuxt-backend] deploy → production, a host you set by hand')
    expect(stdout.join('\n')).toContain(`NUXT_PUBLIC_BACKEND_URL=${CLOUD}`)
  }, 60_000)

  it('fails the email webhook step when the provider cannot be reached, and goes on to the gate, the key never printed', async () => {
    for (const name of ['AUTH_SECRET', 'SITE_URL', 'EMAIL_API_KEY']) production.env.set(name, 'kept')
    production.env.set('BACKEND_ENVIRONMENT', 'production')
    const key = 're_shell-only-production-email-key'
    vi.stubEnv('EMAIL_API_KEY', key)
    await run('--json')
    const report = JSON.parse(stdout.at(-1)!) as { steps: Array<{ id: string, outcome: string, detail: string }>, doctor: unknown }
    const steps = Object.fromEntries(report.steps.map(step => [step.id, step]))
    expect(steps['email-webhook']).toMatchObject({ outcome: 'failed', detail: expect.stringContaining('(a key restricted to sending cannot manage webhooks)') })
    // Production's own email sync ran on the deployment, which has none to run.
    expect(steps['email-sync']).toMatchObject({ outcome: 'skipped', detail: expect.stringContaining('production has no email:syncEmail') })
    expect(production.calls.some(call => call.args.join(' ').startsWith('run --prod email:syncEmail'))).toBe(true)
    expect(report.doctor).not.toBeNull()
    expect(process.exitCode).toBe(1)
    expect(`${stdout.join('\n')}\n${stderr.join('\n')}`).not.toContain(key)
  }, 60_000)

  it('at a terminal, creates the production deployment only after a person says yes, and asks for each key it lacks', async () => {
    production.exists = false
    vi.stubEnv('CI', '')
    vi.stubEnv('SITE_URL', 'https://panels.example')
    const terminal = Object.assign(new PassThrough(), { isTTY: true })
    vi.spyOn(process, 'stdin', 'get').mockReturnValue(terminal as unknown as typeof process.stdin)
    // The person at the terminal: yes to the deployment, Enter past each key.
    const screen: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      const text = String(chunk)
      screen.push(text)
      if (text.includes('Create the project\'s production deployment')) setImmediate(() => terminal.write('y\r'))
      else if (text.startsWith('Paste ')) setImmediate(() => terminal.write('\r'))
      return true
    })
    await run()
    expect(production.calls.some(call => call.args.join(' ') === 'deployment create --type prod --default')).toBe(true)
    expect(screen.filter(text => text.startsWith('Paste ')).map(text => text.split(' (')[0])).toEqual(['Paste the production billing access token', 'Paste the email API key'])
    expect(production.env.get('BACKEND_ENVIRONMENT')).toBe('production')
    expect(production.spawned).toEqual([['deploy']])
  }, 60_000)

  it('in CI, asks nothing, and creates no production deployment', async () => {
    production.exists = false
    vi.stubEnv('CI', '1')
    vi.spyOn(process, 'stdin', 'get').mockReturnValue(Object.assign(new PassThrough(), { isTTY: true }) as unknown as typeof process.stdin)
    await run()
    expect(process.exitCode).toBe(1)
    expect(production.calls.some(call => call.args[0] === 'deployment')).toBe(false)
    expect(stdout.join('\n')).toContain('npx convex deployment create --type prod --default')
  })

  it('syncs the catalog to production\'s billing with the shell\'s token, stores the webhook\'s secret on production, and pushes again for the new ids', async () => {
    mkdirSync(join(rootDir, 'backend'))
    writeFileSync(join(rootDir, 'backend/billing.catalog.ts'), 'export default { plans: { pro: { name: \'Pro\', prices: { month: 900 } } } }\n')
    for (const name of ['AUTH_SECRET', 'SITE_URL', 'BILLING_ACCESS_TOKEN']) production.env.set(name, 'kept')
    production.env.set('BACKEND_ENVIRONMENT', 'production')
    const token = 'polar_oat_shell-only-token'
    vi.stubEnv('BILLING_ACCESS_TOKEN', token)
    const fake = createPolarFake({ baseUrl: 'http://127.0.0.1:4747', fetcher: async () => new Response('Accepted', { status: 202 }) })
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => fake.handle(new Request(input, init)))
    try {
      await run('--json')
      const report = JSON.parse(stdout.at(-1)!) as { steps: Array<{ id: string, outcome: string, detail: string }> }
      const steps = Object.fromEntries(report.steps.map(step => [step.id, step]))
      expect(steps['billing-catalog']).toMatchObject({ outcome: 'done', detail: expect.stringContaining('synced to Polar\'s production; webhook created, secret stored') })
      const endpoint = Object.values(fake.state.endpoints).find(entry => entry.url === 'https://happy-otter-123.convex.site/billing/events')!
      expect(production.env.get('BILLING_WEBHOOK_SECRET')).toBe(endpoint.secret)
      // The first push bundled the old id map: the new one goes up too.
      expect(steps['billing-ids']).toMatchObject({ outcome: 'done' })
      expect(production.calls.filter(call => call.args.join(' ') === 'deploy')).toHaveLength(2)
      expect(existsSync(join(rootDir, 'backend/billing.generated.ts'))).toBe(true)
      expect(`${stdout.join('\n')}\n${stderr.join('\n')}`).not.toContain(endpoint.secret)
      expect(`${stdout.join('\n')}\n${stderr.join('\n')}`).not.toContain(token)
    }
    finally {
      await fake.idle()
      fake.close()
    }
  }, 60_000)

  it.each([
    { provider: 'cannot be reached', says: 'fetch failed', answer: (): Response => {
      throw new TypeError('fetch failed')
    } },
    // A provider that quotes the refused token back in its answer, which the SDK puts in its error.
    { provider: 'refuses the token', says: 'Status 401', answer: (token: string): Response => Response.json({ error: 'invalid_token', detail: `The access token ${token} is invalid.` }, { status: 401 }) },
  ])('fails the billing catalog step when the provider $provider, runs every step after it, and prints one JSON report, the token never printed', async ({ says, answer }) => {
    mkdirSync(join(rootDir, 'backend'))
    writeFileSync(join(rootDir, 'backend/billing.catalog.ts'), 'export default { plans: { pro: { name: \'Pro\', prices: { month: 900 } } } }\n')
    for (const name of ['AUTH_SECRET', 'SITE_URL', 'BILLING_ACCESS_TOKEN', 'EMAIL_API_KEY']) production.env.set(name, 'kept')
    production.env.set('BACKEND_ENVIRONMENT', 'production')
    const token = 'polar_oat_shell-only-refused-token'
    vi.stubEnv('BILLING_ACCESS_TOKEN', token)
    vi.stubEnv('EMAIL_API_KEY', 're_shell-only-production-email-key')
    // The billing provider answers its token; nothing else answers at all.
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (new Request(input, init).headers.get('authorization') === `Bearer ${token}`) return answer(token)
      throw new TypeError('fetch failed')
    })
    await run('--json')
    expect(stdout).toHaveLength(1)
    const report = JSON.parse(stdout[0]!) as { steps: Array<{ id: string, outcome: string, detail: string }>, doctor: unknown }
    const ids = report.steps.map(step => step.id)
    expect(report.steps.find(step => step.id === 'billing-catalog')).toMatchObject({ outcome: 'failed', detail: expect.stringContaining(says) })
    expect(ids.slice(ids.indexOf('billing-catalog') + 1)).toEqual(['email-webhook', 'email-sync', 'app-env', 'gate'])
    expect(report.doctor).not.toBeNull()
    expect(process.exitCode).toBe(1)
    expect(`${stdout.join('\n')}\n${stderr.join('\n')}`).not.toContain(token)
  }, 60_000)

  it.skipIf(process.platform === 'win32')('on a linked Vercel project, writes the app\'s env through the Vercel CLI on stdin, a new deploy key among it', async () => {
    const vercel = linkVercel()
    for (const name of ['AUTH_SECRET', 'SITE_URL']) production.env.set(name, 'kept')
    production.env.set('BACKEND_ENVIRONMENT', 'production')
    await run('--json')
    // Under --json the push's output stays off stdout: the CLI runs piped.
    expect(production.calls.some(call => call.args.join(' ') === 'deploy')).toBe(true)
    expect(production.spawned).toEqual([])
    expect(production.calls.some(call => call.args.join(' ') === 'deployment token create nuxt-backend-host --prod')).toBe(true)
    const added = vercel().filter(call => call.args[1] === 'add')
    expect(added.map(call => call.args)).toEqual([
      ['env', 'add', 'NUXT_PUBLIC_BACKEND_URL', 'production'],
      ['env', 'add', 'CONVEX_DEPLOY_KEY', 'production'],
      ['env', 'add', 'PROTECTION_PROOF_SECRET', 'production'],
    ])
    expect(added.map(call => call.stdin).slice(0, 2)).toEqual([CLOUD, DEPLOY_KEY])
    expect(added[2]!.stdin).toBe(production.env.get('PROTECTION_PROOF_SECRET'))
    const report = JSON.parse(stdout.at(-1)!) as { host: string, doctor: { fail: number } | null }
    expect(report.host).toBe('vercel')
    expect(report.doctor).not.toBeNull()
    // doctor --prod gates the exit code.
    expect(process.exitCode).toBe(report.doctor!.fail > 0 ? 1 : undefined)
    expect(`${stdout.join('\n')}\n${stderr.join('\n')}`).not.toContain('host-deploy-key-secret')
    expect(`${stdout.join('\n')}\n${stderr.join('\n')}`).not.toContain(production.env.get('PROTECTION_PROOF_SECRET')!)
  }, 60_000)
})
