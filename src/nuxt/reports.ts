import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Nuxt } from '@nuxt/schema'
import { resolveFunctionsDir } from '../aliases'

/** `setupAdmin(components, { … reports: { … } })`: the option, as the source names it. */
const REPORTS_OPTION = /\breports\s*:\s*\{/

/**
 * Whether the app turns content duties on: `reports` passed to `setupAdmin`
 * in the functions directory's `admin.ts`, which exports the Reports tab's
 * functions. Read once at build.
 */
export function definesReports(rootDir: string): boolean {
  const file = join(rootDir, resolveFunctionsDir(rootDir), 'admin.ts')
  if (!existsSync(file)) return false
  const code = readFileSync(file, 'utf8')
  return code.includes('setupAdmin') && REPORTS_OPTION.test(code)
}

/** Publish whether the app has content duties on: the admin console shows its Reports tab only then. */
export function registerReports(nuxt: Nuxt): void {
  const runtimeConfig = nuxt.options.runtimeConfig
  runtimeConfig.public.backend = {
    ...(runtimeConfig.public.backend as Record<string, unknown> | undefined),
    reports: definesReports(nuxt.options.rootDir),
  } as unknown as typeof runtimeConfig.public.backend
}
