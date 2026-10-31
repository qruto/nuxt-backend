import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runCommand } from 'citty'
import { main } from '../../src/cli/main'
import { runConvex } from '../../src/convex-cli'

// `nuxt-backend inbox`: a coding agent's way to read a sign-in code on a dev
// deployment. It reads the dev inbox (the provider's log of sent email, read by
// the component's action) through the Convex CLI,
// and refuses every deployment that is not a dev one, and every address that
// is not a test one, before the CLI is ever started.

const inbox = vi.hoisted(() => ({ messages: [] as unknown[] }))
vi.mock('../../src/convex-cli', () => ({
  runConvex: vi.fn(async () => ({ stdout: JSON.stringify(inbox.messages), stderr: '' })),
}))

const NOW = Date.now()
const SIGN_IN = {
  from: 'onboarding@resend.dev',
  subject: 'Your sign-in code',
  text: 'Use 482913 to sign in. It expires in 10 minutes.',
  html: '<style>.c{color:#123456}</style><p>Use <b>482913</b> to sign in.</p>',
  receivedAt: NOW - 30_000,
}

let rootDir: string
let printed: string[]

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'cli-inbox-'))
  writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:happy-otter-123\n')
  for (const name of ['CONVEX_DEPLOY_KEY', 'CONVEX_DEPLOYMENT_TOKEN', 'CONVEX_DEPLOYMENT', 'CONVEX_SELF_HOSTED_URL']) vi.stubEnv(name, undefined)
  inbox.messages = [SIGN_IN, { from: 'onboarding@resend.dev', subject: 'Welcome', text: 'Hello there.', receivedAt: NOW - 120_000 }]
  vi.mocked(runConvex).mockClear()
  printed = []
  for (const method of ['log', 'error'] as const) {
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

async function run(args: string[]) {
  await runCommand(main, { rawArgs: ['inbox', ...args, '--cwd', rootDir] })
}

describe('reading the inbox', () => {
  it('reads the component\'s inbox for the address, and prints its codes as one JSON document', async () => {
    await run(['Delivered+Agent@resend.dev', '--json'])

    expect(vi.mocked(runConvex).mock.calls.map(([, args]) => args)).toEqual([
      ['run', '--component', 'backend', 'email:inbox', JSON.stringify({ address: 'delivered+agent@resend.dev' })],
    ])
    const report = JSON.parse(vi.mocked(console.log).mock.calls.flat().join('\n'))
    expect(report).toEqual({
      address: 'delivered+agent@resend.dev',
      deployment: 'dev:happy-otter-123',
      messages: [
        { from: 'onboarding@resend.dev', subject: 'Your sign-in code', receivedAt: SIGN_IN.receivedAt, code: '482913' },
        { from: 'onboarding@resend.dev', subject: 'Welcome', receivedAt: NOW - 120_000, code: null },
      ],
      code: '482913',
    })
    expect(process.exitCode).toBeUndefined()
  })

  it('never prints a message body', async () => {
    await run([])
    await run(['--json'])

    const output = printed.join('\n')
    expect(output).toContain('482913')
    expect(output).not.toContain('expires in 10 minutes')
    expect(output).not.toContain('<p>')
  })

  it('reads delivered@resend.dev when no address is given', async () => {
    await run([])
    expect(vi.mocked(runConvex).mock.calls[0]![1].at(-1)).toBe(JSON.stringify({ address: 'delivered@resend.dev' }))
  })

  it('says so when the inbox is empty, and still exits 0', async () => {
    inbox.messages = []
    await run(['--json'])

    expect(JSON.parse(vi.mocked(console.log).mock.calls.flat().join('\n'))).toMatchObject({ messages: [], code: null })
    expect(process.exitCode).toBeUndefined()
  })

  it('reads with a dev deploy key, which the Convex CLI follows', async () => {
    vi.stubEnv('CONVEX_DEPLOY_KEY', 'dev:happy-otter-123|secret')
    await run(['--json'])

    expect(vi.mocked(runConvex)).toHaveBeenCalled()
    expect(JSON.parse(vi.mocked(console.log).mock.calls.flat().join('\n')).deployment).toBeNull()
  })

  it('exits 1 when the read fails', async () => {
    vi.mocked(runConvex).mockRejectedValueOnce(new Error('convex run exited with code 1'))
    await run([])

    expect(process.exitCode).toBe(1)
    expect(printed.join('\n')).toContain('Could not read the inbox')
  })

  it('exits 1 and names what came back when the read is not a list of messages', async () => {
    vi.mocked(runConvex).mockResolvedValueOnce({ stdout: JSON.stringify({ unexpected: true }), stderr: '' })
    await run(['--json'])

    expect(process.exitCode).toBe(1)
    expect(printed.join('\n')).toContain('email:inbox returned {"unexpected":true}, not a list of messages')
  })
})

describe('what it refuses, before the Convex CLI starts', () => {
  it.each([
    ['--prod', () => {}, ['--prod'], '--prod is refused'],
    ['a production deploy key', () => vi.stubEnv('CONVEX_DEPLOY_KEY', 'prod:determined-horse-300|secret'), [], 'a production deploy key'],
    ['a legacy key, which is a production one', () => vi.stubEnv('CONVEX_DEPLOY_KEY', 'determined-horse-300|secret'), [], 'a production deploy key'],
    ['a preview deploy key', () => vi.stubEnv('CONVEX_DEPLOY_KEY', 'preview:team:project|secret'), [], 'a preview deploy key'],
    ['a production key kept in .env.local', () => writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:happy-otter-123\nCONVEX_DEPLOY_KEY=prod:determined-horse-300|secret\n'), [], 'a production deploy key'],
    ['a deployment that is not dev-class', () => writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=prod:determined-horse-300\n'), [], 'CONVEX_DEPLOYMENT is prod:'],
    ['no deployment at all', () => writeFileSync(join(rootDir, '.env.local'), ''), [], 'No dev deployment is configured'],
    ['a self-hosted deployment', () => vi.stubEnv('CONVEX_SELF_HOSTED_URL', 'https://convex.example.com'), [], 'self-hosted'],
    ['an address with no dev inbox', () => {}, ['someone@example.com'], 'has no dev inbox'],
  ])('%s', async (_label, setup, args, message) => {
    setup()
    await run(args)

    expect(process.exitCode).toBe(1)
    expect(vi.mocked(runConvex)).not.toHaveBeenCalled()
    expect(printed.join('\n')).toContain(message)
  })
})
