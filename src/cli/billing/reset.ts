import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runConvex } from '../../convex-cli'
import { freePlanOf } from '../../convex/catalog'
import type { BackendEnvironment } from '../../convex/environment'
import { deployKeyType, deploymentBackendEnvironment, readEnvFiles } from '../../env-push'
import type { BillingSyncCommandOptions, BillingSyncDeps, BillingSyncReport } from '../billing'
import { loadCatalog } from './doctor'
import { PROVIDER_COMPONENT } from './mappings'

// `billing reset`: start a dev deployment's billing over in the organization
// BILLING_ACCESS_TOKEN names now. The provider's component maps each billing
// entity onto a customer once and has no way to forget one, so after the
// token moves to another organization (a new sandbox) every entity's billing
// is refused (`customer_unknown`) until its rows are gone. The reset syncs
// the catalog first, so a sync that is refused leaves everything as it was;
// then it clears the component's customers and subscriptions and the
// backend's entitlement cache, and puts every billing entity back on the
// free plan, in the new organization.

/** What the reset clears: the provider component's mappings and synced subscriptions, then the backend's cache derived from them. */
export const RESET_TABLES = [
  { component: PROVIDER_COMPONENT, table: 'customers' },
  { component: PROVIDER_COMPONENT, table: 'subscriptions' },
  { component: 'backend', table: 'billingEntitlements' },
] as const

/** What `billing reset --json` prints. */
export interface BillingResetReport {
  /** What the catalog sync did, as `billing sync --json` prints it. */
  sync: BillingSyncReport
  /** Each table, in order: cleared, failed (and nothing after it was tried), or not reached. */
  cleared: Array<{ component: string, table: string, status: 'cleared' | 'failed' | 'skipped', note?: string }>
  /** `billing:startFreePlan` for every billing entity: queued, skipped without a free plan or after a failed clear, or failed. */
  freePlan: { status: 'queued' | 'skipped' | 'failed', note?: string }
}

export interface BillingResetDeps {
  /** `billing sync` as data: the reset runs it for the sandbox. */
  sync: (rootDir: string, options: BillingSyncCommandOptions, deps: BillingSyncDeps) => Promise<{ exitCode: 0 | 1, report: BillingSyncReport | null, refusal?: string }>
  /** Reads the `BACKEND_ENVIRONMENT` of the deployment the Convex CLI will write: `null` when unset or unreadable. */
  readEnvironment?: (rootDir: string) => Promise<BackendEnvironment | null>
  print?: (line: string) => void
}

/**
 * Why the reset must not run: a deploy key that selects any deployment but
 * a dev one (the Convex CLI follows it whatever the flags say), or a
 * deployment that bills in production. Null when it may.
 */
function resetRefusal(keyType: string | null, environment: BackendEnvironment | null): string | null {
  if (keyType !== null && keyType !== 'dev') {
    return `billing reset refused: CONVEX_DEPLOY_KEY is a ${keyType} deploy key, and the Convex CLI follows it whatever the flags say, so the reset would clear the billing data of the deployment that key selects. It clears a dev deployment only: unset the key to reset the one CONVEX_DEPLOYMENT names in .env.local.`
  }
  if (environment === 'production') {
    return 'billing reset refused: the deployment bills in production (its BACKEND_ENVIRONMENT is production). It clears a dev deployment that bills in the sandbox only; on production, point BILLING_ACCESS_TOKEN back at the organization the billing data came from.'
  }
  return null
}

/** Empty one table through `convex import --replace` of an empty file: the provider's component has no mutation that deletes its rows. */
async function clearTable(rootDir: string, empty: string, { component, table }: { component: string, table: string }): Promise<void> {
  if (component === 'backend') {
    await runConvex(rootDir, ['run', '--component', 'backend', 'billing:clear', '{}'])
    return
  }
  await runConvex(rootDir, ['import', '--component', component, '--table', table, '--replace', '--yes', '--format', 'jsonArray', empty], { timeout: 120_000 })
}

/** Clear {@link RESET_TABLES} in order, stopping at the first that fails. */
async function clearTables(rootDir: string, print: (line: string) => void): Promise<BillingResetReport['cleared']> {
  const dir = mkdtempSync(join(tmpdir(), 'nuxt-backend-billing-reset-'))
  const empty = join(dir, 'empty.json')
  writeFileSync(empty, '[]\n')
  const cleared: BillingResetReport['cleared'] = []
  try {
    for (const target of RESET_TABLES) {
      if (cleared.some(entry => entry.status === 'failed')) {
        cleared.push({ ...target, status: 'skipped' })
        continue
      }
      try {
        await clearTable(rootDir, empty, target)
        print(`[nuxt-backend] Cleared ${target.component}:${target.table}.`)
        cleared.push({ ...target, status: 'cleared' })
      }
      catch (error) {
        const note = `${target.component}:${target.table} could not be cleared (${error instanceof Error ? error.message : String(error)}). Run billing reset again once the deployment answers.`
        print(`[nuxt-backend] ${note}`)
        cleared.push({ ...target, status: 'failed', note })
      }
    }
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
  return cleared
}

/**
 * Put every billing entity back on the free plan (`billing:startFreePlan
 * '{}'`), in the organization the catalog was just synced to. A rewritten id
 * map is pushed first: the deployment subscribes the free product the map it
 * runs names.
 */
async function startFreePlan(rootDir: string, { push }: { push: boolean }, print: (line: string) => void): Promise<BillingResetReport['freePlan']> {
  const catalog = (await loadCatalog(rootDir).catch(() => null))?.catalog
  if (!catalog || !freePlanOf(catalog)) return { status: 'skipped', note: 'the catalog has no free plan' }
  try {
    await runConvex(rootDir, ['run', ...push ? ['--push', '--typecheck', 'disable'] : [], 'billing:startFreePlan', '{}'], { timeout: 120_000 })
    print(`[nuxt-backend] Queued the free plan for every billing entity (billing:startFreePlan${push ? ', after pushing the new id map' : ''}).`)
    return { status: 'queued' }
  }
  catch (error) {
    const note = `billing:startFreePlan failed (${error instanceof Error ? error.message : String(error)}). Run it once that is fixed: npx convex run${push ? ' --push' : ''} billing:startFreePlan '{}'`
    print(`[nuxt-backend] ${note}`)
    return { status: 'failed', note }
  }
}

/**
 * `billing reset`, as data: refuse anything but a dev deployment that bills
 * in the sandbox, sync the catalog, clear {@link RESET_TABLES}, and queue the
 * free plan for every billing entity.
 */
export async function runBillingReset(rootDir: string, deps: BillingResetDeps): Promise<{ exitCode: 0 | 1, report: BillingResetReport | null, refusal?: string }> {
  const print = deps.print ?? (line => console.log(line))
  // Where the Convex CLI looks for the key: the process env, then .env.local, then .env.
  const keyType = deployKeyType({ ...readEnvFiles(rootDir), ...process.env })
  const keyRefusal = resetRefusal(keyType, null)
  if (keyRefusal) {
    console.error(`[nuxt-backend] ${keyRefusal}`)
    return { exitCode: 1, report: null, refusal: keyRefusal }
  }
  const environment = await (deps.readEnvironment ?? (dir => deploymentBackendEnvironment(dir)))(rootDir)
  const refusal = resetRefusal(keyType, environment)
  if (refusal) {
    console.error(`[nuxt-backend] ${refusal}`)
    return { exitCode: 1, report: null, refusal }
  }

  // The catalog first: a sync that is refused (no token, no catalog) clears nothing.
  const synced = await deps.sync(rootDir, { environment: 'sandbox' }, { print })
  if (!synced.report) return { exitCode: 1, report: null, ...synced.refusal ? { refusal: synced.refusal } : {} }

  const cleared = await clearTables(rootDir, print)
  const freePlan = cleared.every(entry => entry.status === 'cleared')
    ? await startFreePlan(rootDir, { push: synced.report.generated !== null }, print)
    : { status: 'skipped' as const, note: 'the billing data was not cleared' }
  const failed = synced.exitCode !== 0 || freePlan.status === 'failed' || cleared.some(entry => entry.status !== 'cleared')
  return { exitCode: failed ? 1 : 0, report: { sync: synced.report, cleared, freePlan } }
}
