/**
 * Writing and checking the generated brand file (src/brand-file.ts renders
 * it). The module rewrites it on every start when app.config says something
 * else, `init` scaffolds it empty, and `doctor` names a file that is
 * missing or out of date (`brand-file`).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type BackendBrand, BRAND_FILE, renderBrandFile } from './brand-file'
import { finding, type PreflightFinding } from './findings'
import { resolveFunctionsDir } from './scaffold'

/** The file's location, relative to the project and absolute. */
export function brandFileLocation(rootDir: string): { name: string, path: string } {
  const functionsDir = resolveFunctionsDir(rootDir)
  return { name: `${functionsDir}/${BRAND_FILE}`, path: join(rootDir, functionsDir, BRAND_FILE) }
}

/** Write the file when it says something other than this brand. An app without a functions directory yet gets none. */
export function syncBrandFile(rootDir: string, brand: BackendBrand): 'written' | 'unchanged' | 'no-functions-dir' {
  const { path } = brandFileLocation(rootDir)
  if (!existsSync(join(path, '..'))) return 'no-functions-dir'
  const text = renderBrandFile(brand)
  if (existsSync(path) && readFileSync(path, 'utf-8') === text) return 'unchanged'
  writeFileSync(path, text)
  return 'written'
}

/**
 * `doctor`'s check of the file against app config: missing, or holding
 * another brand, the emails name the app otherwise than its pages. Nothing
 * when the app has no functions directory yet.
 */
export function brandFileFinding(rootDir: string, brand: BackendBrand | null): PreflightFinding[] {
  if (!brand) return []
  const { name, path } = brandFileLocation(rootDir)
  if (!existsSync(join(path, '..'))) return []
  if (existsSync(path) && readFileSync(path, 'utf-8') === renderBrandFile(brand)) return [finding('brand-file', 'pass', `${name} carries the brand app.config declares.`)]
  const problem = existsSync(path) ? `${name} is out of date with app.config's \`backend.brand\`` : `${name} is missing`
  return [finding('brand-file', 'warn', `${problem}: the emails name the app otherwise than its pages.`, 'Run: npx nuxt-backend doctor --fix (or any `nuxt prepare`, `dev` or `build`), and deploy the functions.')]
}
