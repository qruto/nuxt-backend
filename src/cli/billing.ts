/**
 * `nuxt-backend billing sync` — push the code-declared catalog
 * (`backend/billing.catalog.ts`) to the billing provider and write the id map
 * to `backend/billing.generated.ts`.
 *
 * Find-or-create: every managed object is tagged
 * `metadata: { managedBy: 'nuxt-backend', key }` — a plan's products also
 * with their `interval`, one product per price in `prices: { month, year }`
 * — and looked up by that tag on the next run, so re-running is idempotent.
 * Nothing remote is ever deleted, and no price or credit grant a customer
 * holds is rewritten: a changed name, price, units or rollover is reported
 * as drift, like a managed object whose key left the catalog. Four writes
 * go further: a plan's trial follows the catalog (it only decides what a new
 * checkout gets), a plan's quotas follow it on its `<plan>-quotas` benefit,
 * attached to products that exist already too, a `retired` plan's products
 * are archived (subscribers keep them; nobody new buys them), and a pack's
 * private gift twin follows its pack's live price and sheds benefits.
 * The catalog's `discounts` (promotions) are the provider's own discounts,
 * kept in line in place: name, code, dates, redemption caps and product
 * scope always, the amount and months while nobody has redeemed one; a
 * `retired` one is ended and its code freed. Granting stays provider-native:
 * plan/pack credits become meter-credit benefits attached to the products,
 * granted by the provider per cycle / at purchase.
 *
 * `--adopt key=<id>` records an existing product/meter/custom field under a
 * catalog key instead of creating a managed twin — benefits of adopted
 * products are left exactly as they are.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { defineCommand } from 'citty'
import { runConvex } from '../convex-cli'
import { billingEnvironment, type BackendEnvironment } from '../convex/environment'
import { deployKeyType, deploymentBackendEnvironment, deploymentFlags, executeEnvPush, readEnvFiles } from '../env-push'
import { resolveFunctionsDir } from '../scaffold'
import { deploymentLabel, planWebhook, productsRefreshBlocker, readSyncDeployment, type SyncDeployment, type WebhookPlan } from './billing/deployment'
import { loadCatalog } from './billing/doctor'
import { loadGenerated, renderGenerated } from './billing/generated'
import type { CatalogIds, Environment, SyncLogEntry } from './billing/provider'
import { syncBillingCatalog, type BillingSyncOptions, type BillingSyncResult, type ProvisionedWebhook } from './billing/sync'
import { progress, withContract } from './contract'

// The command lives here; the reconciliation (billing/sync.ts), the
// deployment it writes (billing/deployment.ts), doctor's cross-checks
// (billing/doctor.ts) and the generated id map (billing/generated.ts) live
// under billing/. src/doctor.ts and the tests import them through this entry.
export { collectBillingFindings, loadCatalog, readBillingOrganizationState, type BillingOrganizationState } from './billing/doctor'
export { syncBillingCatalog } from './billing/sync'

export interface BillingSyncCommandOptions {
  environment?: string
  dryRun?: boolean
  /** The webhook endpoint URL; `'off'` skips it; unset derives `<site>/billing/events` of the deployment written. */
  webhook?: string
  /** Store the endpoint's secret even over a BILLING_WEBHOOK_SECRET the deployment already holds. */
  force?: boolean
  /** `key=<id>[,key=<id>…]`. */
  adopt?: string
  /** The access token to sync with, over the env's: `deploy` holds the one it asked for. */
  accessToken?: string
  /**
   * Write the production deployment whatever the environment synced: a demo
   * or staging app (`BACKEND_ENVIRONMENT=sandbox`) bills in the sandbox from
   * its production deployment. `deploy --sandbox` syncs it so.
   */
  production?: boolean
}

/** What `billing sync --json` prints. The webhook secret never appears in it. */
export interface BillingSyncReport {
  environment: Environment
  dryRun: boolean
  /** The deployment written — its client URL, from `convex function-spec` — or null when it could not be read. */
  deployment: string | null
  log: SyncLogEntry[]
  /**
   * The id map written, or `null` when it already held these ids, or on a
   * dry run. A deployment reads the map it was pushed with, so a written one
   * reaches it with the next push.
   */
  generated: string | null
  webhook: {
    /** The endpoint; null when the step was left out before one was known. */
    url: string | null
    /** What the provider side did; `skipped` when the step did not run or created nothing (see `note`). */
    action: 'created' | 'exists' | 'would-create' | 'skipped'
    /**
     * `stored`: put on the deployment by this run; `kept`: the deployment's
     * own was left alone (`--force` replaces it); `not-stored`: it belongs
     * there and could not be put there; `none`: nothing to store.
     */
    secret: 'stored' | 'kept' | 'not-stored' | 'none'
    /** Why the step was skipped, or the secret kept or not stored. */
    note?: string
  }
  /** `billing:syncProducts` on the deployment, so pricing renders before the first product webhook. */
  products: {
    status: 'synced' | 'failed' | 'skipped'
    /** Why it was skipped or failed, and what to run instead. */
    note?: string
  }
}

export interface BillingSyncDeps {
  sync?: typeof syncBillingCatalog
  /** Reads the `BACKEND_ENVIRONMENT` of the deployment the Convex CLI will write: `null` when unset or unreadable. */
  readEnvironment?: (rootDir: string) => Promise<BackendEnvironment | null>
  /** Reads the deployment the sync writes, before anything is written. */
  readDeployment?: (rootDir: string, prod: boolean) => Promise<SyncDeployment>
  /** Sets one variable on the deployment, through the `env push` engine. */
  setEnv?: (rootDir: string, name: string, value: string) => Promise<void>
  /** Runs `billing:syncProducts` on the deployment. */
  syncProducts?: (rootDir: string, prod: boolean) => Promise<void>
  print?: (line: string) => void
}

type Print = (line: string) => void

interface SyncInputs {
  environment: Environment
  prod: boolean
  accessToken: string
  catalog: NonNullable<Awaited<ReturnType<typeof loadCatalog>>>['catalog']
  adopt: Record<string, string>
  /** `.env` + `.env.local`, under the process env wherever both are read. */
  localEnv: Record<string, string>
}

/** `key=<id>[,key=<id>…]` → catalog key → provider id. */
function parseAdopt(raw: string | undefined): Record<string, string> {
  const adopt: Record<string, string> = {}
  for (const pair of (raw ?? '').split(',').filter(Boolean)) {
    const [key, id] = pair.split('=')
    if (key && id) adopt[key.trim()] = id.trim()
  }
  return adopt
}

/**
 * A deploy key decides which deployment the Convex CLI writes, whatever the
 * flags say. Under `--env production`, a dev or preview key would put the
 * secret on that deployment; under sandbox, a production key (a legacy key
 * with no type is one) would replace production's secret, and a project key
 * would write the deployment that key selects rather than the dev one
 * `.env.local` names. The exception is a demo or staging app: a production
 * key for a deployment whose `BACKEND_ENVIRONMENT` is `sandbox` takes a
 * sandbox sync, since the sandbox is what that deployment bills in.
 */
function deployKeyRefusal(type: string | null, prod: boolean, deployed: BackendEnvironment | null): string | null {
  if (type === null) return null
  const reachesProduction = type === 'prod' || type === 'project'
  if (prod && !reachesProduction) {
    return `--env production refused: CONVEX_DEPLOY_KEY is a ${type} deployment key, so the webhook secret would land on that deployment instead of production. Use the production deploy key.`
  }
  if (!prod && reachesProduction && !(type === 'prod' && deployed === 'sandbox')) {
    return type === 'prod'
      ? 'Sandbox sync refused: CONVEX_DEPLOY_KEY is a production deploy key, and the Convex CLI follows it whatever the flags say — the sandbox webhook secret would replace production\'s. Unset it for a sandbox sync, or sync production with --env production. (A demo or staging deployment whose BACKEND_ENVIRONMENT is sandbox takes a sandbox sync with its own production key.)'
      : 'Sandbox sync refused: CONVEX_DEPLOY_KEY is a project deploy key, so the Convex CLI would write the deployment that key selects, not the dev deployment .env.local names. Unset it for a sandbox sync, or sync production with --env production.'
  }
  return null
}

/**
 * Which catalog a sync writes: `--env`, else the environment the deployment
 * bills in, read from its `BACKEND_ENVIRONMENT` (the provider's production
 * only on `production`, its sandbox for every other value), else the
 * sandbox. Production is only ever synced as asked or as the deployment says.
 */
function resolveSyncEnvironment(options: BillingSyncCommandOptions, deployed: BackendEnvironment | null): { environment: Environment } | { refusal: string } {
  const environment = options.environment || billingEnvironment(deployed ?? undefined)
  if (environment === 'sandbox' || environment === 'production') return { environment }
  return { refusal: `Unknown billing environment '${environment}' — use sandbox or production.` }
}

/** What a sync runs against, or why it can't run. */
async function resolveSyncInputs(rootDir: string, options: BillingSyncCommandOptions, deps: BillingSyncDeps): Promise<SyncInputs | { refusal: string }> {
  const localEnv = readEnvFiles(rootDir)
  // Where the Convex CLI looks for the key: the process env, then
  // .env.local, then .env.
  const keyType = deployKeyType({ ...localEnv, ...process.env })
  // The deployment the CLI will write says what it bills in, when no
  // --env says, and whether a production key may take a sandbox sync.
  const needsDeployment = !options.environment || (options.environment === 'sandbox' && keyType === 'prod')
  const deployed = needsDeployment ? await (deps.readEnvironment ?? (dir => deploymentBackendEnvironment(dir)))(rootDir) : null
  const target = resolveSyncEnvironment(options, deployed)
  if ('refusal' in target) return target
  const { environment } = target
  const prod = environment === 'production' || options.production === true
  const keyRefusal = deployKeyRefusal(keyType, prod, deployed)
  if (keyRefusal) return { refusal: keyRefusal }
  const accessToken = options.accessToken || process.env.BILLING_ACCESS_TOKEN || localEnv.BILLING_ACCESS_TOKEN
  if (!accessToken) {
    return { refusal: 'BILLING_ACCESS_TOKEN is not set (env or .env.local) — create an organization access token in the provider dashboard.' }
  }
  const loaded = await loadCatalog(rootDir)
  if (!loaded) {
    return { refusal: 'No billing.catalog.ts found — run `npx nuxt-backend init` (or create backend/billing.catalog.ts) first.' }
  }
  // Before the provider hears of anything: the id map the run rewrites at
  // the end must load, or it would lose the other environment's ids.
  const unreadable = await loadGenerated(rootDir).then(() => null, (error: Error) => error.message)
  if (unreadable) return { refusal: unreadable }
  return { environment, prod, accessToken, catalog: loaded.catalog, adopt: parseAdopt(options.adopt), localEnv }
}

/** Merge this environment's ids into billing.generated.ts; resolves with its path once written, or null when it held them already. */
async function writeGenerated(rootDir: string, environment: Environment, ids: CatalogIds, print: Print): Promise<string | null> {
  const generated = await loadGenerated(rootDir)
  generated[environment] = ids
  const path = join(rootDir, resolveFunctionsDir(rootDir), 'billing.generated.ts')
  const text = renderGenerated(generated)
  if (existsSync(path) && readFileSync(path, 'utf8') === text) {
    print(`[nuxt-backend] ${path} holds these ids already.`)
    return null
  }
  writeFileSync(path, text)
  print(`[nuxt-backend] Wrote ${path}: commit it, and push the backend for the deployment to read it.`)
  return path
}

/** A webhook plan that went ahead: an endpoint to provision, or a step left out. */
type GoingAhead = Exclude<WebhookPlan, { refusal: string }>

interface SecretContext {
  force: boolean
  prod: boolean
  /** The deployment written, as output names it. */
  where: string
}

/**
 * What the provider sync is told about the webhook: the endpoint's URL, and
 * why a missing one must not be created — a new endpoint's secret replaces
 * the deployment's own only when `--force` asks for it.
 */
function webhookSyncOptions(plan: GoingAhead, { force, where }: SecretContext): Pick<BillingSyncOptions, 'webhookUrl' | 'webhookBlocked'> {
  if (!('url' in plan)) return {}
  if (!plan.secretSet || force) return { webhookUrl: plan.url }
  return {
    webhookUrl: plan.url,
    webhookBlocked: `not created: ${where} already holds a BILLING_WEBHOOK_SECRET, which a new endpoint's secret would replace — run again with --force to create it and store its secret`,
  }
}

/**
 * Put the endpoint's secret where its deliveries are verified: on the
 * deployment, never on screen. What the provider sync did decides it: a step
 * left out, an endpoint not created, a dry run, or an endpoint whose secret
 * may now be stored.
 */
async function settleWebhook(rootDir: string, plan: GoingAhead, { result, dryRun, ...context }: SecretContext & { result: BillingSyncResult, dryRun: boolean }, deps: BillingSyncDeps, print: Print): Promise<BillingSyncReport['webhook']> {
  if ('skip' in plan) {
    print(`[nuxt-backend] ${plan.skip}`)
    return { url: null, action: 'skipped', secret: 'none', note: plan.skip }
  }
  const entry = result.log.find(item => item.kind === 'webhook')
  // Not created (see webhookSyncOptions): the deployment keeps its own.
  if (entry?.action === 'warn') return { url: plan.url, action: 'skipped', secret: 'kept', note: entry.note ?? '' }
  if (dryRun) return { url: plan.url, action: entry?.action === 'exists' ? 'exists' : 'would-create', secret: 'none' }
  if (!result.webhook) return { url: plan.url, action: 'skipped', secret: 'none', note: 'the provider sync reported no endpoint' }
  return storeEndpointSecret(rootDir, plan, result.webhook, context, deps, print)
}

/**
 * Store an endpoint's secret on the deployment, through the env push engine
 * (on `convex env set`'s stdin). A deployment that already holds one keeps it
 * unless `--force` says otherwise. A secret that cannot be stored is not
 * lost: the provider reports it on every read, so the next run stores it.
 */
async function storeEndpointSecret(rootDir: string, plan: { url: string, secretSet: boolean }, endpoint: ProvisionedWebhook, { force, prod, where }: SecretContext, deps: BillingSyncDeps, print: Print): Promise<BillingSyncReport['webhook']> {
  const { url } = plan
  const action = endpoint.created ? 'created' : 'exists'
  if (!endpoint.created && plan.secretSet && !force) {
    const note = `kept the BILLING_WEBHOOK_SECRET already on ${where} (--force replaces it with this endpoint's)`
    print(`[nuxt-backend] Webhook endpoint exists; ${note}.`)
    return { url, action, secret: 'kept', note }
  }
  const error = endpoint.secret ? await setWebhookSecret(rootDir, endpoint.secret, prod, deps) : 'the provider did not report it'
  if (error === null) {
    print(`[nuxt-backend] ${storedLine(endpoint.created, plan.secretSet, where)}`)
    return { url, action, secret: 'stored' }
  }
  const setByHand = `\`npx convex env set${prod ? ' --prod' : ''} BILLING_WEBHOOK_SECRET\` asks for it — copy it from the provider dashboard (Webhooks → the endpoint)`
  const note = `its secret could not be stored on ${where} (${error}). Run billing sync again once that is fixed — it finds the endpoint and stores the secret — or set it yourself: ${setByHand}`
  print(`[nuxt-backend] Webhook endpoint ${endpoint.created ? 'created' : 'found'}, but ${note}.`)
  return { url, action, secret: 'not-stored', note }
}

/** The line that says which secret a run stored, and where. */
function storedLine(created: boolean, replaced: boolean, where: string): string {
  if (created) return `Stored the new endpoint's secret on ${where} as BILLING_WEBHOOK_SECRET.`
  return replaced
    ? `Replaced BILLING_WEBHOOK_SECRET on ${where} with the endpoint's secret (--force).`
    : `Stored the existing endpoint's secret on ${where} as BILLING_WEBHOOK_SECRET, which it lacked.`
}

/** Set BILLING_WEBHOOK_SECRET through the env push engine; resolves with why it failed, or null. */
async function setWebhookSecret(rootDir: string, secret: string, prod: boolean, { setEnv }: BillingSyncDeps): Promise<string | null> {
  const [outcome] = await executeEnvPush(rootDir, [{ name: 'BILLING_WEBHOOK_SECRET', action: 'update', detail: 'the webhook endpoint billing sync provisioned', value: secret }], { prod, ...(setEnv ? { setEnv } : {}) })
  return outcome?.outcome === 'set' ? null : outcome?.error ?? 'unknown error'
}

/**
 * Pricing reads the deployment's product table, which fills from product
 * webhooks: load it now so the catalog renders at once — when the deployment
 * can, that is: it needs its own access token, for the environment synced.
 */
async function refreshProducts(rootDir: string, context: { deployment: SyncDeployment, environment: Environment, prod: boolean, where: string }, deps: BillingSyncDeps, print: Print): Promise<BillingSyncReport['products']> {
  const { deployment, environment, prod, where } = context
  const blocker = productsRefreshBlocker(deployment, environment, prod)
  if (blocker) {
    print(`[nuxt-backend] Products not loaded: ${blocker}`)
    return { status: 'skipped', note: blocker }
  }
  try {
    // Longer than a read: the action pages through the provider's products.
    await (deps.syncProducts ?? ((dir, onProd) => runConvex(dir, ['run', ...deploymentFlags({ prod: onProd }), 'billing:syncProducts'], { timeout: 120_000 }).then(() => {})))(rootDir, prod)
    print(`[nuxt-backend] Loaded the products on ${where} (billing:syncProducts).`)
    return { status: 'synced' }
  }
  catch (error) {
    const note = `billing:syncProducts failed on ${where} (${error instanceof Error ? error.message : String(error)}). Run it again once that is fixed: npx convex run${prod ? ' --prod' : ''} billing:syncProducts`
    print(`[nuxt-backend] ${note}`)
    return { status: 'failed', note }
  }
}

/**
 * What the sync writes, read before anything is written — the inputs, the
 * deployment the Convex CLI acts on and its env, and the webhook plan — or
 * why it cannot run. Under production, `.env.local`'s site URL is dev's.
 */
async function resolveSyncTarget(rootDir: string, options: BillingSyncCommandOptions, deps: BillingSyncDeps): Promise<{ inputs: SyncInputs, deployment: SyncDeployment, plan: GoingAhead } | { refusal: string }> {
  const inputs = await resolveSyncInputs(rootDir, options, deps)
  if ('refusal' in inputs) return inputs
  const { prod, localEnv } = inputs
  const deployment = await (deps.readDeployment ?? readSyncDeployment)(rootDir, prod)
  const plan = planWebhook(options.webhook, { prod, deployment, env: prod ? process.env : { ...localEnv, ...process.env } })
  return 'refusal' in plan ? plan : { inputs, deployment, plan }
}

/**
 * `billing sync`, as data: read the deployment it writes, push the catalog,
 * store the webhook endpoint's secret on that deployment (never printed),
 * write the id map, and load the deployment's products. `--env production`
 * writes the production deployment; sandbox writes the one the Convex CLI
 * selects — the one `.env.local` names.
 */
export async function runBillingSync(rootDir: string, options: BillingSyncCommandOptions, deps: BillingSyncDeps = {}): Promise<{ exitCode: 0 | 1, report: BillingSyncReport | null, refusal?: string }> {
  const print = deps.print ?? (line => console.log(line))
  const target = await resolveSyncTarget(rootDir, options, deps)
  if ('refusal' in target) {
    console.error(`[nuxt-backend] ${target.refusal}`)
    return { exitCode: 1, report: null, refusal: target.refusal }
  }
  const { inputs: { environment, prod, accessToken, catalog, adopt }, deployment, plan } = target
  const dryRun = options.dryRun === true
  const context: SecretContext = { force: options.force === true, prod, where: deploymentLabel(deployment.url, prod) }
  print(`[nuxt-backend] billing sync → ${environment} (${deployment.url ? context.where : 'deployment not readable'})${dryRun ? ' — dry run' : ''}`)

  const result = await (deps.sync ?? syncBillingCatalog)(catalog, { rootDir, environment, accessToken, dryRun, adopt, ...webhookSyncOptions(plan, context) })
  for (const entry of result.log) {
    print(`  ${entry.action.padEnd(12)} ${entry.kind.padEnd(8)} ${entry.key}${entry.id ? ` (${entry.id})` : ''}${entry.note ? ` — ${entry.note}` : ''}`)
  }
  // The secret before the id map: a run that fails after this has stored it.
  const webhook = await settleWebhook(rootDir, plan, { ...context, result, dryRun }, deps, print)
  const generated = dryRun ? null : await writeGenerated(rootDir, environment, result.ids, print)
  const products: BillingSyncReport['products'] = dryRun
    ? { status: 'skipped', note: 'dry run' }
    : await refreshProducts(rootDir, { deployment, environment, prod, where: context.where }, deps, print)
  return {
    exitCode: webhook.secret === 'not-stored' ? 1 : 0,
    report: { environment, dryRun, deployment: deployment.url, log: result.log, generated, webhook, products },
  }
}

export const billingSync = withContract('billing sync', {
  sideEffects: ['writes provider accounts', 'writes project files', 'writes the dev deployment', 'writes production'],
  json: '{ environment, dryRun, deployment, log: [{ action, kind, key, id?, note? }], generated, webhook: { url, action: "created" | "exists" | "would-create" | "skipped", secret: "stored" | "kept" | "not-stored" | "none", note? }, products: { status: "synced" | "failed" | "skipped", note? } }',
  exitCodes: {
    0: 'Synced, or a dry run. A webhook or product step that could not run is reported, not fatal',
    1: 'Refused or failed: unknown environment, no access token or catalog, a catalog plan still in the 0.1 shape (`interval` and `price`) or priced at no interval, an id map (`billing.generated.ts`) that does not load, a deploy key for the other kind of deployment, a production webhook URL that cannot be derived, a webhook URL on a deployment other than the one written, a provider error, or a webhook secret that belongs on the deployment and could not be stored',
  },
}, defineCommand({
  meta: { name: 'sync', description: 'Push backend/billing.catalog.ts — meters, custom fields, feature/credit benefits, plans (a product per monthly and yearly price, trials, usage prices, tax behaviour; retired plans archived) and packs — to the billing provider, store the webhook endpoint\'s secret on the deployment, write billing.generated.ts (find-or-create, never deletes; drift reported) and load the deployment\'s products. Sandbox writes the deployment .env.local names; production writes the production deployment' },
  args: {
    'cwd': { type: 'string', description: 'Project directory', default: '.' },
    'env': { type: 'string', description: 'Target environment: sandbox | production (default: the environment the deployment bills in, read from its BACKEND_ENVIRONMENT, else sandbox)' },
    'dry-run': { type: 'boolean', description: 'Print the plan without creating anything', default: false },
    'webhook': { type: 'string', description: 'Provision the webhook endpoint at this URL (default: <site>/billing/events of the deployment written; pass "off" to skip)' },
    'force': { type: 'boolean', description: 'Store the webhook endpoint\'s secret even over a BILLING_WEBHOOK_SECRET the deployment already holds', default: false },
    'adopt': { type: 'string', description: 'Adopt existing objects (products, meters, custom fields): key=<id>[,key=<id>…] — recorded as-is, benefits untouched' },
    'json': { type: 'boolean', description: 'Print the outcome as one JSON document; progress goes to stderr', default: false },
  },
  async run({ args }) {
    const { exitCode, report } = await runBillingSync(resolve(process.cwd(), args.cwd), {
      ...(args.env ? { environment: args.env } : {}),
      dryRun: args['dry-run'],
      ...(args.webhook ? { webhook: args.webhook } : {}),
      force: args.force,
      ...(args.adopt ? { adopt: args.adopt } : {}),
    }, { print: progress(args.json) })
    if (args.json && report) console.log(JSON.stringify(report, null, 2))
    if (exitCode !== 0) process.exitCode = exitCode
  },
}))

export const billing = defineCommand({
  meta: { name: 'billing', description: 'Billing catalog helpers' },
  subCommands: { sync: billingSync },
})
