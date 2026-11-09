/**
 * Writing and checking the generated brand file (src/brand-file.ts renders
 * it). The module rewrites it on every start when app.config says something
 * else, `init` scaffolds it empty, and `doctor` names a file that is
 * missing or out of date (`brand-file`).
 */
import { type BackendBrand, BRAND_FILE, renderBrandFile } from './brand-file'
import type { PreflightFinding } from './findings'
import { generatedFileFinding, generatedFileLocation, syncGeneratedFile } from './generated-file'

/** The file's location, relative to the project and absolute. */
export function brandFileLocation(rootDir: string): { name: string, path: string } {
  return generatedFileLocation(rootDir, BRAND_FILE)
}

/** Write the file when it says something other than this brand. An app without a functions directory yet gets none. */
export function syncBrandFile(rootDir: string, brand: BackendBrand): 'written' | 'unchanged' | 'no-functions-dir' {
  return syncGeneratedFile(rootDir, BRAND_FILE, renderBrandFile(brand))
}

/**
 * `doctor`'s check of the file against app config: missing, or holding
 * another brand, the emails name the app otherwise than its pages. Nothing
 * when the app has no functions directory yet.
 */
export function brandFileFinding(rootDir: string, brand: BackendBrand | null): PreflightFinding[] {
  if (!brand) return []
  return generatedFileFinding(rootDir, { id: 'brand-file', file: BRAND_FILE, text: renderBrandFile(brand), holds: 'the brand app.config declares', source: `app.config's \`backend.brand\``, consequence: 'the emails name the app otherwise than its pages' })
}
