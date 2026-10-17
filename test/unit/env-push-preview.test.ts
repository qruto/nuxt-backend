import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runCommand } from 'citty'
import { main } from '../../src/cli/main'
import { resolveConvexCli } from '../../src/convex-cli'

// `env push --preview` and `env push --defaults`, run as a coding agent or a
// CI build runs them, against a stand-in `convex` that records every call.
// What reaches the Convex CLI matters most here: the flags that pick the
// target (a preview by name, a type's project defaults), each value on stdin,
// and nothing at all when the target is refused.

/**
 * The stand-in `convex`: answers `env list` with FAKE_CONVEX_NAMES and
 * `env default list` with FAKE_CONVEX_DEFAULTS, accepts every set, and
 * appends `{ args, stdin }` to convex-calls.jsonl for each call.
 */
const FAKE_CONVEX = `
const { appendFileSync } = require('node:fs')
const args = process.argv.slice(2)
let stdin = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => { stdin += chunk })
process.stdin.on('end', () => {
  appendFileSync('convex-calls.jsonl', JSON.stringify({ args, stdin }) + '\\n')
  const list = (names) => process.stdout.write((names || '').split(',').join('\\n'))
  if (args[0] === 'env' && args[1] === 'default' && args[2] === 'list') return void list(process.env.FAKE_CONVEX_DEFAULTS)
  if (args[0] === 'env' && args[1] === 'list') return void list(process.env.FAKE_CONVEX_NAMES)
  if (args[0] === 'env' && (args[1] === 'set' || (args[1] === 'default' && args[2] === 'set'))) return
  process.stderr.write('unknown command\\n')
  process.exitCode = 1
})
`

const EMAIL_KEY = 're_SECRET_email_key_0123456789abcdef'

let rootDir: string
let printed: string[]

beforeEach(() => {
  rootDir = realpathSync(mkdtempSync(join(tmpdir(), 'env-push-preview-')))
  const pkg = join(rootDir, 'node_modules/convex')
  mkdirSync(join(pkg, 'bin'), { recursive: true })
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'convex', version: '0.0.0-test', bin: { convex: 'bin/main.js' } }))
  writeFileSync(join(pkg, 'bin/main.js'), FAKE_CONVEX)
  // The stand-in, never the real CLI: a real one would reach a real deployment.
  expect(resolveConvexCli(rootDir)).toBe(join(pkg, 'bin/main.js'))
  writeFileSync(join(rootDir, '.env.local'), `CONVEX_DEPLOYMENT=dev:fake-deployment-000\nSITE_URL=http://localhost:4000\nEMAIL_API_KEY=${EMAIL_KEY}\n`)
  for (const name of ['CONVEX_DEPLOY_KEY', 'CONVEX_DEPLOYMENT_TOKEN', 'CONVEX_DEPLOYMENT', 'VERCEL', 'VERCEL_GIT_COMMIT_REF', 'NETLIFY', 'CF_PAGES', 'WORKERS_CI', 'CI', 'GITHUB_HEAD_REF', 'CI_COMMIT_REF_NAME']) vi.stubEnv(name, undefined)
  vi.stubEnv('FAKE_CONVEX_NAMES', '')
  vi.stubEnv('FAKE_CONVEX_DEFAULTS', '')
  printed = []
  for (const method of ['log', 'error', 'warn', 'info'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      printed.push(args.map(String).join(' '))
    })
  }
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  process.exitCode = undefined
})

/** Every `convex` call the stand-in saw. */
function calls(): Array<{ args: string[], stdin: string }> {
  const log = join(rootDir, 'convex-calls.jsonl')
  if (!existsSync(log)) return []
  return readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line) as { args: string[], stdin: string })
}

/** The sets, by name: the arguments and the value, which arrived on stdin. */
function sets(): Record<string, { args: string[], value: string }> {
  return Object.fromEntries(calls()
    .filter(call => call.args.includes('set'))
    .map(call => [call.args.at(-1)!, { args: call.args, value: call.stdin.replace(/\n$/, '') }]))
}

async function push(args: string[]) {
  await runCommand(main, { rawArgs: ['env', 'push', ...args, '--cwd', rootDir] })
}

describe('env push --preview', () => {
  it('fills the named preview: a generated secret, the given origin, test-mode mail and sandbox billing', async () => {
    await push(['--preview', 'feat-login', '--site-url', 'https://feat-login.example.app/'])

    expect(process.exitCode).toBeUndefined()
    const written = sets()
    expect(Object.keys(written).sort()).toEqual(['AUTH_SECRET', 'BILLING_ENVIRONMENT', 'EMAIL_API_KEY', 'EMAIL_TEST_MODE', 'SITE_URL'])
    for (const { args } of Object.values(written)) expect(args.slice(0, 4)).toEqual(['env', 'set', '--preview-name', 'feat-login'])
    expect(written.SITE_URL!.value).toBe('https://feat-login.example.app')
    expect(written.EMAIL_TEST_MODE!.value).toBe('true')
    expect(written.BILLING_ENVIRONMENT!.value).toBe('sandbox')
    expect(written.AUTH_SECRET!.value.length).toBeGreaterThanOrEqual(43)
    // Every read names the preview too, and no value is ever an argument.
    expect(calls().every(call => call.args.includes('--preview-name'))).toBe(true)
    for (const { args, value } of Object.values(written)) expect(args).not.toContain(value)
    expect(printed.join('\n')).not.toContain(EMAIL_KEY)
  })

  it('never takes .env.local\'s SITE_URL, the dev app\'s origin: without --site-url it is missing', async () => {
    await push(['--preview', 'feat-login'])

    expect(process.exitCode).toBe(1)
    expect(sets().SITE_URL).toBeUndefined()
    expect(printed.join('\n')).toContain('--site-url')
  })

  it('replaces a SITE_URL the preview already holds when one is given', async () => {
    vi.stubEnv('FAKE_CONVEX_NAMES', 'AUTH_SECRET,SITE_URL')
    await push(['--site-url', 'https://feat-login.example.app', '--preview', 'feat-login'])

    expect(Object.keys(sets())).toContain('SITE_URL')
    expect(Object.keys(sets())).not.toContain('AUTH_SECRET')
  })

  it('without a name, targets the branch the CI build names, as convex deploy does', async () => {
    vi.stubEnv('VERCEL', '1')
    vi.stubEnv('VERCEL_GIT_COMMIT_REF', 'feat/checkout')
    // Bare, and followed by another flag: that flag is not taken for the name.
    await push(['--preview', '--json', '--site-url', 'https://feat-checkout.example.app'])

    expect(calls()[0]!.args).toEqual(['env', 'list', '--names-only', '--preview-name', 'feat/checkout'])
    const report = JSON.parse(vi.mocked(console.log).mock.calls.flat().join('\n')) as { deployment: string }
    expect(report.deployment).toBe('preview:feat/checkout')
  })

  it.each([
    ['without a name outside a CI build', ['--preview'], 'needs the preview deployment\'s name'],
    ['beside --prod', ['--prod', '--preview', 'feat-login'], 'one target'],
  ])('is refused %s, before any call', async (_label, args, message) => {
    await push(args)

    expect(process.exitCode).toBe(1)
    expect(calls()).toEqual([])
    expect(printed.join('\n')).toContain(message)
  })

  it.each([['dev:fake-deployment-000|secret', 'dev'], ['prod:fake-prod-000|secret', 'prod']])('is refused with a %s key, which the Convex CLI would follow', async (key, type) => {
    vi.stubEnv('CONVEX_DEPLOY_KEY', key)
    await push(['--preview', 'feat-login', '--site-url', 'https://feat-login.example.app'])

    expect(process.exitCode).toBe(1)
    expect(calls()).toEqual([])
    expect(printed.join('\n')).toContain(`a ${type} deploy key`)
  })

  it('goes ahead with a preview key', async () => {
    vi.stubEnv('CONVEX_DEPLOY_KEY', 'preview:team:project|secret')
    await push(['--preview', 'feat-login', '--site-url', 'https://feat-login.example.app'])

    expect(process.exitCode).toBeUndefined()
    expect(Object.keys(sets())).toContain('SITE_URL')
  })
})

describe('env push --defaults', () => {
  it('writes the project\'s preview defaults, each value on stdin', async () => {
    await push(['--defaults', 'preview', '--site-url', 'https://preview.example.com'])

    expect(process.exitCode).toBeUndefined()
    expect(calls()[0]!.args).toEqual(['env', 'default', 'list', '--names-only', '--type', 'preview'])
    const written = sets()
    expect(Object.keys(written)).toEqual(['AUTH_SECRET', 'SITE_URL', 'EMAIL_TEST_MODE', 'BILLING_ENVIRONMENT'])
    for (const [name, { args }] of Object.entries(written)) expect(args).toEqual(['env', 'default', 'set', '--type', 'preview', name])
    expect(written.SITE_URL!.value).toBe('https://preview.example.com')
    // Defaults never carry the developer's own keys.
    expect(written.EMAIL_API_KEY).toBeUndefined()
    // Nor does any deployment get written.
    expect(calls().some(call => call.args[1] === 'set')).toBe(false)
  })

  it('writes nothing for previews without a SITE_URL to start them with', async () => {
    await push(['--defaults', 'preview'])

    expect(process.exitCode).toBe(1)
    expect(sets()).toEqual({})
    expect(printed.join('\n')).toContain('--site-url')
  })

  it('keeps defaults already set', async () => {
    vi.stubEnv('FAKE_CONVEX_DEFAULTS', 'AUTH_SECRET,SITE_URL,EMAIL_TEST_MODE')
    await push(['--defaults', 'preview'])

    expect(process.exitCode).toBeUndefined()
    expect(Object.keys(sets())).toEqual(['BILLING_ENVIRONMENT'])
  })

  it('gives dev defaults the dev server\'s origin', async () => {
    await push(['--defaults', 'dev'])

    expect(sets().SITE_URL).toEqual({ args: ['env', 'default', 'set', '--type', 'dev', 'SITE_URL'], value: 'http://localhost:3000' })
  })

  it.each([
    ['production', ['--defaults', 'prod'], 'production never starts from generated values'],
    ['an unknown type', ['--defaults', 'staging'], '--defaults takes preview or dev'],
    ['beside --prod', ['--defaults', 'preview', '--prod'], 'one target'],
    ['with a malformed --site-url', ['--defaults', 'preview', '--site-url', 'preview.example.com'], 'must be an http(s) URL'],
  ])('is refused for %s, before any call', async (_label, args, message) => {
    await push(args)

    expect(process.exitCode).toBe(1)
    expect(calls()).toEqual([])
    expect(printed.join('\n')).toContain(message)
  })

  it('is refused with a production deploy key in hand', async () => {
    vi.stubEnv('CONVEX_DEPLOY_KEY', 'prod:fake-prod-000|secret')
    await push(['--defaults', 'preview', '--site-url', 'https://preview.example.com'])

    expect(process.exitCode).toBe(1)
    expect(calls()).toEqual([])
  })
})
