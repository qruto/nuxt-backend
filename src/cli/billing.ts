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
import { resolveFunctionsDir } from '../scaffold'
import { readEnvFiles } from '../env-push'
import { deriveDeploymentUrls } from '../deployment'
import { loadCatalog } from './billing/doctor'
import { loadGenerated, renderGenerated } from './billing/generated'
import type { Environment } from './billing/provider'
import { syncBillingCatalog } from './billing/sync'

// The command lives here; the reconciliation (billing/sync.ts), doctor's
// cross-checks (billing/doctor.ts) and the generated id map
// (billing/generated.ts) live under billing/. src/doctor.ts and the tests
// import them through this entry.
export { collectBillingFindings, loadCatalog, readBillingOrganizationState, type BillingOrganizationState } from './billing/doctor'
export { syncBillingCatalog } from './billing/sync'

export const billingSync = defineCommand({
  meta: { name: 'sync', description: 'Push backend/billing.catalog.ts — meters, custom fields, feature/credit benefits, plans (trials, usage prices, tax behaviour) and packs — to the billing provider and write billing.generated.ts (find-or-create, never deletes)' },
  args: {
    'cwd': { type: 'string', description: 'Project directory', default: '.' },
    'env': { type: 'string', description: 'Target environment: sandbox | production (default: BILLING_ENVIRONMENT or sandbox)' },
    'dry-run': { type: 'boolean', description: 'Print the plan without creating anything', default: false },
    'webhook': { type: 'string', description: 'Provision the webhook endpoint at this URL (default: derived <site>/billing/events; pass "off" to skip)' },
    'adopt': { type: 'string', description: 'Adopt existing objects (products, meters, custom fields): key=<id>[,key=<id>…] — recorded as-is, benefits untouched' },
  },
  async run({ args }) {
    const rootDir = resolve(process.cwd(), args.cwd)
    const localEnv = readEnvFiles(rootDir)
    const environment = (args.env ?? process.env.BILLING_ENVIRONMENT ?? localEnv.BILLING_ENVIRONMENT ?? 'sandbox') as Environment
    if (environment !== 'sandbox' && environment !== 'production') {
      console.error(`[nuxt-backend] Unknown billing environment '${environment}' — use sandbox or production.`)
      process.exitCode = 1
      return
    }
    const accessToken = process.env.BILLING_ACCESS_TOKEN ?? localEnv.BILLING_ACCESS_TOKEN
    if (!accessToken) {
      console.error('[nuxt-backend] BILLING_ACCESS_TOKEN is not set (env or .env.local) — create an organization access token in the provider dashboard.')
      process.exitCode = 1
      return
    }

    const loaded = await loadCatalog(rootDir)
    if (!loaded) {
      console.error('[nuxt-backend] No billing.catalog.ts found — run `npx nuxt-backend init` (or create backend/billing.catalog.ts) first.')
      process.exitCode = 1
      return
    }

    const adopt: Record<string, string> = {}
    for (const pair of (args.adopt ?? '').split(',').filter(Boolean)) {
      const [key, id] = pair.split('=')
      if (key && id) adopt[key.trim()] = id.trim()
    }

    const webhookUrl = args.webhook === 'off'
      ? undefined
      : args.webhook ?? (() => {
        const siteUrl = deriveDeploymentUrls(rootDir)?.siteUrl
        return siteUrl ? `${siteUrl}/billing/events` : undefined
      })()

    console.log(`[nuxt-backend] billing sync → ${environment}${args['dry-run'] ? ' — dry run' : ''}`)
    const result = await syncBillingCatalog(loaded.catalog, {
      rootDir,
      environment,
      accessToken,
      dryRun: args['dry-run'],
      adopt,
      webhookUrl,
    })

    for (const entry of result.log) {
      const id = entry.id ? ` (${entry.id})` : ''
      const note = entry.note ? ` — ${entry.note}` : ''
      console.log(`  ${entry.action.padEnd(12)} ${entry.kind.padEnd(8)} ${entry.key}${id}${note}`)
    }

    if (!args['dry-run']) {
      const generated = await loadGenerated(rootDir)
      generated[environment] = result.ids
      const functionsDir = resolveFunctionsDir(rootDir)
      const outPath = join(rootDir, functionsDir, 'billing.generated.ts')
      writeFileSync(outPath, renderGenerated(generated))
      console.log(`[nuxt-backend] Wrote ${outPath}`)
    }

    if (result.webhookSecret) {
      console.log('\n[nuxt-backend] Webhook endpoint created. Store its secret on the deployment:')
      console.log(`  npx convex env set BILLING_WEBHOOK_SECRET ${result.webhookSecret}`)
    }
  },
})

export const billing = defineCommand({
  meta: { name: 'billing', description: 'Billing catalog helpers' },
  subCommands: { sync: billingSync },
})
