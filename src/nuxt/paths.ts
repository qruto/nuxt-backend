import { resolve } from 'node:path'
import type { Nuxt } from '@nuxt/schema'
import { packageDir } from '../dirs'
import { backendPathsOf, type PathsSource } from '../paths-file'
import { pathsFileLocation, syncPathsFile } from '../paths-sync'
import { logger } from './logger'

/**
 * The one path source: write the paths the backend needs (the auth route
 * and the pages its emails link to) from this config into the functions
 * directory's `paths.generated.ts`, when the file says something else. Every
 * start does it, `nuxt prepare` and `build` included, so the file the
 * backend deploys with follows nuxt.config. Never under a test runner, whose
 * fixtures are not the app's to rewrite, nor in this package's own root,
 * which `nuxt-module-build prepare` boots with no config of an app.
 */
export function registerPathsFile(options: PathsSource, nuxt: Nuxt): void {
  const rootDir = nuxt.options.rootDir
  if (nuxt.options.test || resolve(rootDir) === resolve(packageDir)) return
  if (syncPathsFile(rootDir, backendPathsOf(options)) === 'written') {
    logger.info(`Wrote ${pathsFileLocation(rootDir).name}: the backend's paths follow nuxt.config (\`backend.authRoute\`, \`backend.pages\`).`)
  }
}
