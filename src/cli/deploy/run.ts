import { randomBytes } from 'node:crypto'
import type { CapabilityName } from '../../capabilities/types'
import type { BackendEnvironment } from '../../convex/environment'
import { isLoopbackUrl } from '../../convex/loopback'
import { siteFromCloudUrl } from '../../convex/urls'
import type { PreflightFinding } from '../../findings/types'
import type { BillingSyncCommandOptions, BillingSyncReport } from '../billing'
import type { EmailSyncReport } from '../email'
import type { DeployAsk } from '../ask'
import type { EmailWebhookResult } from './email-webhook'
import { BUILD_COMMAND, type DeployHost } from './host'

// `nuxt-backend deploy`, as data: each step of the first deploy the package
// can take, under the capability it belongs to. Every step looks before it
// writes, so a second run changes nothing that is already right and a run
// that stopped halfway picks up where it stopped. Values are generated here
// or asked for, held in memory, handed to the Convex or Vercel CLI on stdin,
// and never printed.

/** What a step did. */
export type DeployOutcome = 'done' | 'unchanged' | 'planned' | 'skipped' | 'failed'

export interface DeployStep {
  id: 'deployment' | 'environment' | 'auth-secret' | 'site-url' | 'billing-token' | 'email-key' | 'protection-secret' | 'dev-inbox' | 'backend' | 'billing-catalog' | 'billing-ids' | 'email-webhook' | 'email-sync' | 'app-env' | 'gate'
  capability: CapabilityName
  title: string
  outcome: DeployOutcome
  /** What it did or would do, or why it did not: never a value. */
  detail: string
}

/** What `deploy --json` prints. */
export interface DeployReport {
  dryRun: boolean
  /** What production's `BACKEND_ENVIRONMENT` is, or becomes. */
  environment: 'production' | 'sandbox'
  /** The app's host: the linked Vercel project, or another one written by hand. */
  host: DeployHost['kind']
  steps: DeployStep[]
  /** `doctor --prod`'s outcome; null when it did not run. */
  doctor: { pass: number, warn: number, fail: number, failing: string[] } | null
}

/** The production deployment, through the Convex CLI and the developer's login or production deploy key. */
export interface DeployBackend {
  /** Production's env names; null when it cannot be reached. */
  envNames: () => Promise<string[] | null>
  /** Production's `BACKEND_ENVIRONMENT`; null when unreadable or none of the four kinds. */
  environment: () => Promise<BackendEnvironment | null>
  /** Create the project's default production deployment. */
  create: () => Promise<void>
  /** Set one name on production, the value on stdin. */
  setEnv: (name: string, value: string) => Promise<void>
  /** Push the backend to production (`convex deploy`); resolves with its exit code. */
  push: () => Promise<number>
  /** Production's client URL; null when unreadable. */
  url: () => Promise<string | null>
  /** A new production deploy key, held in memory only. */
  createDeployKey: () => Promise<string>
}

export interface DeployDeps {
  backend: DeployBackend
  host: DeployHost
  /** Asks at a terminal; absent in CI, under `--json`, or without a terminal, where every question's step is skipped. */
  ask?: DeployAsk
  /** The shell's env: where a key only you hold comes from without a terminal. Never `.env.local`, which holds development's. */
  env: Readonly<Record<string, string | undefined>>
  billingSync: (options: BillingSyncCommandOptions) => Promise<{ exitCode: 0 | 1, report: BillingSyncReport | null, refusal?: string }>
  emailWebhook: (apiKey: string, url: string, options: { dryRun: boolean }) => Promise<EmailWebhookResult>
  /** Production's own `email sync` (`email:syncEmail`, with its key): the topics, segments, contact properties and flows. `null` when production has no `email:syncEmail`. Absent: the step is skipped. */
  emailSync?: (options: { dryRun: boolean }) => Promise<EmailSyncReport | null>
  /** `doctor --prod`'s findings. */
  doctor: () => Promise<PreflightFinding[]>
  /** Why the host's build would not ship the backend; null when it does or cannot be told. */
  buildAdvice: string | null
  print: (line: string) => void
}

export interface DeployOptions {
  dryRun: boolean
  /** `--sandbox`: a demo or staging app, on the providers' test modes. */
  sandbox: boolean
}

/** A new secret: 32 random bytes, base64. */
export function generateSecret(): string {
  return randomBytes(32).toString('base64')
}

/** `SITE_URL` as production takes it: an https origin off this machine, without a path. Null when it is not one. */
export function productionOrigin(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' && !isLoopbackUrl(url.href) ? url.origin : null
  }
  catch {
    return null
  }
}

const LIGHT: Record<DeployOutcome, string> = { done: '✓', unchanged: '·', planned: '→', skipped: '–', failed: '✗' }

/** One step as the terminal prints it. */
export function formatStep(step: DeployStep): string {
  return `${LIGHT[step.outcome]} ${step.capability.padEnd(10)} ${step.title}: ${step.detail}`
}

/** The run's working state: what production holds, and what this run learned or holds in memory. */
interface DeployState {
  options: DeployOptions
  deps: DeployDeps
  steps: DeployStep[]
  /** Production's env names, with the ones this run set. */
  names: Set<string>
  environment: 'production' | 'sandbox'
  /** Keys only the developer holds, as given this run: never stored but on production. */
  billingToken?: string
  emailKey?: string
  /** The proof secret generated this run, for the host's half. */
  proofSecret?: string
  url?: string | null
  hostNames?: string[] | null
  stopped: boolean
}

function record(state: DeployState, step: DeployStep): void {
  state.steps.push(step)
  state.deps.print(formatStep(step))
  if (step.outcome === 'failed' && ['deployment', 'environment'].includes(step.id)) state.stopped = true
}

/** Set a name on production, or plan it on a dry run; a failure is reported by its message, which never carries the value. */
async function write(state: DeployState, name: string, value: string): Promise<string | null> {
  if (state.options.dryRun) return null
  try {
    await state.deps.backend.setEnv(name, value)
    state.names.add(name)
    return null
  }
  catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/** Write one name, as a step: planned on a dry run, done once set, failed with the CLI's message. */
async function writeStep(state: DeployState, base: Omit<DeployStep, 'outcome' | 'detail'>, name: string, value: string, detail: string): Promise<void> {
  if (state.options.dryRun) return record(state, { ...base, outcome: 'planned', detail: `would set ${name}: ${detail}` })
  const error = await write(state, name, value)
  record(state, error ? { ...base, outcome: 'failed', detail: error } : { ...base, outcome: 'done', detail: `${name} ${detail}` })
}

/** What a person answers to make a new production deployment. */
const YES = /^y(?:es)?$/i

/**
 * 1. The production deployment: linked when it answers, created with the
 * developer's login when they say the project has none. One that does not
 * answer may exist all the same (a timeout, the network), and creating one
 * then would make a second, empty one the project's default: only a person
 * at a terminal says it is missing.
 */
async function deploymentStep(state: DeployState): Promise<void> {
  const base = { id: 'deployment', capability: 'data', title: 'The deployment' } as const
  const { backend, env, ask } = state.deps
  let names = await backend.envNames()
  if (names) {
    state.names = new Set(names)
    return record(state, { ...base, outcome: 'unchanged', detail: 'linked the project\'s production deployment' })
  }
  if (env.CONVEX_DEPLOY_KEY) {
    return record(state, { ...base, outcome: 'failed', detail: 'production does not answer with the CONVEX_DEPLOY_KEY in the shell: check the key, or unset it to use your Convex login.' })
  }
  if (state.options.dryRun) {
    return record(state, { ...base, outcome: 'planned', detail: 'production does not answer: would ask, then create the project\'s production deployment (npx convex deployment create --type prod --default)' })
  }
  const create = ask && YES.test(await ask('Production does not answer. Create the project\'s production deployment, and make it the default? Say yes only when the project has none yet (y/N): '))
  if (!create) {
    return record(state, { ...base, outcome: 'failed', detail: 'production does not answer: check your Convex login (npx convex login) and the network, and run deploy again. When the project has no production deployment yet, run deploy at a terminal and say yes, or create it with npx convex deployment create --type prod --default.' })
  }
  try {
    await backend.create()
  }
  catch (error) {
    return record(state, { ...base, outcome: 'failed', detail: `could not create the production deployment (${error instanceof Error ? error.message : String(error)}). Sign in with npx convex login, link the project in this folder (npx nuxt-backend dev does once), and run deploy again.` })
  }
  names = await backend.envNames()
  if (!names) return record(state, { ...base, outcome: 'failed', detail: 'created the production deployment, and it does not answer yet: run deploy again.' })
  state.names = new Set(names)
  record(state, { ...base, outcome: 'done', detail: 'created the project\'s production deployment' })
}

/**
 * 2. `BACKEND_ENVIRONMENT`: `production`, unless production already holds
 * `sandbox`, which it keeps; `--sandbox` sets `sandbox` on purpose. A value
 * that cannot be read is never guessed at: the run stops.
 */
async function environmentStep(state: DeployState): Promise<void> {
  const base = { id: 'environment', capability: 'data', title: 'The environment' } as const
  const target = state.options.sandbox ? 'sandbox' : 'production'
  const current = state.names.has('BACKEND_ENVIRONMENT') ? await state.deps.backend.environment() : undefined
  if (current === null) {
    return record(state, { ...base, outcome: 'failed', detail: 'BACKEND_ENVIRONMENT is set on production and its value could not be read. Set it yourself (npx convex env set --prod BACKEND_ENVIRONMENT production), then run deploy again.' })
  }
  if (current === 'sandbox' && target === 'production') {
    state.environment = 'sandbox'
    return record(state, { ...base, outcome: 'unchanged', detail: 'BACKEND_ENVIRONMENT stays sandbox: a demo or staging app. deploy never makes one live on its own; set production on it yourself to go live.' })
  }
  state.environment = target
  if (current === target) return record(state, { ...base, outcome: 'unchanged', detail: `BACKEND_ENVIRONMENT is ${target}` })
  await writeStep(state, base, 'BACKEND_ENVIRONMENT', target, `${current ?? 'unset'} → ${target}`)
}

/** 3. `AUTH_SECRET`, production's own: generated, never copied from `.env.local`. */
async function authSecretStep(state: DeployState): Promise<void> {
  const base = { id: 'auth-secret', capability: 'auth', title: 'The auth secret' } as const
  if (state.names.has('AUTH_SECRET')) return record(state, { ...base, outcome: 'unchanged', detail: 'AUTH_SECRET is set on production' })
  await writeStep(state, base, 'AUTH_SECRET', generateSecret(), 'generated for production')
}

/** 4. `SITE_URL`: the app's public origin, from the shell or asked for; never `.env.local`'s, which is the dev server's. */
async function siteUrlStep(state: DeployState): Promise<void> {
  const base = { id: 'site-url', capability: 'auth', title: 'The site URL' } as const
  if (state.names.has('SITE_URL')) return record(state, { ...base, outcome: 'unchanged', detail: 'SITE_URL is set on production' })
  const { env, ask } = state.deps
  const given = env.SITE_URL || env.NUXT_SITE_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '') || (ask ? await ask('The app\'s public origin (SITE_URL), such as https://app.example.com: ') : '')
  if (!given) {
    return record(state, { ...base, outcome: 'skipped', detail: 'needs the app\'s public origin: run deploy at a terminal, or with SITE_URL=https://… in the shell. The backend push waits for it.' })
  }
  const origin = productionOrigin(given)
  if (!origin) return record(state, { ...base, outcome: 'failed', detail: `"${given}" is not an https origin off this machine, which production's SITE_URL must be.` })
  await writeStep(state, base, 'SITE_URL', origin, origin)
}

const PROVIDER_KEYS = {
  BILLING_ACCESS_TOKEN: { id: 'billing-token', capability: 'billing', title: 'The billing token', field: 'billingToken', what: (sandbox: boolean) => `the ${sandbox ? 'sandbox' : 'production'} billing access token (an organization token from Polar's ${sandbox ? 'sandbox' : 'dashboard'})` },
  EMAIL_API_KEY: { id: 'email-key', capability: 'email', title: 'The email key', field: 'emailKey', what: () => 'the email API key (a full-access key from Resend)' },
} as const

/**
 * 5. A key only the developer holds: from the shell, or asked for at a
 * terminal. Set on production when it lacks one; held in memory for the
 * catalog and webhook steps, which need it even when production has it.
 */
async function providerKeyStep(state: DeployState, name: keyof typeof PROVIDER_KEYS): Promise<void> {
  const { id, capability, title, field, what } = PROVIDER_KEYS[name]
  const base = { id, capability, title }
  const set = state.names.has(name)
  const label = what(state.environment === 'sandbox')
  const { env, ask } = state.deps
  const value = env[name] || (ask ? await ask(`Paste ${label}${set ? ' to sync with (production has one; Enter to skip)' : ' (Enter to skip)'}: `, { secret: true }) : '')
  if (value) state[field] = value
  if (set) return record(state, { ...base, outcome: 'unchanged', detail: `${name} is set on production${value ? '' : `; the steps that call the provider need it here too: give it in the shell as ${name}, or at a terminal`}` })
  if (!value) return record(state, { ...base, outcome: 'skipped', detail: `needs ${label}: in a terminal deploy asks for it; elsewhere set ${name} in the shell, and run deploy again` })
  await writeStep(state, base, name, value, 'set on production')
}

/**
 * 6. The bot check's proof secret, on Vercel, where BotID signs proofs: one
 * value on production and in the app's production env. A half the other
 * lacks is replaced by a new pair, since the existing value is never read.
 */
async function protectionStep(state: DeployState): Promise<void> {
  const base = { id: 'protection-secret', capability: 'protection', title: 'The bot check\'s proof secret' } as const
  const { host } = state.deps
  const deployed = state.names.has('PROTECTION_PROOF_SECRET')
  if (host.kind !== 'vercel') {
    return record(state, { ...base, outcome: 'skipped', detail: deployed ? 'set on production; off Vercel nothing signs a proof, so set it on your host by hand or rely on the challenge keys' : 'off Vercel nothing signs a proof: set the challenge keys instead (/docs/services/bot-protection)' })
  }
  if (state.hostNames === null) return record(state, { ...base, outcome: 'skipped', detail: 'the Vercel project\'s env could not be read (vercel env ls production): check your Vercel login and run deploy again' })
  const onHost = state.hostNames!.includes('PROTECTION_PROOF_SECRET')
  if (deployed && onHost) return record(state, { ...base, outcome: 'unchanged', detail: 'PROTECTION_PROOF_SECRET is on production and in the app\'s env' })
  if (onHost) return record(state, { ...base, outcome: 'skipped', detail: 'the Vercel project holds one production lacks: remove it there (vercel env rm PROTECTION_PROOF_SECRET production), and run deploy again for a new pair' })
  if (state.options.dryRun) return record(state, { ...base, outcome: 'planned', detail: 'would generate PROTECTION_PROOF_SECRET for production and the app' })
  const secret = generateSecret()
  const error = await write(state, 'PROTECTION_PROOF_SECRET', secret)
  if (error) return record(state, { ...base, outcome: 'failed', detail: error })
  state.proofSecret = secret
  record(state, { ...base, outcome: 'done', detail: 'PROTECTION_PROOF_SECRET generated and set on production; the app\'s half follows with its env' })
}

/**
 * 6b. `EMAIL_DEV_INBOX` on a sandbox: a public demo's visitors read their
 * sign-in codes off the page (`getSandboxInbox`), which answers only once
 * the deployment opts in. Set on a sandbox alone, never on a live
 * production, where `doctor --prod` flags it.
 */
async function devInboxStep(state: DeployState): Promise<void> {
  if (state.environment !== 'sandbox') return
  const base = { id: 'dev-inbox', capability: 'email', title: 'The dev inbox' } as const
  if (state.names.has('EMAIL_DEV_INBOX')) return record(state, { ...base, outcome: 'unchanged', detail: 'EMAIL_DEV_INBOX is set on the sandbox' })
  await writeStep(state, base, 'EMAIL_DEV_INBOX', '1', 'set: the demo\'s pages read the sign-in codes of its test addresses')
}

/** 7. The backend pushed to production (`convex deploy`), once it holds what the push requires. */
async function backendStep(state: DeployState): Promise<void> {
  const base = { id: 'backend', capability: 'data', title: 'The backend' } as const
  const lacking = ['AUTH_SECRET', 'SITE_URL'].filter(name => !state.names.has(name))
  if (state.options.dryRun) return record(state, { ...base, outcome: 'planned', detail: 'would push backend/ to production (npx convex deploy)' })
  if (lacking.length > 0) return record(state, { ...base, outcome: 'skipped', detail: `the push fails until production holds ${lacking.join(' and ')}` })
  const code = await state.deps.backend.push()
  state.url = await state.deps.backend.url()
  record(state, code === 0
    ? { ...base, outcome: 'done', detail: `pushed backend/ to ${state.url ?? 'production'}` }
    : { ...base, outcome: 'failed', detail: `npx convex deploy exited with code ${code}: its output above says why` })
}

/**
 * A provider's error as one line, the key it was called with cut out: the
 * billing SDK's message carries the provider's answer, which may quote it.
 */
function providerFailure(error: unknown, key: string): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.split(key).join('[redacted]').replace(/\s+/g, ' ').trim()
}

/** 8. The billing catalog, synced to the environment production bills in, with its webhook and products; resolves with the id map it rewrote, if any. */
async function billingStep(state: DeployState): Promise<string | null> {
  const base = { id: 'billing-catalog', capability: 'billing', title: 'The billing catalog' } as const
  if (!state.billingToken) {
    record(state, { ...base, outcome: 'skipped', detail: 'needs the billing access token here: give it at a terminal, or as BILLING_ACCESS_TOKEN in the shell' })
    return null
  }
  const environment = state.environment === 'sandbox' ? 'sandbox' : 'production'
  let synced: Awaited<ReturnType<DeployDeps['billingSync']>>
  try {
    synced = await state.deps.billingSync({ environment, production: true, accessToken: state.billingToken, dryRun: state.options.dryRun })
  }
  catch (error) {
    record(state, { ...base, outcome: 'failed', detail: `${providerFailure(error, state.billingToken)}: check the billing access token and the network, and run deploy again` })
    return null
  }
  const { exitCode, report, refusal } = synced
  if (!report) {
    record(state, { ...base, outcome: 'failed', detail: refusal ?? 'billing sync failed' })
    return null
  }
  const detail = `synced to Polar's ${environment === 'sandbox' ? 'sandbox' : 'production'}; webhook ${report.webhook.action}, secret ${report.webhook.secret}; products ${report.products.status}`
  record(state, { ...base, outcome: exitCode !== 0 ? 'failed' : state.options.dryRun ? 'planned' : 'done', detail: report.webhook.note ? `${detail} (${report.webhook.note})` : detail })
  return report.generated
}

/**
 * 9. The backend again, once the sync rewrote the id map: the push before it
 * bundled the old billing.generated.ts, and production reads its plans,
 * meters and free plan from the one it was pushed with. The host's build
 * pushes the backend from the repository too, so the file is committed.
 */
async function catalogIdsStep(state: DeployState, generated: string | null): Promise<void> {
  if (!generated) return
  const base = { id: 'billing-ids', capability: 'billing', title: 'The catalog ids' } as const
  const commit = `Commit ${generated}: the app's next build pushes the backend from the repository.`
  if (!state.steps.some(step => step.id === 'backend' && step.outcome === 'done')) {
    return record(state, { ...base, outcome: 'skipped', detail: `billing sync wrote new ids, and the backend was not pushed: the next push carries them. ${commit}` })
  }
  const code = await state.deps.backend.push()
  record(state, code === 0
    ? { ...base, outcome: 'done', detail: `billing sync wrote new ids: pushed the backend again, so production reads them. ${commit}` }
    : { ...base, outcome: 'failed', detail: `billing sync wrote new ids, and npx convex deploy exited with code ${code}: run deploy again. ${commit}` })
}

/** Production's `/email/events` endpoint, or null while its HTTP origin is not known. */
async function emailEndpoint(state: DeployState): Promise<string | null> {
  const url = state.url ?? (state.options.dryRun ? await state.deps.backend.url() : null)
  const site = state.deps.env.NUXT_PUBLIC_CONVEX_SITE_URL || (url ? siteFromCloudUrl(url) : null)
  return site ? `${site.replace(/\/+$/, '')}/email/events` : null
}

/** Store a registered webhook's secret on production, as the step's record. */
async function storeEmailSecret(state: DeployState, base: Omit<DeployStep, 'outcome' | 'detail'>, endpoint: string, result: EmailWebhookResult): Promise<void> {
  // A new endpoint's secret is the one its events are signed with; an existing one's fills a gap only.
  const secret = result.action === 'created' || !state.names.has('EMAIL_WEBHOOK_SECRET') ? result.secret : undefined
  const error = secret ? await write(state, 'EMAIL_WEBHOOK_SECRET', secret) : null
  const found = result.action === 'created' ? 'created' : 'found'
  if (error) return record(state, { ...base, outcome: 'failed', detail: `${found} the webhook at ${endpoint}, and its secret could not be stored: ${error}. Set it with npx convex env set --prod EMAIL_WEBHOOK_SECRET, which asks for it.` })
  record(state, { ...base, outcome: secret ? 'done' : 'unchanged', detail: `${found} the webhook at ${endpoint}; EMAIL_WEBHOOK_SECRET ${secret ? 'stored' : 'kept'} on production` })
}

/**
 * 10. The email webhook at production's `/email/events`, its signing secret
 * stored there. The topics and segments come with `email sync`, the next step.
 */
async function emailWebhookStep(state: DeployState): Promise<void> {
  const base = { id: 'email-webhook', capability: 'email', title: 'The email webhook' } as const
  if (!state.emailKey) return record(state, { ...base, outcome: 'skipped', detail: 'needs the email API key here: give it at a terminal, or as EMAIL_API_KEY in the shell' })
  const endpoint = await emailEndpoint(state)
  if (!endpoint) return record(state, { ...base, outcome: 'skipped', detail: 'production\'s HTTP origin is not known yet: run deploy again once the backend is pushed, or set NUXT_PUBLIC_CONVEX_SITE_URL for a custom domain' })
  let result: EmailWebhookResult
  try {
    result = await state.deps.emailWebhook(state.emailKey, endpoint, { dryRun: state.options.dryRun })
  }
  catch (error) {
    return record(state, { ...base, outcome: 'failed', detail: `${error instanceof Error ? error.message : String(error)} (a key restricted to sending cannot manage webhooks)` })
  }
  if (state.options.dryRun) return record(state, { ...base, outcome: 'planned', detail: `${result.action === 'exists' ? 'found' : 'would create'} the webhook at ${endpoint}` })
  await storeEmailSecret(state, base, endpoint, result)
}

/** The app's production env on the host: the backend URL, the deploy key its build pushes with, and the bot check's half. */
/**
 * 11. Production's `email sync`: the topics, the accounts' segment, the
 * contact properties and the lifecycle flows `backend/email.ts` declares,
 * made at the email provider with production's own key, once the backend
 * that declares them is pushed. The webhook is the step before's.
 */
async function emailSyncStep(state: DeployState): Promise<void> {
  const base = { id: 'email-sync', capability: 'email', title: 'The email topics and flows' } as const
  if (!state.deps.emailSync) return record(state, { ...base, outcome: 'skipped', detail: 'not run here' })
  if (!state.emailKey && !state.names.has('EMAIL_API_KEY')) return record(state, { ...base, outcome: 'skipped', detail: 'needs the email API key on production' })
  let report: EmailSyncReport | null
  try {
    report = await state.deps.emailSync({ dryRun: state.options.dryRun })
  }
  catch (error) {
    return record(state, { ...base, outcome: 'failed', detail: `${error instanceof Error ? error.message : String(error)}: run npx nuxt-backend email sync --prod` })
  }
  record(state, { ...base, ...emailSyncOutcome(report, state.options.dryRun) })
}

/** What production's email sync did, or would do, as a step's outcome. */
function emailSyncOutcome(report: EmailSyncReport | null, dryRun: boolean): Pick<DeployStep, 'outcome' | 'detail'> {
  if (!report) return { outcome: 'skipped', detail: 'production has no email:syncEmail: backend/email.ts predates 0.2.0 (npx nuxt-backend upgrade)' }
  if (report.key !== 'full') return { outcome: 'failed', detail: report.key === 'missing' ? 'EMAIL_API_KEY is not set on production' : 'EMAIL_API_KEY may only send: topics, segments and flows need a full-access key' }
  const changed = report.log.filter(entry => entry.action !== 'exists').map(entry => `${entry.kind} ${entry.key}`)
  if (dryRun) return { outcome: 'planned', detail: changed.length ? `would make ${changed.join(', ')}` : 'nothing to change' }
  return changed.length ? { outcome: 'done', detail: `made ${changed.join(', ')}` } : { outcome: 'unchanged', detail: `${report.topics} topic${report.topics === 1 ? '' : 's'}, every one in place` }
}

async function hostValues(state: DeployState): Promise<Array<{ name: string, value: () => Promise<string> }>> {
  const names = state.hostNames ?? []
  const url = state.url ?? await state.deps.backend.url()
  const wanted: Array<{ name: string, value: () => Promise<string> }> = []
  if (!names.includes('NUXT_PUBLIC_BACKEND_URL') && url) wanted.push({ name: 'NUXT_PUBLIC_BACKEND_URL', value: async () => url })
  if (!names.includes('CONVEX_DEPLOY_KEY')) wanted.push({ name: 'CONVEX_DEPLOY_KEY', value: () => state.deps.backend.createDeployKey() })
  if (state.proofSecret) wanted.push({ name: 'PROTECTION_PROOF_SECRET', value: async () => state.proofSecret! })
  return wanted
}

/** 11. The app's env on its host: written into the Vercel project through the Vercel CLI, or named for any other host. */
async function appEnvStep(state: DeployState): Promise<void> {
  const base = { id: 'app-env', capability: 'hosting', title: 'The app\'s env' } as const
  const { host, buildAdvice } = state.deps
  const advice = buildAdvice ? ` ${buildAdvice}` : ''
  if (host.kind !== 'vercel') {
    const url = state.url ?? await state.deps.backend.url()
    return record(state, { ...base, outcome: 'skipped', detail: `set on your host's production env: NUXT_PUBLIC_BACKEND_URL=${url ?? '<production\'s convex.cloud URL>'}, and CONVEX_DEPLOY_KEY, a production deploy key (npx convex deployment token create <name> --prod prints one), with the build command ${BUILD_COMMAND}. On Vercel, run vercel link and deploy again.` })
  }
  if (state.hostNames === null) return record(state, { ...base, outcome: 'failed', detail: 'the Vercel project\'s env could not be read (vercel env ls production): check your Vercel login and run deploy again' })
  const wanted = await hostValues(state)
  if (wanted.length === 0) return record(state, { ...base, outcome: 'unchanged', detail: `the Vercel project's production env holds what the app needs.${advice}` })
  const names = wanted.map(entry => entry.name).join(', ')
  if (state.options.dryRun) return record(state, { ...base, outcome: 'planned', detail: `would add ${names} to the Vercel project's production env.${advice}` })
  for (const { name, value } of wanted) {
    try {
      await host.addEnv(name, await value())
    }
    catch (error) {
      return record(state, { ...base, outcome: 'failed', detail: `${name}: ${error instanceof Error ? error.message : String(error)}` })
    }
  }
  record(state, { ...base, outcome: 'done', detail: `added ${names} to the Vercel project's production env. Redeploy the app for it to read them: push to the production branch, or vercel deploy --prod.${advice}` })
}

/** The capabilities whose gaps the gate names: what production still lacks to protect, watch and count. */
const GATE_CAPABILITIES: readonly CapabilityName[] = ['protection', 'monitoring', 'hosting']

/** 12. The gate: `doctor --prod`, and what bot protection, monitoring and hosting still lack. */
async function gateStep(state: DeployState): Promise<DeployReport['doctor']> {
  const base = { id: 'gate', capability: 'hosting', title: 'doctor --prod' } as const
  if (state.options.dryRun) {
    record(state, { ...base, outcome: 'planned', detail: 'would run doctor --prod' })
    return null
  }
  const findings = await state.deps.doctor()
  const count = (status: PreflightFinding['status']) => findings.filter(finding => finding.status === status).length
  const failing = findings.filter(finding => finding.status === 'fail')
  const lacking = findings.filter(finding => finding.status !== 'pass' && (finding.status === 'fail' || GATE_CAPABILITIES.includes(finding.capability)))
  for (const finding of lacking) state.deps.print(`    ${finding.status === 'fail' ? '✗' : '⚠'} ${finding.title}: ${finding.message}${finding.fixHint ? `\n      ↳ ${finding.fixHint}` : ''}`)
  record(state, failing.length > 0
    ? { ...base, outcome: 'failed', detail: `${failing.length} failing, ${count('warn')} warning: the fixes are above` }
    : { ...base, outcome: 'done', detail: `production passes, with ${count('warn')} warning${count('warn') === 1 ? '' : 's'}` })
  return { pass: count('pass'), warn: count('warn'), fail: failing.length, failing: failing.map(finding => finding.id) }
}

/** The steps that write production's env, in order: each looks before it writes. */
const ENV_STEPS: Array<(state: DeployState) => Promise<void>> = [
  authSecretStep,
  siteUrlStep,
  state => providerKeyStep(state, 'BILLING_ACCESS_TOKEN'),
  state => providerKeyStep(state, 'EMAIL_API_KEY'),
  protectionStep,
  devInboxStep,
]

/**
 * Take production from nothing to a passing `doctor --prod`: link or create
 * the deployment, push its env, push the backend, sync the billing catalog
 * (and push again when that wrote new ids), register both webhooks, write the app's env into its host, then run the
 * gate. A step that needs what another could not get is skipped and says
 * so; the next run picks it up.
 */
export async function runDeploy(options: DeployOptions, deps: DeployDeps): Promise<{ exitCode: 0 | 1, report: DeployReport }> {
  const state: DeployState = { options, deps, steps: [], names: new Set(), environment: options.sandbox ? 'sandbox' : 'production', stopped: false }
  let doctor: DeployReport['doctor'] = null
  await deploymentStep(state)
  if (!state.stopped) await environmentStep(state)
  if (!state.stopped) {
    state.hostNames = await deps.host.envNames()
    for (const step of ENV_STEPS) await step(state)
    await backendStep(state)
    await catalogIdsStep(state, await billingStep(state))
    await emailWebhookStep(state)
    await emailSyncStep(state)
    await appEnvStep(state)
    doctor = await gateStep(state)
  }
  const report: DeployReport = { dryRun: options.dryRun, environment: state.environment, host: deps.host.kind, steps: state.steps, doctor }
  return { exitCode: state.steps.some(step => step.outcome === 'failed') ? 1 : 0, report }
}
