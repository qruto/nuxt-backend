import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCommand } from 'citty'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emailSync, emailSyncFindings, emailSyncLines, runEmailSyncCommand } from '../../src/cli/email'
import type { EmailSyncReport } from '../../src/convex/integrations/email-sync'
import { signingSecret } from '../helpers/secrets'

// `nuxt-backend email sync` from the outside: the lines it prints for each
// report the deployment's sync can give, the findings `doctor` makes of a
// dry run, and the command around them (its refusals, the new webhook's
// secret stored on the deployment and never printed, its exit codes). The
// deployment is an in-memory stand-in for the Convex CLI.

const WEBHOOK = 'https://happy-otter-123.convex.site/email/events'
const NEW_SECRET = signingSecret()

const deployment = vi.hoisted(() => ({
  report: null as unknown,
  inbound: null as unknown,
  /** Functions the deployment does not have. */
  missing: new Set<string>(),
  /** A function whose run fails, with this error. */
  failing: new Map<string, Error>(),
  /** `env set` fails. */
  refuseSet: false,
  env: new Map<string, string>(),
  calls: [] as Array<{ args: string[], input?: string }>,
}))
vi.mock('../../src/convex-cli', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/convex-cli')>(),
  runConvex: vi.fn(async (_rootDir: string, args: string[], options: { input?: string } = {}) => {
    deployment.calls.push({ args, ...(options.input === undefined ? {} : { input: options.input }) })
    if (args[0] === 'env' && args[1] === 'set') {
      if (deployment.refuseSet) throw new Error('convex env set exited with code 1: not authorized')
      deployment.env.set(args.at(-1)!, options.input!)
      return { stdout: '', stderr: '' }
    }
    const fn = args.find(arg => arg.startsWith('email:'))!
    if (deployment.missing.has(fn)) throw Object.assign(new Error('convex run exited with code 1'), { missingFunction: true })
    if (deployment.failing.has(fn)) throw deployment.failing.get(fn)
    // The sync reports the dry run it was asked for.
    const asked = JSON.parse(args.at(-1)!) as { dryRun?: boolean }
    return { stdout: JSON.stringify(fn === 'email:syncEmail' ? { ...deployment.report as object, dryRun: asked.dryRun === true } : deployment.inbound), stderr: '' }
  }),
}))

function report(overrides: Partial<EmailSyncReport> = {}): EmailSyncReport {
  return {
    dryRun: false,
    key: 'full',
    log: [],
    webhook: { url: WEBHOOK, action: 'exists', missingEvents: [] },
    senders: [],
    region: { expected: null, actual: null },
    topics: 0,
    postalAddress: true,
    flows: { declared: [], unsynced: [] },
    ...overrides,
  }
}

let rootDir: string
let printed: string[]
const print = (line: string) => void printed.push(line)

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'email-sync-report-'))
  writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:happy-otter-123\n')
  for (const name of ['CONVEX_DEPLOY_KEY', 'CONVEX_DEPLOYMENT_TOKEN', 'CONVEX_DEPLOYMENT']) vi.stubEnv(name, undefined)
  Object.assign(deployment, { report: report(), inbound: { support: null, inbox: null, webhook: { state: 'ok', added: [] }, todo: [] }, refuseSet: false })
  deployment.missing.clear()
  deployment.failing.clear()
  deployment.env.clear()
  deployment.calls.length = 0
  printed = []
  process.exitCode = undefined
})
afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  process.exitCode = undefined
})

const byId = (findings: ReturnType<typeof emailSyncFindings>) => Object.fromEntries(findings.map(entry => [entry.id, entry]))

describe('email sync at a terminal', () => {
  it('says in one line what a missing or a sending-only key leaves undone, and what to run', () => {
    expect(emailSyncLines(report({ key: 'missing' }))).toEqual(['EMAIL_API_KEY is not set on the deployment: nothing to sync. Add it to .env.local and run `npx nuxt-backend env push`.'])
    expect(emailSyncLines(report({ key: 'restricted' }))).toEqual(['EMAIL_API_KEY may only send: topics, segments and webhooks need a full-access key. Create one at the email provider and run `npx nuxt-backend env push --force`.'])
  })

  it('prints a line per step, and says when no topic is declared', () => {
    const lines = emailSyncLines(report({ log: [{ action: 'created', kind: 'segment', key: 'accounts', id: 'seg_1' }, { action: 'drift', kind: 'topic', key: 'news', note: 'subscribes by opt_in at the provider' }] }))
    expect(lines).toEqual([
      '  created       segment   accounts',
      '  drift         topic     news — subscribes by opt_in at the provider',
      '  ·             topic     none declared on setupEmail({ topics })',
      `  exists        webhook   ${WEBHOOK}`,
    ])
  })

  it('says what the webhook lacks, that the provider turned it off, and when it delivers again', () => {
    expect(emailSyncLines(report({ topics: 1, webhook: { url: null, action: 'skipped', missingEvents: [] } }))).toEqual(['  skipped       webhook   (--webhook off, or no site to point it at)'])
    expect(emailSyncLines(report({ topics: 1, webhook: { url: WEBHOOK, action: 'updated', missingEvents: ['email.bounced', 'email.complained'], enabled: false } })))
      .toEqual([`  updated       webhook   ${WEBHOOK} — lacks email.bounced, email.complained — turned off at the provider`])
    expect(emailSyncLines(report({ topics: 1, webhook: { url: WEBHOOK, action: 'exists', missingEvents: [], enabled: true, changed: 'would-enable' } })))
      .toEqual([`  exists        webhook   ${WEBHOOK}`, '  would-enable  webhook   delivering again'])
  })

  it('names each sender\'s region and DMARC policy, and the EMAIL_REGION to set when it drifted', () => {
    const lines = emailSyncLines(report({
      topics: 1,
      senders: [
        { variable: 'EMAIL_FROM', domain: 'mail.panels.example', region: 'eu-west-1', dmarc: 'reject' },
        { variable: 'EMAIL_MARKETING_FROM', domain: 'news.panels.example', region: null, dmarc: null },
      ],
      region: { expected: 'us-east-1', actual: 'eu-west-1' },
    }))
    expect(lines.slice(1)).toEqual([
      '  ·             sender    EMAIL_FROM mail.panels.example: region eu-west-1, DMARC p=reject',
      '  ·             sender    EMAIL_MARKETING_FROM news.panels.example: region unknown, DMARC missing',
      '  drift         region    EMAIL_REGION is us-east-1, and the sending domain sends from eu-west-1: set EMAIL_REGION=eu-west-1.',
    ])
  })
})

describe('doctor\'s email findings', () => {
  it('names the lifecycle flows not synced yet, even without a key', () => {
    const one = emailSyncFindings(report({ key: 'missing', flows: { declared: ['welcome', 'winback'], unsynced: ['winback'] } }), { prod: false })
    expect(one).toEqual([expect.objectContaining({ id: 'email-flows', status: 'warn', message: 'winback is not synced: it starts nothing until `email sync` runs.' })])
    // A template or an automation the provider lacks counts as well.
    const two = emailSyncFindings(report({ flows: { declared: ['welcome', 'winback'], unsynced: ['winback'] }, log: [{ action: 'would-create', kind: 'template', key: 'welcome' }] }), { prod: false })
    expect(byId(two)['email-flows']!.message).toBe('winback, welcome are not synced: they start nothing until `email sync` runs.')
    const synced = emailSyncFindings(report({ flows: { declared: ['welcome'], unsynced: [] }, log: [{ action: 'exists', kind: 'automation', key: 'welcome' }] }), { prod: false })
    expect(byId(synced)['email-flows']).toMatchObject({ status: 'pass' })
  })

  it('warns that a sending-only key cannot manage topics, and passes a full-access one', () => {
    expect(byId(emailSyncFindings(report({ key: 'restricted' }), { prod: false }))['email-key-permission']).toMatchObject({ status: 'warn', fixHint: expect.stringContaining('env push --force') })
    expect(byId(emailSyncFindings(report(), { prod: false }))['email-key-permission']).toMatchObject({ status: 'pass' })
  })

  it('passes when every declared topic exists at the provider, and names the ones it lacks', () => {
    expect(byId(emailSyncFindings(report({ topics: 2, log: [{ action: 'exists', kind: 'topic', key: 'news' }, { action: 'exists', kind: 'topic', key: 'tips' }] }), { prod: false }))['email-topics'])
      .toMatchObject({ status: 'pass', message: 'Every declared topic exists at the email provider (2).' })
    expect(byId(emailSyncFindings(report({ topics: 2, log: [{ action: 'exists', kind: 'topic', key: 'news' }, { action: 'would-create', kind: 'topic', key: 'tips' }] }), { prod: false }))['email-topics'])
      .toMatchObject({ status: 'warn', message: 'The email provider lacks or differs on tips.' })
    expect(byId(emailSyncFindings(report(), { prod: false }))).not.toHaveProperty('email-topics')
  })

  it('warns of a webhook the provider turned off, one that is missing, and one that lacks events', () => {
    const off = byId(emailSyncFindings(report({ webhook: { url: WEBHOOK, action: 'exists', missingEvents: [], enabled: false } }), { prod: false }))
    expect(off['email-webhook-enabled']).toMatchObject({ status: 'warn', fixHint: expect.stringContaining('doctor --fix') })
    expect(off['email-webhook-events']).toMatchObject({ status: 'pass' })
    expect(byId(emailSyncFindings(report({ webhook: { url: WEBHOOK, action: 'exists', missingEvents: [], enabled: true } }), { prod: false }))['email-webhook-enabled']).toMatchObject({ status: 'pass' })
    expect(byId(emailSyncFindings(report({ webhook: { url: WEBHOOK, action: 'would-create', missingEvents: [] } }), { prod: false }))['email-webhook-events'])
      .toMatchObject({ status: 'warn', message: `No webhook at the email provider points at ${WEBHOOK}.` })
    expect(byId(emailSyncFindings(report({ webhook: { url: WEBHOOK, action: 'would-update', missingEvents: ['email.bounced'] } }), { prod: false }))['email-webhook-events'])
      .toMatchObject({ status: 'warn', message: 'The email webhook does not send email.bounced.' })
    // No webhook pointed anywhere (`--webhook off`): nothing to say of it.
    const none = byId(emailSyncFindings(report({ webhook: { url: null, action: 'skipped', missingEvents: [] } }), { prod: false }))
    expect(none).not.toHaveProperty('email-webhook-events')
    expect(none).not.toHaveProperty('email-webhook-enabled')
  })

  it('checks EMAIL_REGION against the sending domain\'s region, and names the value to set', () => {
    expect(byId(emailSyncFindings(report({ region: { expected: null, actual: null } }), { prod: false }))).not.toHaveProperty('email-region')
    expect(byId(emailSyncFindings(report({ region: { expected: null, actual: 'eu-west-1' } }), { prod: false }))['email-region'])
      .toMatchObject({ status: 'pass', message: 'The sending domain sends from eu-west-1; EMAIL_REGION is not set, so nothing records it.' })
    expect(byId(emailSyncFindings(report({ region: { expected: 'eu-west-1', actual: 'eu-west-1' } }), { prod: false }))['email-region']).toMatchObject({ status: 'pass' })
    expect(byId(emailSyncFindings(report({ region: { expected: 'us-east-1', actual: 'eu-west-1' } }), { prod: false }))['email-region'])
      .toMatchObject({ status: 'warn', fixHint: expect.stringContaining('Set EMAIL_REGION=eu-west-1') })
  })

  it('fails production marketing mail without a postal address, and warns it shares the sign-in sender', () => {
    const marketing = report({ topics: 1, postalAddress: false, log: [{ action: 'exists', kind: 'topic', key: 'news' }] })
    const prod = byId(emailSyncFindings(marketing, { prod: true }))
    expect(prod['email-postal-address']).toMatchObject({ status: 'fail' })
    expect(prod['email-marketing-from']).toMatchObject({ status: 'warn' })
    const dev = byId(emailSyncFindings(marketing, { prod: false }))
    expect(dev).not.toHaveProperty('email-postal-address')
    expect(dev).not.toHaveProperty('email-marketing-from')
    const separate = byId(emailSyncFindings({ ...marketing, postalAddress: true, senders: [{ variable: 'EMAIL_MARKETING_FROM', domain: 'news.panels.example', region: null, dmarc: 'reject' }] }, { prod: true }))
    expect(separate).not.toHaveProperty('email-postal-address')
    expect(separate).not.toHaveProperty('email-marketing-from')
  })
})

describe('email sync, the command', () => {
  it('refuses to write the dev deployment with a production deploy key, and production with a dev one', async () => {
    writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOY_KEY=prod:happy-otter-123|secret-prod-key\n')
    expect(await runEmailSyncCommand(rootDir, {}, print)).toEqual({ exitCode: 1, output: null })
    expect(printed).toEqual(['[nuxt-backend] email sync refused: CONVEX_DEPLOY_KEY is a production deploy key: pass --prod to write production, or unset it.'])
    vi.stubEnv('CONVEX_DEPLOY_KEY', 'dev:happy-otter-123|secret-dev-key')
    expect((await runEmailSyncCommand(rootDir, { prod: true }, print)).exitCode).toBe(1)
    expect(printed.at(-1)).toBe('[nuxt-backend] email sync refused: --prod writes production, and CONVEX_DEPLOY_KEY is a dev deploy key.')
    expect(deployment.calls).toEqual([])
  })

  it('stores a new webhook\'s signing secret on the deployment, on stdin, and never prints it', async () => {
    deployment.report = report({ webhook: { url: WEBHOOK, action: 'created', missingEvents: [], secret: NEW_SECRET } })
    const { exitCode, output } = await runEmailSyncCommand(rootDir, {}, print)
    expect(exitCode).toBe(0)
    expect(deployment.env.get('EMAIL_WEBHOOK_SECRET')).toBe(NEW_SECRET)
    const set = deployment.calls.find(call => call.args[1] === 'set')!
    expect(set.args).toEqual(['env', 'set', 'EMAIL_WEBHOOK_SECRET'])
    expect(printed).toContain('[nuxt-backend] Stored the webhook\'s signing secret on the deployment as EMAIL_WEBHOOK_SECRET.')
    expect(output?.webhook).toEqual({ url: WEBHOOK, action: 'created', secret: 'stored' })
    expect(`${printed.join('\n')}${JSON.stringify(output)}`).not.toContain(NEW_SECRET)
  })

  it('fails, naming the command to store it by hand, when the deployment will not take the secret', async () => {
    deployment.report = report({ webhook: { url: WEBHOOK, action: 'created', missingEvents: [], secret: NEW_SECRET } })
    deployment.refuseSet = true
    const { exitCode, output } = await runEmailSyncCommand(rootDir, { prod: true }, print)
    expect(exitCode).toBe(1)
    expect(output?.webhook.secret).toBe('not-stored')
    expect(printed.join('\n')).toContain('The webhook\'s signing secret could not be stored (convex env set exited with code 1: not authorized). Copy it from the email provider and run `npx convex env set --prod EMAIL_WEBHOOK_SECRET`.')
    expect(printed.join('\n')).not.toContain(NEW_SECRET)
  })

  it('exits 1 for a key that cannot manage the account, a deployment without the sync, or a sync that fails', async () => {
    deployment.report = report({ key: 'restricted' })
    const restricted = await runEmailSyncCommand(rootDir, {}, print)
    expect(restricted.exitCode).toBe(1)
    // A sending-only key cannot manage the support inbox either: its sync is not run.
    expect(deployment.calls.some(call => call.args.includes('email:syncInbound'))).toBe(false)

    deployment.missing.add('email:syncEmail')
    expect(await runEmailSyncCommand(rootDir, {}, print)).toEqual({ exitCode: 1, output: null })
    expect(printed.at(-1)).toContain('The deployment has no email:syncEmail.')

    deployment.missing.clear()
    deployment.failing.set('email:syncEmail', new Error('convex run exited with code 1: Uncaught Error: provider says 500'))
    expect(await runEmailSyncCommand(rootDir, {}, print)).toEqual({ exitCode: 1, output: null })
    expect(printed.at(-1)).toBe('[nuxt-backend] email sync failed: convex run exited with code 1: Uncaught Error: provider says 500')
  })

  it('keeps the rest of the sync when the support inbox\'s fails, and exits 1', async () => {
    deployment.failing.set('email:syncInbound', new Error('convex run exited with code 1: the inbox address is taken'))
    const { exitCode, output } = await runEmailSyncCommand(rootDir, {}, print)
    expect(exitCode).toBe(1)
    expect(output).toMatchObject({ deployment: 'dev', inbound: null, webhook: { url: WEBHOOK, action: 'exists', secret: 'none' } })
    expect(printed.at(-1)).toBe('[nuxt-backend] email sync: the support inbox\'s sync failed: convex run exited with code 1: the inbox address is taken')
  })

  it('says a support address that is not declared, and passes the flags it was given to the deployment', async () => {
    const { exitCode } = await runEmailSyncCommand(rootDir, { prod: true, webhook: 'https://panels.example/email/events' }, print)
    expect(exitCode).toBe(0)
    expect(printed).toContain('  ·             inbox     none: setupEmail({ inbound: { support } }) names no support address')
    const sync = deployment.calls[0]!.args
    expect(sync.slice(0, 3)).toEqual(['run', '--prod', 'email:syncEmail'])
    expect(JSON.parse(sync[3]!)).toEqual({ dryRun: false, webhook: 'https://panels.example/email/events' })
  })

  it('prints one JSON document on stdout under --json, its progress on stderr, and sets the exit code', async () => {
    const stdout: string[] = []
    const stderr: string[] = []
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => void stdout.push(String(line)))
    vi.spyOn(console, 'error').mockImplementation((line: unknown) => void stderr.push(String(line)))
    await runCommand(emailSync, { rawArgs: ['--cwd', rootDir, '--dry-run', '--json'] })
    expect(stdout).toHaveLength(1)
    expect(JSON.parse(stdout[0]!)).toMatchObject({ deployment: 'dev', dryRun: true, inbound: null })
    expect(stderr).toContain('  skipped       inbound   a dry run leaves the support inbox and its webhook events unchecked')
    expect(JSON.parse(deployment.calls[0]!.args.at(-1)!)).toEqual({ dryRun: true })
    expect(process.exitCode).toBeUndefined()

    deployment.report = report({ key: 'missing' })
    await runCommand(emailSync, { rawArgs: ['--cwd', rootDir] })
    expect(stdout.at(-1)).toContain('EMAIL_API_KEY is not set on the deployment')
    expect(process.exitCode).toBe(1)
  })
})
