import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Nuxt } from '@nuxt/schema'
import { resolveFunctionsDir } from '../aliases'

/**
 * Whether the app defines a job queue: `defineJobQueue` in the functions
 * directory's `jobs.ts`, where the queue's functions are exported and run by
 * name. Read once at build.
 */
export function definesJobQueue(rootDir: string): boolean {
  const file = join(rootDir, resolveFunctionsDir(rootDir), 'jobs.ts')
  return existsSync(file) && readFileSync(file, 'utf8').includes('defineJobQueue')
}

/** Publish whether the app has a job queue: the admin console's Queue tab shows only then. */
export function registerJobs(nuxt: Nuxt): void {
  const runtimeConfig = nuxt.options.runtimeConfig
  runtimeConfig.public.backend = {
    ...(runtimeConfig.public.backend as Record<string, unknown> | undefined),
    jobs: definesJobQueue(nuxt.options.rootDir),
  } as unknown as typeof runtimeConfig.public.backend
}
