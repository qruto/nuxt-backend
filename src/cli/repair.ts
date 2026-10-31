import { fixConvexConfig } from '../convex-config'
import { scaffoldBackendFiles } from '../scaffold'
import { appBrandOf } from '../brand-file'
import { brandFileLocation, syncBrandFile } from '../brand-sync'
import { backendPathsOf, pathsSourceOf, type PathsSource } from '../paths-file'
import { pathsFileLocation, syncPathsFile } from '../paths-sync'
import { adoptBackendDevScript } from './dev'

/**
 * `doctor --fix`'s file repairs, everything it does before it pushes env:
 * restore the scaffold files the project lacks (an existing file is never
 * overwritten), add the mounts and route groups the scaffold has and the
 * project lacks, and replace a `dev` script that stalls on a new
 * deployment, and write the paths file from nuxt.config when it says
 * something else (what the module does on its next start). `nuxt-backend upgrade` runs exactly this,
 * and the upgrade fixture runs it on an older starter. Resolves with the
 * files it wrote and the changes it made, one line each.
 */
export async function repairProjectFiles(rootDir: string, print: (line: string) => void = () => {}): Promise<{ written: string[], changes: string[] }> {
  const written = scaffoldBackendFiles(rootDir, { log: print })
  const changes = await fixConvexConfig(rootDir)
  for (const change of changes) print(`[nuxt-backend] doctor --fix: ${change}`)
  const config = await loadConfig(rootDir)
  const source = config ? pathsSourceOf(config) : null
  if (source && syncPathsFile(rootDir, backendPathsOf(source)) === 'written') {
    const line = `${pathsFileLocation(rootDir).name} → the paths nuxt.config declares`
    changes.push(line)
    print(`[nuxt-backend] doctor --fix: ${line}`)
  }
  const brand = await appBrandOf(config as Parameters<typeof appBrandOf>[0])
  if (brand && syncBrandFile(rootDir, brand) === 'written') {
    const line = `${brandFileLocation(rootDir).name} → the brand app.config declares`
    changes.push(line)
    print(`[nuxt-backend] doctor --fix: ${line}`)
  }
  const devScript = adoptBackendDevScript(rootDir, { onlyCombined: true })
  if (devScript?.changed) {
    changes.push(`scripts.dev → \`${devScript.script}\``)
    print(`[nuxt-backend] doctor --fix: scripts.dev → \`${devScript.script}\``)
  }
  return { written, changes }
}

/** The app's resolved nuxt.config, or `null` when it does not load. */
async function loadConfig(rootDir: string): Promise<{ backend?: PathsSource, modules?: unknown[] } | null> {
  try {
    const { loadNuxtConfig } = await import('@nuxt/kit')
    return await loadNuxtConfig({ cwd: rootDir }) as { backend?: PathsSource, modules?: unknown[] }
  }
  catch {
    return null
  }
}
