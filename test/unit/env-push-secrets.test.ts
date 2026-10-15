import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runCommand } from 'citty'
import { runBillingSync } from '../../src/cli/billing'
import { main } from '../../src/cli/main'
import { runDev } from '../../src/cli/dev'
import { resolveConvexCli } from '../../src/convex-cli'
import { runEnvPush } from '../../src/env-push'

// Every value the package puts on a deployment goes through `convex env set`.
// Here that CLI is a stand-in that refuses every write, and nothing the
// package prints, reports or returns — `env push` (text and --json),
// `doctor --fix`, `nuxt-backend dev`, `billing sync` — may carry a value.
// The stand-in also records how it was called: each value reached it on
// stdin, never in argv, where any process on the machine could read it.

/**
 * The stand-in `convex`: a real Node script the package spawns as it would
 * the real one, answering the reads `billing sync` and `doctor` make, and
 * failing `env set` (or `run`) when FAKE_CONVEX_MODE says so. It appends
 * `{ args, stdin }` to convex-calls.jsonl in the project for every call.
 */
const FAKE_CONVEX = `
const { appendFileSync } = require('node:fs')
const args = process.argv.slice(2)
const mode = process.env.FAKE_CONVEX_MODE || ''
let stdin = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => { stdin += chunk })
process.stdin.on('end', () => {
  appendFileSync('convex-calls.jsonl', JSON.stringify({ args, stdin }) + '\\n')
  const [command, sub] = args
  if (command === 'env' && sub === 'list') return void process.stdout.write((process.env.FAKE_CONVEX_NAMES || '').split(',').join('\\n'))
  if (command === 'env' && sub === 'get') return void process.stdout.write('sandbox\\n')
  if (command === 'function-spec') return void process.stdout.write(JSON.stringify({ url: 'https://fake-deployment-000.convex.cloud', functions: [] }))
  if (command === 'env' && sub === 'set') {
    if (mode !== 'fail') return void process.stderr.write('Successfully set ' + args[args.length - 1] + '\\n')
    process.stderr.write('Error: the deployment refused the write\\n')
    process.exitCode = 1
    return
  }
  if (command === 'run') return void process.stdout.write('null\\n')
  process.stderr.write('unknown command\\n')
  process.exitCode = 1
})
`

const TOKEN = 'polar_oat_SECRET_token_0123456789abcdef'
const EMAIL_KEY = 're_SECRET_email_key_0123456789abcdef'
const WEBHOOK_SECRET = 'polar_whs_SECRET_webhook_0123456789abcdef'

let rootDir: string
let printed: string[]

beforeEach(() => {
  // Real path: the stand-in writes its call log relative to its cwd.
  rootDir = realpathSync(mkdtempSync(join(tmpdir(), 'env-push-secrets-')))
  const pkg = join(rootDir, 'node_modules/convex')
  mkdirSync(join(pkg, 'bin'), { recursive: true })
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'convex', version: '0.0.0-test', bin: { convex: 'bin/main.js' } }))
  writeFileSync(join(pkg, 'bin/main.js'), FAKE_CONVEX)
  // The stand-in, never the real CLI: a real one would reach a real deployment.
  expect(resolveConvexCli(rootDir)).toBe(join(pkg, 'bin/main.js'))

  mkdirSync(join(rootDir, 'backend'))
  writeFileSync(join(rootDir, 'backend/billing.catalog.ts'), 'export default { plans: {} }\n')
  writeFileSync(join(rootDir, '.env.local'), `CONVEX_DEPLOYMENT=dev:fake-deployment-000\nBILLING_ACCESS_TOKEN=${TOKEN}\nEMAIL_API_KEY=${EMAIL_KEY}\n`)
  for (const name of ['CONVEX_DEPLOY_KEY', 'CONVEX_DEPLOYMENT_TOKEN', 'CONVEX_DEPLOYMENT', 'BILLING_ACCESS_TOKEN', 'BILLING_ENVIRONMENT', 'EMAIL_API_KEY', 'NUXT_PUBLIC_BACKEND_SITE_URL', 'NUXT_PUBLIC_CONVEX_SITE_URL']) vi.stubEnv(name, undefined)
  vi.stubEnv('FAKE_CONVEX_MODE', 'fail')
  vi.stubEnv('FAKE_CONVEX_NAMES', '')
  printed = []
  for (const method of ['log', 'error', 'warn', 'info'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      printed.push(args.map(String).join(' '))
    })
  }
  // doctor probes the site's routes: never the network.
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  process.exitCode = undefined
})

/** Every `convex` call the stand-in saw. */
function calls(): Array<{ args: string[], stdin: string }> {
  return readFileSync(join(rootDir, 'convex-calls.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line) as { args: string[], stdin: string })
}

/** The secrets env push handles here: the two in .env.local, and the AUTH_SECRET it generates. */
function secrets(): string[] {
  return [TOKEN, EMAIL_KEY, ...envSets().filter(set => set.name === 'AUTH_SECRET').map(set => set.value)]
}

/** The `env set` calls: each value on stdin, none in argv. */
function envSets(): Array<{ name: string, args: string[], value: string }> {
  return calls()
    .filter(call => call.args[0] === 'env' && call.args[1] === 'set')
    .map(call => ({ name: call.args.at(-1)!, args: call.args, value: call.stdin.replace(/\n$/, '') }))
}

function expectNowhere(values: string[], ...haystacks: unknown[]) {
  const text = haystacks.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join('\n')
  for (const value of values) expect(text).not.toContain(value)
}

describe('a failing convex env set', () => {
  it('leaves every value out of env push\'s results, and hands each to the CLI on stdin', async () => {
    const run = await runEnvPush(rootDir, {})

    const failed = run!.results.filter(result => result.outcome === 'failed')
    expect(failed.map(result => result.action.name)).toEqual(expect.arrayContaining(['AUTH_SECRET', 'SITE_URL', 'BILLING_ACCESS_TOKEN', 'EMAIL_API_KEY']))
    for (const result of failed) expect(result.error).toBe('convex env set exited with code 1: Error: the deployment refused the write')

    // Not even a value that is no secret, like SITE_URL's default.
    const values = failed.map(result => result.action.value!)
    expect(values).toEqual(expect.arrayContaining([TOKEN, EMAIL_KEY, 'http://localhost:3000']))
    expectNowhere(values, failed.map(result => result.error), printed)
    const sets = envSets()
    expect(sets.map(set => set.name)).toEqual(failed.map(result => result.action.name))
    for (const [index, set] of sets.entries()) {
      expect(set.args).toEqual(['env', 'set', set.name])
      expect(set.value).toBe(values[index])
    }
  })

  it.each([
    ['env push --json', ['env', 'push', '--json']],
    ['env push', ['env', 'push']],
    ['doctor --fix --json', ['doctor', '--fix', '--json']],
    ['doctor --fix', ['doctor', '--fix']],
  ])('%s prints the failure, never the value', async (_label, args) => {
    await runCommand(main, { rawArgs: [...args, '--cwd', rootDir] })

    expect(printed.join('\n')).toContain('convex env set exited with code 1')
    expectNowhere(secrets(), printed)
  })

  it('env push --json reports the error per variable, and stays one JSON document', async () => {
    await runCommand(main, { rawArgs: ['env', 'push', '--json', '--cwd', rootDir] })

    const report = JSON.parse(vi.mocked(console.log).mock.calls.flat().join('\n')) as { results: Array<{ name: string, outcome: string, error?: string }> }
    expect(report.results.find(result => result.name === 'BILLING_ACCESS_TOKEN')).toMatchObject({ outcome: 'failed', error: 'convex env set exited with code 1: Error: the deployment refused the write' })
    expect(process.exitCode).toBe(1)
  })

  it('nuxt-backend dev logs the failure, never the value', async () => {
    const lines: string[] = []
    await runDev(rootDir, [], { convex: async () => 0, envPush: () => runEnvPush(rootDir, {}), log: line => lines.push(line) })

    expect(lines).toContain('env push: BILLING_ACCESS_TOKEN failed — convex env set exited with code 1: Error: the deployment refused the write')
    expectNowhere(secrets(), lines)
  })

  it('billing sync reports the secret it could not store, never the secret', async () => {
    vi.stubEnv('FAKE_CONVEX_NAMES', 'BILLING_ACCESS_TOKEN')
    const lines: string[] = []
    const { exitCode, report } = await runBillingSync(rootDir, {}, {
      sync: async (_catalog, options) => ({
        log: [{ action: 'created', kind: 'webhook', key: options.webhookUrl!, id: 'wh_1' }],
        ids: { products: {}, meters: {} },
        webhook: { id: 'wh_1', secret: WEBHOOK_SECRET, created: true },
      }),
      print: line => lines.push(line),
    })

    expect(exitCode).toBe(1)
    expect(report?.webhook).toMatchObject({ url: 'https://fake-deployment-000.convex.site/billing/events', secret: 'not-stored' })
    expect(lines.join('\n')).toContain('convex env set exited with code 1')
    expectNowhere([WEBHOOK_SECRET, TOKEN], lines, printed, report)
    expect(envSets()).toEqual([{ name: 'BILLING_WEBHOOK_SECRET', args: ['env', 'set', 'BILLING_WEBHOOK_SECRET'], value: WEBHOOK_SECRET }])
  })

  it('billing sync --env production writes production, on stdin too', async () => {
    vi.stubEnv('FAKE_CONVEX_MODE', '')
    vi.stubEnv('FAKE_CONVEX_NAMES', 'BILLING_ACCESS_TOKEN,BILLING_ENVIRONMENT')
    const lines: string[] = []
    const { exitCode } = await runBillingSync(rootDir, { environment: 'production' }, {
      sync: async (_catalog, options) => ({
        log: [{ action: 'created', kind: 'webhook', key: options.webhookUrl!, id: 'wh_1' }],
        ids: { products: {}, meters: {} },
        webhook: { id: 'wh_1', secret: WEBHOOK_SECRET, created: true },
      }),
      print: line => lines.push(line),
    })

    expect(exitCode).toBe(0)
    // Every call names production; the one value read is BILLING_ENVIRONMENT.
    expect(calls().every(call => call.args.includes('--prod'))).toBe(true)
    expect(envSets()).toEqual([{ name: 'BILLING_WEBHOOK_SECRET', args: ['env', 'set', '--prod', 'BILLING_WEBHOOK_SECRET'], value: WEBHOOK_SECRET }])
    expect(calls().filter(call => call.args[1] === 'get').map(call => call.args.at(-1))).toEqual(['BILLING_ENVIRONMENT'])
    expectNowhere([WEBHOOK_SECRET], lines, printed)
  })
})
