import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runEmailSyncCommand } from '../../src/cli/email'
import { runConvex } from '../../src/convex-cli'
import type { EmailSyncReport } from '../../src/convex/integrations/email-sync'
import type { InboundSyncReport } from '../../src/convex/integrations/inbound'

// `nuxt-backend email sync` runs the deployment's email sync, then its
// support inbox's (`email:syncInbound`), and folds that report into its log
// and its JSON. An app that does not re-export the inbound sync is told so in
// one line, and the rest of the sync stands.

const deployment = vi.hoisted(() => ({ functions: {} as Record<string, unknown> }))
vi.mock('../../src/convex-cli', () => ({
  runConvex: vi.fn(async (_rootDir: string, args: string[]) => {
    const name = args.find(arg => arg.startsWith('email:'))!
    if (!(name in deployment.functions)) throw new Error(`Could not find function for '${name}'`)
    return { stdout: JSON.stringify(deployment.functions[name]), stderr: '' }
  }),
}))

const REPORT: EmailSyncReport = {
  dryRun: false,
  key: 'full',
  log: [{ action: 'exists', kind: 'topic', key: 'news', id: 'top_1' }],
  webhook: { url: 'https://happy-otter-123.convex.site/email/events', action: 'exists', missingEvents: [] },
  senders: [],
  region: { expected: null, actual: null },
  topics: 1,
  postalAddress: true,
  flows: { declared: [], unsynced: [] },
}
const INBOUND: InboundSyncReport = {
  support: 'support@panels.example',
  inbox: 'created',
  domain: { name: 'panels.example', status: 'verified', receiving: false },
  webhook: { state: 'updated', id: 'wh_1', added: ['inbox.email.received'] },
  todo: ['Turn on receiving for panels.example at the email provider, and publish its MX record with the lowest number.'],
}

let rootDir: string
let printed: string[]
const print = (line: string) => void printed.push(line)

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'cli-email-'))
  writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:happy-otter-123\n')
  for (const name of ['CONVEX_DEPLOY_KEY', 'CONVEX_DEPLOYMENT']) vi.stubEnv(name, undefined)
  deployment.functions = { 'email:syncEmail': REPORT, 'email:syncInbound': INBOUND }
  vi.mocked(runConvex).mockClear()
  printed = []
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

describe('email sync', () => {
  it('runs the support inbox\'s sync after the rest, and folds its report into the log and the JSON', async () => {
    const { exitCode, output } = await runEmailSyncCommand(rootDir, {}, print)
    expect(exitCode).toBe(0)
    expect(vi.mocked(runConvex).mock.calls.map(([, args]) => args.find(arg => arg.startsWith('email:')))).toEqual(['email:syncEmail', 'email:syncInbound'])
    expect(printed).toEqual(expect.arrayContaining([
      '  created       inbox     support@panels.example',
      '  ·             domain    panels.example: verified, receiving off',
      '  updated       webhook   inbound events — added inbox.email.received',
      `  todo          inbound   ${INBOUND.todo[0]}`,
    ]))
    expect(output?.inbound).toEqual(INBOUND)
  })

  it('says in one line when the deployment has no email:syncInbound, and carries on', async () => {
    delete deployment.functions['email:syncInbound']
    const { exitCode, output } = await runEmailSyncCommand(rootDir, {}, print)
    expect(exitCode).toBe(0)
    expect(printed.filter(line => line.includes('syncInbound'))).toHaveLength(1)
    expect(output).toMatchObject({ log: REPORT.log, inbound: null })
  })

  it('leaves the support inbox alone on a dry run', async () => {
    deployment.functions['email:syncEmail'] = { ...REPORT, dryRun: true }
    const { output } = await runEmailSyncCommand(rootDir, { dryRun: true }, print)
    expect(vi.mocked(runConvex).mock.calls.map(([, args]) => args.find(arg => arg.startsWith('email:')))).toEqual(['email:syncEmail'])
    expect(output?.inbound).toBeNull()
  })
})

describe('a deployment without the support inbox', () => {
  it('reads as one, though the error quotes only the list of functions it has', async () => {
    const { runInboundSync } = await import('../../src/cli/email')
    const { ConvexCliError } = await vi.importActual<typeof import('../../src/convex-cli')>('../../src/convex-cli')
    // What `convex run` prints for a function it has not: the reason first, then the list, whose tail the message quotes.
    const missing = new ConvexCliError('convex run exited with code 1: • strips:writeCaptions • webhooks:replayWebhookDelivery', { code: 1, signal: null, timedOut: false, stderrTail: '• strips:writeCaptions • webhooks:replayWebhookDelivery', missingFunction: true })
    const throwing = (error: Error) => (async () => {
      throw error
    }) as never
    expect(await runInboundSync('.', {}, throwing(missing))).toBeNull()
    const failed = new ConvexCliError('convex run exited with code 1: • strips:writeCaptions', { code: 1, signal: null, timedOut: false, stderrTail: '• strips:writeCaptions' })
    await expect(runInboundSync('.', {}, throwing(failed))).rejects.toBe(failed)
  })
})
