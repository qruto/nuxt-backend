import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { BillingCatalog } from '../convex/catalog'
import { resolveFunctionsDir } from '../scaffold'
import type { DevtoolsCatalogSummary } from './rpc-types'

let imports = 0

/** Import a module of the app afresh: the file changes while the dev server runs. */
async function importFresh<T>(path: string): Promise<T> {
  return await import(`${pathToFileURL(path).href}?t=${Date.now()}-${++imports}`) as T
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
