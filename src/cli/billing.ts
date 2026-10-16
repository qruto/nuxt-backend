/**
 * `nuxt-backend billing sync` — push the code-declared catalog
 * (`backend/billing.catalog.ts`) to the billing provider and write the id map
 * to `backend/billing.generated.ts`.
 *
 * Find-or-create only: every managed object is tagged
 * `metadata: { managedBy: 'nuxt-backend', key }` and looked up by that tag on
 * the next run, so re-running is idempotent. Nothing remote is ever updated
 * (prices on subscribed products are a dashboard task) or deleted — managed
 * objects whose key left the catalog are reported as drift. Granting stays
 * provider-native: plan/pack credits become meter-credit benefits attached to
 * the products, granted by the provider per cycle / at purchase.
 *
 * `--adopt key=<id>` records an existing product/meter/custom field under a
 * catalog key instead of creating a managed twin — benefits of adopted
 * products are left exactly as they are.
 */
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { defineCommand } from 'citty'
import { runConvex } from '../convex-cli'
import { deriveDeploymentUrls } from '../deployment'
import { deploymentFlags, executeEnvPush, nonProductionDeployKey, readEnvFiles } from '../env-push'
import { resolveFunctionsDir } from '../scaffold'
import { loadCatalog } from './billing/doctor'
import { loadGenerated, renderGenerated } from './billing/generated'
import type { CatalogIds, Environment, SyncLogEntry } from './billing/provider'
import { syncBillingCatalog } from './billing/sync'
import { progress, withContract } from './contract'

// The command lives here; the reconciliation (billing/sync.ts), doctor's
// cross-checks (billing/doctor.ts) and the generated id map
// (billing/generated.ts) live under billing/. src/doctor.ts and the tests
// import them through this entry.
export { collectBillingFindings, loadCatalog, readBillingOrganizationState, type BillingOrganizationState } from './billing/doctor'
export { syncBillingCatalog } from './billing/sync'

export interface BillingSyncCommandOptions {
  environment?: string
  dryRun?: boolean
  /** The webhook endpoint URL; `'off'` skips it; unset derives `<site>/billing/events`. */
  webhook?: string
  /** `key=<id>[,key=<id>…]`. */
  adopt?: string
}

/** What `billing sync --json` prints. The webhook secret never appears in it. */
export interface BillingSyncReport {
  environment: Environment
  dryRun: boolean
  log: SyncLogEntry[]
  /** The id map written, or `null` on a dry run. */
  generated: string | null
  webhook: {
    url: string
    /** `created` stores a new secret on the deployment; `exists` keeps the one set there. */
    action: SyncLogEntry['action']
    secret: 'stored' | 'not-stored' | 'none'
  } | null
  /** `billing:syncProducts` on the deployment, so pricing renders before the first product webhook. */
  products: 'synced' | 'failed' | 'skipped'
}

export interface BillingSyncDeps {
  sync?: typeof syncBillingCatalog
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
  webhookUrl: string | undefined
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

/** The endpoint to provision: the given URL, none for `off`, else the derived `<site>/billing/events`. */
function webhookTarget(rootDir: string, option: string | undefined): string | undefined {
  if (option === 'off') return undefined
  if (option) return option
  const siteUrl = deriveDeploymentUrls(rootDir)?.siteUrl
  return siteUrl ? `${siteUrl}/billing/events` : undefined
}

/** What a sync runs against, or why it can't run. */
async function resolveSyncInputs(rootDir: string, options: BillingSyncCommandOptions): Promise<SyncInputs | { refusal: string }> {
  const localEnv = readEnvFiles(rootDir)
  // An empty value (`BILLING_ENVIRONMENT=` in .env.local) means unset.
  const environment = [options.environment, process.env.BILLING_ENVIRONMENT, localEnv.BILLING_ENVIRONMENT].find(Boolean) ?? 'sandbox'
  if (environment !== 'sandbox' && environment !== 'production') {
    return { refusal: `Unknown billing environment '${environment}' — use sandbox or production.` }
  }
  const prod = environment === 'production'
  const keyType = prod ? nonProductionDeployKey({ ...localEnv, ...process.env }) : null
  if (keyType) {
    return { refusal: `--env production refused: CONVEX_DEPLOY_KEY is a ${keyType} deployment key, so the webhook secret would land on that deployment instead of production. Use the production deploy key.` }
  }
  const accessToken = process.env.BILLING_ACCESS_TOKEN || localEnv.BILLING_ACCESS_TOKEN
  if (!accessToken) {
    return { refusal: 'BILLING_ACCESS_TOKEN is not set (env or .env.local) — create an organization access token in the provider dashboard.' }
  }
  const loaded = await loadCatalog(rootDir)
  if (!loaded) {
    return { refusal: 'No billing.catalog.ts found — run `npx nuxt-backend init` (or create backend/billing.catalog.ts) first.' }
  }
  return { environment, prod, accessToken, catalog: loaded.catalog, adopt: parseAdopt(options.adopt), webhookUrl: webhookTarget(rootDir, options.webhook) }
}

/** Merge this environment's ids into billing.generated.ts; returns its path. */
async function writeGenerated(rootDir: string, environment: Environment, ids: CatalogIds, print: Print): Promise<string> {
  const generated = await loadGenerated(rootDir)
  generated[environment] = ids
  const path = join(rootDir, resolveFunctionsDir(rootDir), 'billing.generated.ts')
  writeFileSync(path, renderGenerated(generated))
  print(`[nuxt-backend] Wrote ${path}`)
  return path
}

/**
 * A new endpoint's secret is shown once, by the provider's API: store it on
 * the deployment through the env push engine, never on screen.
 */
async function storeWebhookSecret(rootDir: string, secret: string, prod: boolean, deps: BillingSyncDeps, print: Print): Promise<'stored' | 'not-stored'> {
  const setEnv = deps.setEnv ?? ((dir, name, value) => runConvex(dir, ['env', 'set', ...deploymentFlags({ prod }), name, value]).then(() => {}))
  const [outcome] = await executeEnvPush(rootDir, [{ name: 'BILLING_WEBHOOK_SECRET', action: 'update', detail: 'the webhook endpoint billing sync created', value: secret }], { prod, setEnv })
  if (outcome?.outcome === 'set') {
    print(`[nuxt-backend] Webhook endpoint created; its secret is stored on the ${prod ? 'production' : 'dev'} deployment as BILLING_WEBHOOK_SECRET.`)
    return 'stored'
  }
  print(`[nuxt-backend] Webhook endpoint created, but its secret could not be stored (${outcome?.error ?? 'unknown error'}). Copy it from the provider dashboard (Webhooks → the endpoint) and run: npx convex env set${prod ? ' --prod' : ''} BILLING_WEBHOOK_SECRET <secret>`)
  return 'not-stored'
}

/**
 * Pricing reads the deployment's product table, which fills from product
 * webhooks: refresh it now so the catalog renders at once.
 */
async function refreshProducts(rootDir: string, prod: boolean, deps: BillingSyncDeps, print: Print): Promise<'synced' | 'failed'> {
  try {
    await (deps.syncProducts ?? ((dir, onProd) => runConvex(dir, ['run', ...deploymentFlags({ prod: onProd }), 'billing:syncProducts']).then(() => {})))(rootDir, prod)
    print('[nuxt-backend] Refreshed the deployment\'s products (billing:syncProducts).')
    return 'synced'
  }
  catch {
    print(`[nuxt-backend] Could not run billing:syncProducts on the deployment (not deployed yet?). Run it once deployed: npx convex run${prod ? ' --prod' : ''} billing:syncProducts`)
    return 'failed'
  }
}

/**
 * `billing sync`, as data: push the catalog, write the id map, store a new
 * webhook endpoint's secret on the deployment (never printed), and refresh
 * the deployment's product table. `--env production` writes the production
 * deployment; sandbox writes the one .env.local names.
 */
export async function runBillingSync(rootDir: string, options: BillingSyncCommandOptions, deps: BillingSyncDeps = {}): Promise<{ exitCode: 0 | 1, report: BillingSyncReport | null }> {
  const print = deps.print ?? (line => console.log(line))
  const inputs = await resolveSyncInputs(rootDir, options)
  if ('refusal' in inputs) {
    console.error(`[nuxt-backend] ${inputs.refusal}`)
    return { exitCode: 1, report: null }
  }
  const { environment, prod, accessToken, catalog, adopt, webhookUrl } = inputs
  const dryRun = options.dryRun === true
  print(`[nuxt-backend] billing sync → ${environment}${dryRun ? ' — dry run' : ''}`)
  const result = await (deps.sync ?? syncBillingCatalog)(catalog, { rootDir, environment, accessToken, dryRun, adopt, webhookUrl })
  for (const entry of result.log) {
    print(`  ${entry.action.padEnd(12)} ${entry.kind.padEnd(8)} ${entry.key}${entry.id ? ` (${entry.id})` : ''}${entry.note ? ` — ${entry.note}` : ''}`)
  }
  const generated = dryRun ? null : await writeGenerated(rootDir, environment, result.ids, print)
  const secret = result.webhookSecret ? await storeWebhookSecret(rootDir, result.webhookSecret, prod, deps, print) : 'none'
  const products = dryRun ? 'skipped' : await refreshProducts(rootDir, prod, deps, print)
  const webhookEntry = result.log.find(entry => entry.kind === 'webhook')
  return {
    exitCode: secret === 'not-stored' ? 1 : 0,
    report: {
      environment,
      dryRun,
      log: result.log,
      generated,
      webhook: webhookUrl && webhookEntry ? { url: webhookUrl, action: webhookEntry.action, secret } : null,
      products,
    },
  }
}

export const billingSync = withContract('billing sync', {
  sideEffects: ['writes provider accounts', 'writes project files', 'writes the dev deployment', 'writes production'],
  json: '{ environment, dryRun, log: [{ action, kind, key, id?, note? }], generated, webhook: { url, action, secret: "stored" | "not-stored" | "none" } | null, products: "synced" | "failed" | "skipped" }',
  exitCodes: {
    0: 'Synced (a failed product refresh is reported, not fatal), or a dry run',
    1: 'Refused or failed: unknown environment, no access token or catalog, a non-production deploy key with --env production, a provider error, or a new webhook secret that could not be stored',
  },
}, defineCommand({
  meta: { name: 'sync', description: 'Push backend/billing.catalog.ts — meters, custom fields, feature/credit benefits, plans (trials, usage prices, tax behaviour) and packs — to the billing provider, write billing.generated.ts (find-or-create, never deletes), store a new webhook endpoint\'s secret on the deployment and refresh its products. Sandbox writes the deployment .env.local names; production writes the production deployment' },
  args: {
    'cwd': { type: 'string', description: 'Project directory', default: '.' },
    'env': { type: 'string', description: 'Target environment: sandbox | production (default: BILLING_ENVIRONMENT or sandbox)' },
    'dry-run': { type: 'boolean', description: 'Print the plan without creating anything', default: false },
    'webhook': { type: 'string', description: 'Provision the webhook endpoint at this URL (default: derived <site>/billing/events; pass "off" to skip)' },
    'adopt': { type: 'string', description: 'Adopt existing objects (products, meters, custom fields): key=<id>[,key=<id>…] — recorded as-is, benefits untouched' },
    'json': { type: 'boolean', description: 'Print the outcome as one JSON document; progress goes to stderr', default: false },
  },
  async run({ args }) {
    const { exitCode, report } = await runBillingSync(resolve(process.cwd(), args.cwd), {
      ...(args.env ? { environment: args.env } : {}),
      dryRun: args['dry-run'],
      ...(args.webhook ? { webhook: args.webhook } : {}),
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
