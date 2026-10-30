/**
 * `nuxt-backend env rotate <name>`: change a secret the package reads
 * without signing anyone out or refusing a webhook delivery. The new value
 * goes in beside the old, both are accepted for a while, then the old one
 * retires. Values are read through `convex env get` and written on
 * `convex env set`'s stdin; none is ever printed.
 *
 * - `AUTH_SECRET` is versioned (src/convex/auth-secrets.ts): the new value
 *   signs from now on, the old one verifies for 30 days, and the session
 *   signing keys rotate with it (`keys:rotate`). A later run retires the
 *   old one once the window passed; `--retire` retires it at once.
 * - `EMAIL_WEBHOOK_SECRET` rotates at the email provider, which signs with
 *   the new and the old secret for 24 hours; the deployment takes the new.
 * - `BILLING_WEBHOOK_SECRET` is reset at the billing provider, which signs
 *   with the new one at once: the deployment holds `new,old` for the
 *   deliveries already on their way, then the new one alone.
 */
import { resolve } from 'node:path'
import { defineCommand } from 'citty'
import { webhooksResetWebhookEndpointSecret } from '@polar-sh/sdk/funcs/webhooksResetWebhookEndpointSecret.js'
import { runConvex } from '../convex-cli'
import { AUTH_SECRET_WINDOW_MS, formatAuthSecret, parseAuthSecret, retirementDue, type AuthSecretEntry, type AuthSecrets } from '../convex/auth-secrets'
import { parseSecretList } from '../convex/integrations/webhook-guard'
import { deploymentFlags, generateAuthSecret, readEnvFiles, setDeploymentEnv } from '../env-push'
import { readSyncDeployment, planWebhook } from './billing/deployment'
import { billingProviderTarget, providerClient, readProviderEndpoint } from './billing/settings'
import { progress, withContract } from './contract'
import { emailSyncRefusal, runEmailSync } from './email'

/** The secrets `env rotate` rotates. */
export const ROTATED_SECRETS = ['AUTH_SECRET', 'EMAIL_WEBHOOK_SECRET', 'BILLING_WEBHOOK_SECRET'] as const
export type RotatedSecret = (typeof ROTATED_SECRETS)[number]

/** The secrets with steps of their own, and where those steps are. */
const GUIDED_ELSEWHERE: Readonly<Record<string, string>> = {
  PROTECTION_PROOF_SECRET: '`new,old` on the deployment, then the new value in the app\'s env and a redeploy of the app, then the new value alone on the deployment: https://nuxt-backend.dev/docs/ship/security/secrets#what-rotates-and-how',
  PUSH_PUBLIC_KEY: 'only after a leak: a new key pair ends every push subscription. https://nuxt-backend.dev/docs/ship/security/secrets#what-rotates-and-how',
  PUSH_PRIVATE_KEY: 'only after a leak: a new key pair ends every push subscription. https://nuxt-backend.dev/docs/ship/security/secrets#what-rotates-and-how',
  BILLING_ACCESS_TOKEN: 'a provider token: make a new one in the provider\'s dashboard, `env push --force BILLING_ACCESS_TOKEN`, then revoke the old one.',
  EMAIL_API_KEY: 'a provider token: make a new one in the provider\'s dashboard, `env push --force EMAIL_API_KEY`, then revoke the old one.',
  AI_GATEWAY_API_KEY: 'a provider token: make a new one in the provider\'s dashboard, `env push --force AI_GATEWAY_API_KEY`, then revoke the old one.',
}

/** One step, as `--json` reports it. */
export interface RotateStep {
  step: string
  outcome: 'done' | 'planned' | 'skipped'
  note?: string
}

/** What `env rotate --json` prints: the steps and the secret's state after them; never a value. */
export interface RotateOutput {
  name: RotatedSecret
  deployment: 'dev' | 'production'
  dryRun: boolean
  steps: RotateStep[]
  /** `rotating`: the new value signs and the old one still verifies; `rotated`: the new one alone. */
  state: 'rotating' | 'rotated' | 'unchanged'
  /** When the old `AUTH_SECRET` retires, under `rotating`: an ISO date. */
  retiresAt?: string
}

/** The seams the tests replace: the deployment's env, its component functions and the providers. */
export interface RotateDeps {
  getEnv?: (rootDir: string, name: string, prod: boolean) => Promise<string | null>
  setEnv?: (rootDir: string, name: string, value: string, prod: boolean) => Promise<void>
  runKeys?: (rootDir: string, fn: 'rotate' | 'retire', prod: boolean) => Promise<{ expired?: number, removed?: number }>
  /** The open invite codes and links still hashed under an `AUTH_SECRET` older than `keyVersion` (`access:staleInvites`). */
  staleInvites?: (rootDir: string, keyVersion: number, now: number, prod: boolean) => Promise<{ count: number, more: boolean }>
  emailSync?: typeof runEmailSync
  resetBillingSecret?: (rootDir: string, prod: boolean) => Promise<{ secret: string } | { refusal: string }>
  newSecret?: () => string
  now?: () => number
}

export interface RotateOptions {
  prod?: boolean
  dryRun?: boolean
  retire?: boolean
}

async function deploymentValue(rootDir: string, name: string, prod: boolean): Promise<string | null> {
  const { stdout } = await runConvex(rootDir, ['env', 'get', ...deploymentFlags({ prod }), name])
  return stdout.trim() || null
}

async function runKeys(rootDir: string, fn: 'rotate' | 'retire', prod: boolean): Promise<{ expired?: number, removed?: number }> {
  const { stdout } = await runConvex(rootDir, ['run', ...deploymentFlags({ prod }), '--component', 'backend', `keys:${fn}`, '{}'])
  return JSON.parse(stdout) as { expired?: number, removed?: number }
}

async function staleInvites(rootDir: string, keyVersion: number, now: number, prod: boolean): Promise<{ count: number, more: boolean }> {
  const { stdout } = await runConvex(rootDir, ['run', ...deploymentFlags({ prod }), '--component', 'backend', 'access:staleInvites', JSON.stringify({ keyVersion, now })])
  return JSON.parse(stdout) as { count: number, more: boolean }
}

/** Reset the secret of the deployment's endpoint at the billing provider, with the token visible here. */
async function resetBillingSecret(rootDir: string, prod: boolean): Promise<{ secret: string } | { refusal: string }> {
  const env = { ...readEnvFiles(rootDir), ...process.env } as Record<string, string | undefined>
  const target = billingProviderTarget(env, prod)
  if (!target) return { refusal: `BILLING_ACCESS_TOKEN is not visible here${prod ? ' (under --prod, only the process env speaks for production)' : ''}: the endpoint's secret is reset with it.` }
  const plan = planWebhook(undefined, { prod, deployment: await readSyncDeployment(rootDir, prod), env: prod ? process.env : env })
  if (!('url' in plan)) return { refusal: 'skip' in plan ? plan.skip : plan.refusal }
  const client = providerClient(target.accessToken, target.environment)
  const endpoint = await readProviderEndpoint(client, plan.url)
  if (!endpoint) return { refusal: `The billing provider has no webhook endpoint at ${plan.url}. Run \`npx nuxt-backend billing sync${prod ? ' --env production' : ''}\` to create it.` }
  const reset = await webhooksResetWebhookEndpointSecret(client, { id: endpoint.id })
  if (!reset.ok) throw reset.error
  return { secret: reset.value.secret }
}

/** A Unix second: the version of a secret that begins signing now. */
function versionAt(now: number): number {
  return Math.floor(now / 1000)
}

/** The writes of an `AUTH_SECRET` rotation, each one a step: planned on a dry run, done otherwise. */
function authSteps(rootDir: string, { prod, dryRun }: Required<RotateOptions>, deps: Required<RotateDeps>, print: (line: string) => void, output: RotateOutput) {
  const step = (entry: RotateStep) => {
    output.steps.push(entry)
    print(`  ${entry.outcome.padEnd(8)} ${entry.step}${entry.note ? ` — ${entry.note}` : ''}`)
  }
  const keys = async (fn: 'rotate' | 'retire', description: string) => {
    if (dryRun) return step({ step: description, outcome: 'planned' })
    const { expired = 0, removed = 0 } = await deps.runKeys(rootDir, fn, prod)
    step({ step: description, outcome: 'done', note: fn === 'rotate' ? `${expired} expired` : `${removed} removed` })
  }
  return {
    write: async (description: string, value: string) => {
      if (dryRun) return step({ step: description, outcome: 'planned' })
      await deps.setEnv(rootDir, 'AUTH_SECRET', value, prod)
      step({ step: description, outcome: 'done' })
    },
    /**
     * Before a retirement: warn of the open invite codes and links still under
     * the older secret, which stop working with it. Read-only, so a dry run
     * counts too; a failed count warns that it could not and goes on.
     */
    countStaleInvites: async (keyVersion: number) => {
      const description = 'count the open invite codes still hashed under the old AUTH_SECRET (access:staleInvites)'
      try {
        const { count, more } = await deps.staleInvites(rootDir, keyVersion, deps.now(), prod)
        const total = `${count}${more ? '+' : ''}`
        step({ step: description, outcome: 'done', note: `${total} open` })
        if (count > 0) print(`  Warning: open invite codes or links still hashed under the old AUTH_SECRET: ${total}. Each one stops working when it retires, and its holder needs a new one.`)
      }
      catch {
        step({ step: description, outcome: 'skipped', note: 'the count failed' })
        print('  Warning: the open invite codes under the old AUTH_SECRET could not be counted. Any not used since the rotation stop working when it retires.')
      }
    },
    rotateKeys: () => keys('rotate', 'expire the session signing keys (keys:rotate): the next token is signed with a new key, the old keys stay published'),
    retireKeys: () => keys('retire', 'remove the session signing keys the rotation expired (keys:retire)'),
  }
}

/** A rotation under way: its old secret retires once the window passed, or now with `--retire`. */
async function retirePrevious(current: AuthSecrets, steps: ReturnType<typeof authSteps>, { retire, now }: { retire: boolean, now: number }): Promise<void> {
  const signing = current.entries![0]!
  if (!retire && !retirementDue(current, now)) {
    throw new RotateRefusal(`A rotation is under way: the previous AUTH_SECRET verifies until ${new Date(signing.version * 1000 + AUTH_SECRET_WINDOW_MS).toISOString()}. Run \`env rotate AUTH_SECRET\` again then to retire it, or now with --retire.`)
  }
  await steps.countStaleInvites(signing.version)
  // The keys first: none is left encrypted with the secret about to go.
  await steps.retireKeys()
  await steps.write('retire the previous AUTH_SECRET: the current one alone signs and verifies', formatAuthSecret([signing]))
}

/** `AUTH_SECRET`: a new version beside the old and the keys rotated, or the old one retired. */
async function rotateAuthSecret(rootDir: string, flags: Required<RotateOptions>, deps: Required<RotateDeps>, print: (line: string) => void): Promise<RotateOutput> {
  const { prod, dryRun, retire } = flags
  const output: RotateOutput = { name: 'AUTH_SECRET', deployment: prod ? 'production' : 'dev', dryRun, steps: [], state: 'unchanged' }
  const current = parseAuthSecret(await deps.getEnv(rootDir, 'AUTH_SECRET', prod))
  if (!current) throw new RotateRefusal(`AUTH_SECRET is not set on the ${prod ? 'production ' : ''}deployment: set one first (\`npx nuxt-backend env push${prod ? ' --prod' : ''}\`).`)
  const steps = authSteps(rootDir, flags, deps, print, output)
  const now = deps.now()
  const finished = dryRun ? 'rotating' as const : 'rotated' as const
  if (current.previous.length > 0) {
    await retirePrevious(current, steps, { retire, now })
    return { ...output, state: finished }
  }
  const signing: AuthSecretEntry = { version: versionAt(now), value: deps.newSecret() }
  const kept: AuthSecretEntry = current.entries ? current.entries[0]! : { version: 0, value: current.current }
  // The new secret first, so the key made next is encrypted with it; then the keys rotate.
  await steps.write('set a new AUTH_SECRET beside the old one: the new one signs, the old one still verifies', formatAuthSecret([signing, kept]))
  await steps.rotateKeys()
  if (retire) {
    // After a leak: the old value stops now. Sessions and links it signed stop with it.
    await steps.countStaleInvites(signing.version)
    await steps.retireKeys()
    await steps.write('retire the old AUTH_SECRET at once (--retire): sessions and links it signed stop working', formatAuthSecret([signing]))
    return { ...output, state: finished }
  }
  const retiresAt = new Date(signing.version * 1000 + AUTH_SECRET_WINDOW_MS).toISOString()
  print(`  The old AUTH_SECRET verifies until ${retiresAt}. Run \`npx nuxt-backend env rotate AUTH_SECRET${prod ? ' --prod' : ''}\` then to retire it.`)
  if (!prod && readEnvFiles(rootDir).AUTH_SECRET) {
    print('  .env.local still holds the old AUTH_SECRET: nothing pushes it over the deployment\'s, but `env push --force AUTH_SECRET` would. Remove it from .env.local, or leave --force alone.')
  }
  return { ...output, state: 'rotating', retiresAt }
}

/** `EMAIL_WEBHOOK_SECRET`: rotated at the provider by the deployment's own email sync, the new one stored. */
async function rotateEmailSecret(rootDir: string, { prod, dryRun }: Required<RotateOptions>, deps: Required<RotateDeps>, print: (line: string) => void): Promise<RotateOutput> {
  const output: RotateOutput = { name: 'EMAIL_WEBHOOK_SECRET', deployment: prod ? 'production' : 'dev', dryRun, steps: [], state: 'unchanged' }
  const report = await deps.emailSync(rootDir, { prod, dryRun, rotateWebhookSecret: true })
  if (!report) throw new RotateRefusal('The deployment has no email:syncEmail. Re-export it from backend/email.ts (`export const { syncEmail } = email.api`), then push the backend.')
  if (report.key !== 'full') throw new RotateRefusal(report.key === 'missing' ? 'EMAIL_API_KEY is not set on the deployment.' : 'EMAIL_API_KEY may only send: rotating the webhook\'s secret needs a full-access key.')
  if (!report.webhook.url || report.webhook.action === 'missing') throw new RotateRefusal('The email provider has no webhook for the deployment\'s /email/events. Run `npx nuxt-backend email sync` to create it.')
  const description = 'rotate the webhook\'s signing secret at the email provider: it signs with the new and the old one for 24 hours'
  if (dryRun) {
    output.steps.push({ step: description, outcome: 'planned' }, { step: 'store the new secret on the deployment as EMAIL_WEBHOOK_SECRET', outcome: 'planned' })
  }
  else {
    if (!report.webhook.secret) throw new RotateRefusal('The email provider did not return the new signing secret.')
    output.steps.push({ step: description, outcome: 'done' })
    await deps.setEnv(rootDir, 'EMAIL_WEBHOOK_SECRET', report.webhook.secret, prod)
    output.steps.push({ step: 'store the new secret on the deployment as EMAIL_WEBHOOK_SECRET', outcome: 'done' })
    output.state = 'rotated'
  }
  for (const entry of output.steps) print(`  ${entry.outcome.padEnd(8)} ${entry.step}`)
  return output
}

/** `BILLING_WEBHOOK_SECRET`: reset at the provider, `new,old` on the deployment, then the new alone. */
async function rotateBillingSecret(rootDir: string, { prod, dryRun }: Required<RotateOptions>, deps: Required<RotateDeps>, print: (line: string) => void): Promise<RotateOutput> {
  const output: RotateOutput = { name: 'BILLING_WEBHOOK_SECRET', deployment: prod ? 'production' : 'dev', dryRun, steps: [], state: 'unchanged' }
  const step = (entry: RotateStep) => {
    output.steps.push(entry)
    print(`  ${entry.outcome.padEnd(8)} ${entry.step}`)
  }
  const old = parseSecretList(await deps.getEnv(rootDir, 'BILLING_WEBHOOK_SECRET', prod) ?? undefined)[0]
  if (!old) throw new RotateRefusal('BILLING_WEBHOOK_SECRET is not set on the deployment: `npx nuxt-backend billing sync` stores the endpoint\'s secret there.')
  const steps = [
    'reset the endpoint\'s secret at the billing provider: it signs with the new one at once',
    'write `new,old` as BILLING_WEBHOOK_SECRET: a delivery signed before the reset still verifies',
    'write the new secret alone as BILLING_WEBHOOK_SECRET',
  ]
  if (dryRun) {
    for (const description of steps) step({ step: description, outcome: 'planned' })
    return output
  }
  const reset = await deps.resetBillingSecret(rootDir, prod)
  if ('refusal' in reset) throw new RotateRefusal(reset.refusal)
  step({ step: steps[0]!, outcome: 'done' })
  await deps.setEnv(rootDir, 'BILLING_WEBHOOK_SECRET', `${reset.secret},${old}`, prod)
  step({ step: steps[1]!, outcome: 'done', note: 'a delivery refused in between is retried by the provider' })
  await deps.setEnv(rootDir, 'BILLING_WEBHOOK_SECRET', reset.secret, prod)
  step({ step: steps[2]!, outcome: 'done' })
  output.state = 'rotated'
  return output
}

/** A rotation that will not run, with why. */
export class RotateRefusal extends Error {}

/** Why `env rotate` will not run for `name`, or `null`. */
function rotateRefusal(rootDir: string, name: string, prod: boolean): string | null {
  if (!(ROTATED_SECRETS as readonly string[]).includes(name)) {
    const elsewhere = GUIDED_ELSEWHERE[name]
    return elsewhere ? `${name} keeps steps of its own: ${elsewhere}` : `${name} is no secret env rotate rotates. It takes ${ROTATED_SECRETS.join(', ')}.`
  }
  return emailSyncRefusal(rootDir, prod)
}

/** The seams, the real ones where a test gave none. */
function resolveDeps(deps: RotateDeps): Required<RotateDeps> {
  return {
    getEnv: deps.getEnv ?? deploymentValue,
    setEnv: deps.setEnv ?? ((dir, envName, value, isProd) => setDeploymentEnv(dir, envName, value, { prod: isProd })),
    runKeys: deps.runKeys ?? runKeys,
    staleInvites: deps.staleInvites ?? staleInvites,
    emailSync: deps.emailSync ?? runEmailSync,
    resetBillingSecret: deps.resetBillingSecret ?? resetBillingSecret,
    newSecret: deps.newSecret ?? generateAuthSecret,
    now: deps.now ?? Date.now,
  }
}

/** Each secret's rotation. */
const ROTATIONS: Readonly<Record<RotatedSecret, typeof rotateAuthSecret>> = {
  AUTH_SECRET: rotateAuthSecret,
  EMAIL_WEBHOOK_SECRET: rotateEmailSecret,
  BILLING_WEBHOOK_SECRET: rotateBillingSecret,
}

/** Run `env rotate` end to end. */
export async function runRotate(rootDir: string, name: string, options: RotateOptions, print: (line: string) => void, deps: RotateDeps = {}): Promise<{ exitCode: 0 | 1, output: RotateOutput | null }> {
  const prod = options.prod === true
  const refusal = rotateRefusal(rootDir, name, prod)
  if (refusal) {
    print(`[nuxt-backend] env rotate refused: ${refusal}`)
    return { exitCode: 1, output: null }
  }
  const resolved = resolveDeps(deps)
  const flags = { prod, dryRun: options.dryRun === true, retire: options.retire === true }
  print(`[nuxt-backend] env rotate ${name} → ${prod ? 'production' : 'the dev deployment'}${flags.dryRun ? ' — dry run' : ''}`)
  try {
    return { exitCode: 0, output: await ROTATIONS[name as RotatedSecret](rootDir, flags, resolved, print) }
  }
  catch (error) {
    print(`[nuxt-backend] env rotate ${error instanceof RotateRefusal ? 'refused' : 'failed'}: ${error instanceof Error ? error.message : String(error)}`)
    return { exitCode: 1, output: null }
  }
}

export const envRotate = withContract('env rotate', {
  sideEffects: ['writes the dev deployment', 'writes provider accounts'],
  byFlag: {
    '--prod': ['writes production'],
    '--dry-run': ['reads only'],
  },
  json: '`{ name, deployment, dryRun, steps: [{ step, outcome, note? }], state, retiresAt? }`: the steps it took and the secret\'s new state; values never appear',
  exitCodes: {
    0: 'rotated, or a dry run',
    1: 'refused, or a step failed',
  },
}, defineCommand({
  meta: { name: 'rotate', description: 'Rotate AUTH_SECRET, EMAIL_WEBHOOK_SECRET or BILLING_WEBHOOK_SECRET with no downtime: the new value beside the old, then the old retired' },
  args: {
    'name': { type: 'positional', description: 'The secret: AUTH_SECRET, EMAIL_WEBHOOK_SECRET or BILLING_WEBHOOK_SECRET', required: true },
    'cwd': { type: 'string', description: 'Project directory', default: '.' },
    'prod': { type: 'boolean', description: 'Rotate production\'s secret', default: false },
    'dry-run': { type: 'boolean', description: 'Print each step it would take, and change nothing', default: false },
    'retire': { type: 'boolean', description: 'AUTH_SECRET: retire the old value now, not after the 30-day window (after a leak)', default: false },
    'json': { type: 'boolean', description: 'Print the outcome as one JSON document; progress goes to stderr', default: false },
  },
  async run({ args }) {
    const { exitCode, output } = await runRotate(resolve(process.cwd(), args.cwd), String(args.name), { prod: args.prod, dryRun: args['dry-run'], retire: args.retire }, progress(args.json))
    if (args.json && output) console.log(JSON.stringify(output, null, 2))
    if (exitCode !== 0) process.exitCode = exitCode
  },
}))
