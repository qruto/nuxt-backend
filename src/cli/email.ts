/**
 * `nuxt-backend email sync`: what `billing sync` does for the catalog, for
 * email. The deployment does the provider's side with its own
 * `EMAIL_API_KEY` (the `email:syncEmail` internal action `backend/email.ts`
 * re-exports from `setupEmail(…).api`), so the key never leaves it:
 *
 * - the topics `setupEmail({ topics })` declares, the segment that holds the
 *   app's accounts and the contact properties `contactProperties` declares
 *   are created at the provider, or found and brought up to date; their ids
 *   stay on the deployment, none in the app's code;
 * - the webhook (`<site>/email/events`) is pointed at every event the
 *   package reads. A webhook it creates has its signing secret stored on the
 *   deployment as `EMAIL_WEBHOOK_SECRET`, here, never printed;
 * - each sender's domain is read for its region and its DMARC policy;
 * - the support inbox (`email:syncInbound`, when `backend/email.ts`
 *   re-exports it) is found or created, its domain read, and the webhook
 *   given the inbound events, with what is left to do by hand.
 *
 * It changes nothing that is right already, so run it after each change.
 * `doctor` reads its dry run for findings; `doctor --fix` runs it.
 */
import { resolve } from 'node:path'
import { defineCommand } from 'citty'
import { runConvex } from '../convex-cli'
import type { EmailSyncReport } from '../convex/integrations/email-sync'
import type { InboundSyncReport } from '../convex/integrations/inbound'
import { deployKeyType, deploymentFlags, executeEnvPush, readEnvFiles } from '../env-push'
import { finding, type PreflightFinding } from '../findings'
import { progress, withContract } from './contract'

export type { EmailSyncReport } from '../convex/integrations/email-sync'

/** What `email sync --json` prints: the report, without the webhook's secret. */
export interface EmailSyncOutput {
  deployment: 'dev' | 'production'
  dryRun: boolean
  log: EmailSyncReport['log']
  webhook: { url: string | null, action: EmailSyncReport['webhook']['action'], secret: 'stored' | 'not-stored' | 'none' }
  senders: EmailSyncReport['senders']
  region: EmailSyncReport['region']
  /** The support inbox's sync: `null` when it did not run (a dry run, a key that cannot manage the account, or no `email:syncInbound` on the deployment). */
  inbound: InboundSyncReport | null
}

export interface EmailSyncCommandOptions {
  prod?: boolean
  dryRun?: boolean
  /** The webhook's URL; `off` leaves it alone; unset is `<site>/email/events`. */
  webhook?: string
  /** Turn the webhook back on when the provider turned it off. */
  enableWebhook?: boolean
  /** Rotate the webhook's signing secret, and nothing else. */
  rotateWebhookSecret?: boolean
}

/** `convex run` found no such function on the deployment: a setup this app does not have. */
function namesNoFunction(error: unknown): boolean {
  // A ConvexCliError knows it from the whole stderr; anything else is read off its message.
  if (typeof (error as { missingFunction?: unknown } | null)?.missingFunction === 'boolean') return (error as { missingFunction: boolean }).missingFunction
  return /could not find|not found|no such function/i.test(error instanceof Error ? error.message : String(error))
}

/** Run the deployment's email sync: `null` when it has no `email:syncEmail` (no `backend/email.ts`, or one from before 0.2.0). */
export async function runEmailSync(rootDir: string, { prod = false, dryRun = false, webhook, enableWebhook, rotateWebhookSecret }: EmailSyncCommandOptions = {}, run: typeof runConvex = runConvex): Promise<EmailSyncReport | null> {
  let stdout: string
  try {
    ({ stdout } = await run(rootDir, ['run', ...deploymentFlags({ prod }), 'email:syncEmail', JSON.stringify({ dryRun, ...(webhook ? { webhook } : {}), ...(enableWebhook ? { enableWebhook } : {}), ...(rotateWebhookSecret ? { rotateWebhookSecret } : {}) })]))
  }
  catch (error) {
    if (namesNoFunction(error)) return null
    throw error
  }
  return JSON.parse(stdout) as EmailSyncReport
}

/** Run the deployment's inbound sync (the support inbox, its domain, the webhook's inbound events): `null` when it has no `email:syncInbound`. */
export async function runInboundSync(rootDir: string, { prod = false }: { prod?: boolean } = {}, run: typeof runConvex = runConvex): Promise<InboundSyncReport | null> {
  let stdout: string
  try {
    ({ stdout } = await run(rootDir, ['run', ...deploymentFlags({ prod }), 'email:syncInbound', '{}']))
  }
  catch (error) {
    if (namesNoFunction(error)) return null
    throw error
  }
  return JSON.parse(stdout) as InboundSyncReport
}

/** The inbound sync's report as lines a person reads. */
export function inboundSyncLines(report: InboundSyncReport): string[] {
  if (!report.support) return ['  ·             inbox     none: setupEmail({ inbound: { support } }) names no support address']
  const lines = [`  ${(report.inbox ?? 'missing').padEnd(13)} inbox     ${report.support}`]
  if (report.domain) lines.push(`  ·             domain    ${report.domain.name}: ${report.domain.status}, receiving ${report.domain.receiving ? 'on' : 'off'}`)
  const { webhook } = report
  lines.push(`  ${(webhook.state === 'ok' ? 'exists' : webhook.state).padEnd(13)} webhook   inbound events${webhook.added.length ? ` — added ${webhook.added.join(', ')}` : ''}`)
  for (const todo of report.todo) lines.push(`  todo          inbound   ${todo}`)
  return lines
}

/**
 * The support inbox's part of `email sync`, after the rest: skipped on a
 * dry run (it has none) and without a full-access key, said in one line
 * when the deployment has no `email:syncInbound`. Answers its report, and
 * whether it failed.
 */
async function syncInbound(rootDir: string, report: EmailSyncReport, prod: boolean, print: (line: string) => void): Promise<{ inbound: InboundSyncReport | null, failed: boolean }> {
  if (report.key !== 'full') return { inbound: null, failed: false }
  if (report.dryRun) {
    print('  skipped       inbound   a dry run leaves the support inbox and its webhook events unchecked')
    return { inbound: null, failed: false }
  }
  try {
    const inbound = await runInboundSync(rootDir, { prod })
    if (!inbound) print('  skipped       inbound   the deployment has no email:syncInbound: re-export it from backend/email.ts to sync the support inbox')
    else for (const line of inboundSyncLines(inbound)) print(line)
    return { inbound, failed: false }
  }
  catch (error) {
    print(`[nuxt-backend] email sync: the support inbox's sync failed: ${error instanceof Error ? error.message : String(error)}`)
    return { inbound: null, failed: true }
  }
}

/** Why `email sync` will not write this deployment, or `null`: a deploy key for the other kind of deployment. */
export function emailSyncRefusal(rootDir: string, prod: boolean): string | null {
  const keyType = deployKeyType({ ...readEnvFiles(rootDir), ...process.env })
  if (prod && (keyType === 'dev' || keyType === 'preview')) return `--prod writes production, and CONVEX_DEPLOY_KEY is a ${keyType} deploy key.`
  if (!prod && (keyType === 'prod' || keyType === 'project')) return `CONVEX_DEPLOY_KEY is a ${keyType === 'prod' ? 'production' : 'project'} deploy key: pass --prod to write production, or unset it.`
  return null
}

/** The report as lines a person reads. */
export function emailSyncLines(report: EmailSyncReport): string[] {
  if (report.key === 'missing') return ['EMAIL_API_KEY is not set on the deployment: nothing to sync. Add it to .env.local and run `npx nuxt-backend env push`.']
  if (report.key === 'restricted') return ['EMAIL_API_KEY may only send: topics, segments and webhooks need a full-access key. Create one at the email provider and run `npx nuxt-backend env push --force`.']
  const lines = report.log.map(entry => `  ${entry.action.padEnd(13)} ${entry.kind.padEnd(9)} ${entry.key}${entry.note ? ` — ${entry.note}` : ''}`)
  if (report.topics === 0) lines.push('  ·             topic     none declared on setupEmail({ topics })')
  lines.push(...webhookLines(report.webhook))
  for (const sender of report.senders) {
    lines.push(`  ·             sender    ${sender.variable} ${sender.domain}: region ${sender.region ?? 'unknown'}, DMARC ${sender.dmarc ? `p=${sender.dmarc}` : 'missing'}`)
  }
  if (report.region.expected && report.region.actual && report.region.expected !== report.region.actual) {
    lines.push(`  drift         region    EMAIL_REGION is ${report.region.expected}, and the sending domain sends from ${report.region.actual}: set EMAIL_REGION=${report.region.actual}.`)
  }
  return lines
}

/** The webhook's lines: where it points, what it lacks, and whether it was turned back on. */
function webhookLines(hook: EmailSyncReport['webhook']): string[] {
  if (!hook.url) return ['  skipped       webhook   (--webhook off, or no site to point it at)']
  const lacks = hook.missingEvents.length ? ` — lacks ${hook.missingEvents.join(', ')}` : ''
  const off = hook.enabled === false ? ' — turned off at the provider' : ''
  const lines = [`  ${hook.action.padEnd(13)} webhook   ${hook.url}${lacks}${off}`]
  if (hook.changed === 'enabled' || hook.changed === 'would-enable') lines.push(`  ${hook.changed.padEnd(13)} webhook   delivering again`)
  return lines
}

/** What `doctor` reports of the email webhook: still delivering, and sending every event the package reads. */
function webhookFindings(hook: EmailSyncReport['webhook']): PreflightFinding[] {
  if (!hook.url) return []
  return [
    ...hook.enabled === undefined ? [] : [emailWebhookEnabledFinding(hook.enabled)],
    hook.action === 'exists'
      ? finding('email-webhook-events', 'pass', 'The email webhook sends every event the package reads.')
      : finding('email-webhook-events', 'warn', hook.action === 'would-create' ? `No webhook at the email provider points at ${hook.url}.` : `The email webhook does not send ${hook.missingEvents.join(', ')}.`, 'Run `npx nuxt-backend email sync` (or `doctor --fix`).'),
  ]
}

/** What `doctor` reports of the email setup, from a dry-run sync. */
export function emailSyncFindings(report: EmailSyncReport, { prod }: { prod: boolean }): PreflightFinding[] {
  const flows = flowFindings(report)
  if (report.key === 'missing') return flows
  if (report.key === 'restricted') {
    return [finding('email-key-permission', 'warn', 'EMAIL_API_KEY may only send: topics, contacts and broadcasts need a full-access key.', 'Create a full-access key at the email provider, put it in .env.local and run `npx nuxt-backend env push --force`.'), ...flows]
  }
  const findings = [finding('email-key-permission', 'pass', 'EMAIL_API_KEY has full access.'), ...flows]
  const lacking = report.log.filter(entry => entry.kind === 'topic' && entry.action !== 'exists')
  if (report.topics > 0) {
    findings.push(lacking.length === 0
      ? finding('email-topics', 'pass', `Every declared topic exists at the email provider (${report.topics}).`)
      : finding('email-topics', 'warn', `The email provider lacks or differs on ${lacking.map(entry => entry.key).join(', ')}.`, 'Run `npx nuxt-backend email sync` (or `doctor --fix`).'))
  }
  findings.push(...webhookFindings(report.webhook))
  findings.push(...regionFindings(report))
  if (prod && report.topics > 0 && !report.postalAddress) {
    findings.push(finding('email-postal-address', 'fail', 'Topics are declared and the brand has no postal address: marketing email must carry one.', 'Set `brand.address` in app config (`appConfig.backend.brand`) or on setupEmail.'))
  }
  if (prod && report.topics > 0 && !report.senders.some(sender => sender.variable === 'EMAIL_MARKETING_FROM')) {
    findings.push(finding('email-marketing-from', 'warn', 'Topics are declared and EMAIL_MARKETING_FROM is not set: marketing mail goes from EMAIL_FROM, so a complaint about it can hold up sign-in codes.', 'Set EMAIL_MARKETING_FROM to an address on a subdomain of its own, then run `npx nuxt-backend env push --prod`.'))
  }
  return findings
}

/** Whether the provider still delivers to the webhook: it turns off one whose deliveries keep failing. */
function emailWebhookEnabledFinding(enabled: boolean): PreflightFinding {
  return enabled
    ? finding('email-webhook-enabled', 'pass', 'The email provider delivers to the webhook.')
    : finding(
        'email-webhook-enabled',
        'warn',
        'The email provider turned the webhook off after its deliveries kept failing: bounces, complaints and topic changes reach the deployment no more.',
        'Run `npx nuxt-backend doctor --fix`: once the route answers its probe, it turns the webhook back on (after you confirm), and you can replay what was held back.',
      )
}

/**
 * `EMAIL_REGION` against the region the provider sends the sending
 * domain's mail from, which it sets per domain: a mismatch warns, naming
 * the value to set. Nothing when either is unknown.
 */
function regionFindings(report: EmailSyncReport): PreflightFinding[] {
  const { expected, actual } = report.region
  if (!actual) return []
  if (!expected) return [finding('email-region', 'pass', `The sending domain sends from ${actual}; EMAIL_REGION is not set, so nothing records it.`)]
  return [expected === actual
    ? finding('email-region', 'pass', `EMAIL_REGION is ${actual}, the sending domain's region.`)
    : finding('email-region', 'warn', `EMAIL_REGION is ${expected}, but the email provider sends the sending domain's mail from ${actual}: the privacy pages and the data map name the wrong region.`, `Set EMAIL_REGION=${actual} in .env.local and run \`npx nuxt-backend env push\` (\`--prod\` for production).`)]
}

/**
 * The lifecycle flows: each declared one runs on the deployment as the code
 * declares it, with its template and automation at the provider. A flow
 * `email sync` has not caught up with starts nothing: its events are
 * tracked, and no email follows.
 */
function flowFindings(report: EmailSyncReport): PreflightFinding[] {
  const declared = report.flows?.declared ?? []
  if (declared.length === 0) return []
  const missing = new Set([...(report.flows?.unsynced ?? []), ...report.log.filter(entry => (entry.kind === 'template' || entry.kind === 'automation') && entry.action !== 'exists').map(entry => entry.key)])
  return [missing.size === 0
    ? finding('email-flows', 'pass', `Every lifecycle flow runs, with its template and automation at the email provider (${declared.length}).`)
    : finding('email-flows', 'warn', `${[...missing].join(', ')} ${missing.size === 1 ? 'is' : 'are'} not synced: ${missing.size === 1 ? 'it starts' : 'they start'} nothing until \`email sync\` runs.`, 'Run `npx nuxt-backend email sync` (or `doctor --fix`).')]
}

/** Store a new webhook's signing secret on the deployment, never printed, and say so. */
async function storeSecret(rootDir: string, secret: string, prod: boolean, print: (line: string) => void): Promise<'stored' | 'not-stored'> {
  const [outcome] = await executeEnvPush(rootDir, [{ name: 'EMAIL_WEBHOOK_SECRET', action: 'update', detail: 'the webhook email sync created', value: secret }], { prod })
  if (outcome?.outcome === 'set') {
    print('[nuxt-backend] Stored the webhook\'s signing secret on the deployment as EMAIL_WEBHOOK_SECRET.')
    return 'stored'
  }
  print(`[nuxt-backend] The webhook's signing secret could not be stored (${outcome?.error ?? 'unknown error'}). Copy it from the email provider and run \`npx convex env set ${prod ? '--prod ' : ''}EMAIL_WEBHOOK_SECRET\`.`)
  return 'not-stored'
}

/** Run `email sync` end to end: the deployment's sync, then the new webhook's secret stored. */
export async function runEmailSyncCommand(rootDir: string, options: EmailSyncCommandOptions, print: (line: string) => void): Promise<{ exitCode: number, output: EmailSyncOutput | null }> {
  const prod = options.prod === true
  const refusal = emailSyncRefusal(rootDir, prod)
  if (refusal) {
    print(`[nuxt-backend] email sync refused: ${refusal}`)
    return { exitCode: 1, output: null }
  }
  let report: EmailSyncReport | null
  try {
    report = await runEmailSync(rootDir, options)
  }
  catch (error) {
    print(`[nuxt-backend] email sync failed: ${error instanceof Error ? error.message : String(error)}`)
    return { exitCode: 1, output: null }
  }
  if (!report) {
    print('[nuxt-backend] The deployment has no email:syncEmail. Re-export it from backend/email.ts (`export const { syncEmail } = email.api`), then push the backend.')
    return { exitCode: 1, output: null }
  }
  for (const line of emailSyncLines(report)) print(line)
  const secret = report.webhook.secret ? await storeSecret(rootDir, report.webhook.secret, prod, print) : 'none'
  // After the webhook exists, so the inbound sync finds it and adds its events.
  const { inbound, failed } = await syncInbound(rootDir, report, prod, print)
  const { webhook } = report
  return {
    exitCode: report.key === 'full' && secret !== 'not-stored' && !failed ? 0 : 1,
    output: { deployment: prod ? 'production' : 'dev', dryRun: report.dryRun, log: report.log, webhook: { url: webhook.url, action: webhook.action, secret }, senders: report.senders, region: report.region, inbound },
  }
}

export const emailSync = withContract('email sync', {
  sideEffects: ['writes provider accounts', 'writes the dev deployment', 'writes production'],
  json: '`{ deployment, dryRun, log: [{ action, kind, key, id?, note? }], webhook: { url, action, secret: "stored" | "not-stored" | "none" }, senders, region, inbound: { support, inbox, domain, webhook, todo } | null }`, the secret never in it',
  exitCodes: {
    0: 'synced, or a dry run',
    1: 'refused or failed: no `EMAIL_API_KEY`, a key restricted to sending, a deploy key for the other kind of deployment, no `email:syncEmail` on the deployment, a provider error, a webhook secret that could not be stored, or a support inbox sync that failed',
  },
}, defineCommand({
  meta: { name: 'sync', description: 'Create the email topics, the accounts\' segment and the contact properties backend/email.ts declares at the email provider, point the deployment\'s webhook at every event the package reads (storing a new webhook\'s secret), read each sender\'s region and DMARC, and sync the support inbox' },
  args: {
    'cwd': { type: 'string', description: 'Project directory', default: '.' },
    'prod': { type: 'boolean', description: 'Sync production\'s email account and write the production deployment', default: false },
    'dry-run': { type: 'boolean', description: 'Print each step it would take, and change nothing', default: false },
    'webhook': { type: 'string', description: 'Point the webhook at this URL (default: <site>/email/events of the deployment written; "off" to leave it alone)' },
    'json': { type: 'boolean', description: 'Print the outcome as one JSON document; progress goes to stderr', default: false },
  },
  async run({ args }) {
    const { exitCode, output } = await runEmailSyncCommand(resolve(process.cwd(), args.cwd), {
      prod: args.prod,
      dryRun: args['dry-run'],
      ...(args.webhook ? { webhook: args.webhook } : {}),
    }, progress(args.json))
    if (args.json && output) console.log(JSON.stringify(output, null, 2))
    if (exitCode !== 0) process.exitCode = exitCode
  },
}))

export const email = defineCommand({
  meta: { name: 'email', description: 'Email helpers' },
  subCommands: { sync: emailSync },
})
