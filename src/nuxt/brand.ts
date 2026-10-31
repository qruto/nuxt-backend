import { resolve } from 'node:path'
import type { Nuxt } from '@nuxt/schema'
import { appBrandOf } from '../brand-file'
import { brandFileLocation, syncBrandFile } from '../brand-sync'
import { packageDir } from '../dirs'
import { logger } from './logger'

/**
 * The one brand: write `appConfig.backend.brand` (its name, logo and postal
 * address) into the functions directory's `brand.generated.ts`, when the
 * file says something else, so the backend's emails name the app as its
 * pages do. Every start does it, as for the paths file; never under a test
 * runner, nor in this package's own root.
 */
export function registerBrandFile(nuxt: Nuxt): void {
  const rootDir = nuxt.options.rootDir
  if (nuxt.options.test || resolve(rootDir) === resolve(packageDir)) return
  nuxt.hook('modules:done', async () => {
    const brand = await appBrandOf(nuxt.options as never)
    if (brand && syncBrandFile(rootDir, brand) === 'written') {
      logger.info(`Wrote ${brandFileLocation(rootDir).name}: the backend's brand follows app.config (\`backend.brand\`).`)
    }
  })
}
