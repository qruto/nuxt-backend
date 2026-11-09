import { resolve } from 'node:path'
import type { Nuxt } from '@nuxt/schema'
import { appBrandOf } from '../brand-file'
import { brandFileLocation, syncBrandFile } from '../brand-sync'
import { packageDir } from '../dirs'
import { appLabelsOf } from '../labels-file'
import { labelsFileLocation, syncLabelsFile } from '../labels-sync'
import { logger } from './logger'

/**
 * The brand and the labels, written once in app config: write
 * `appConfig.backend.brand` (its name, logo and postal address) into the
 * functions directory's `brand.generated.ts`, and `appConfig.backend.labels`
 * into `labels.generated.ts`, when a file says something else, so the
 * backend's emails and notifications name the app and word their copy as
 * its pages do. Every start does it, as for the paths file, and a dev
 * server again when a script changes; never under a test runner, nor in
 * this package's own root.
 */
export function registerAppConfigFiles(nuxt: Nuxt): void {
  const rootDir = nuxt.options.rootDir
  if (nuxt.options.test || resolve(rootDir) === resolve(packageDir)) return
  const sync = async () => {
    const brand = await appBrandOf(nuxt.options as never)
    if (brand && syncBrandFile(rootDir, brand) === 'written') {
      logger.info(`Wrote ${brandFileLocation(rootDir).name}: the backend's brand follows app.config (\`backend.brand\`).`)
    }
    const labels = await appLabelsOf(nuxt.options as never)
    if (labels && syncLabelsFile(rootDir, labels) === 'written') {
      logger.info(`Wrote ${labelsFileLocation(rootDir).name}: the backend's emails and notifications follow app.config's labels (\`backend.labels\`).`)
    }
  }
  nuxt.hook('modules:done', sync)
  // In dev, again whenever a script changes: app.config itself, or a copy file it imports.
  nuxt.hook('builder:watch', async (_event, path) => {
    if (/\.[mc]?[jt]s$/.test(path) && !/\.generated\.ts$/.test(path)) await sync()
  })
}

/**
 * The path of the brand's logo when the app serves it itself (`/logo.png`),
 * without its query or fragment; `null` for no logo, or one on another
 * host. Email clients and link unfurls load it from other sites.
 */
export function brandLogoPath(logo: string | undefined): string | null {
  if (!logo || !logo.startsWith('/') || logo.startsWith('//')) return null
  const path = logo.split(/[?#]/, 1)[0]!
  return path.length > 1 ? path : null
}

/** The app's own brand logo path, read from its `app.config` files ({@link brandLogoPath}). */
export async function appBrandLogoPath(nuxt: Pick<Nuxt, 'options'>): Promise<string | null> {
  return brandLogoPath((await appBrandOf(nuxt.options as never))?.logo)
}
