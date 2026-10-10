import { existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { BillingCatalog } from '../convex/catalog'
import { resolveFunctionsDir } from '../scaffold'
import type { DevtoolsCatalogSummary } from './rpc-types'

/**
 * Import a module of the app as it is now. Node keeps every module URL it has
 * loaded for the life of the dev server, so the URL is keyed on the file's
 * modification time and size: an edit loads afresh, and opening the Billing
 * page again reuses the module already loaded instead of adding another.
 */
async function importFresh<T>(path: string): Promise<T> {
  const { mtimeMs, size } = await stat(path)
  return await import(`${pathToFileURL(path).href}?v=${mtimeMs}-${size}`) as T
}

/**
 * What `billing.catalog.ts` declares (keys only) and which environments
 * `billing sync` has written ids for in `billing.generated.ts`. Both files are
 * the app's own modules, loaded the way `billing sync` loads them.
 */
export async function readCatalogSummary(rootDir: string): Promise<DevtoolsCatalogSummary> {
  const dir = join(rootDir, resolveFunctionsDir(rootDir))
  const catalogPath = join(dir, 'billing.catalog.ts')
  const empty = { meters: [], plans: [], packs: [], features: [], synced: [] }
  if (!existsSync(catalogPath)) return { status: 'missing', ...empty }
  try {
    const catalog = (await importFresh<{ default?: BillingCatalog }>(catalogPath)).default ?? {}
    const generatedPath = join(dir, 'billing.generated.ts')
    const generated = existsSync(generatedPath)
      ? (await importFresh<{ catalog?: Record<string, unknown> }>(generatedPath)).catalog ?? {}
      : {}
    return {
      status: 'ok',
      meters: Object.keys(catalog.meters ?? {}),
      plans: Object.keys(catalog.plans ?? {}),
      packs: Object.keys(catalog.packs ?? {}),
      features: Object.keys(catalog.features ?? {}),
      synced: Object.entries(generated)
        .filter(([, ids]) => ids !== null && typeof ids === 'object' && Object.keys(ids).length > 0)
        .map(([environment]) => environment),
    }
  }
  catch (error) {
    return { status: 'error', error: error instanceof Error ? error.message : String(error), ...empty }
  }
}
