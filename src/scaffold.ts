import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { getBackendFileTemplates, type BackendTemplateOptions } from './templates'

const DEFAULT_FUNCTIONS_DIR = 'backend'
const STANDARD_FUNCTIONS_DIR = 'convex'

export interface ScaffoldOptions extends BackendTemplateOptions {
  /** Only scaffold these template files (e.g. `['billing.ts']`). Default: all. */
  files?: string[]
  /** Overwrite existing files. Default `false` (existing files are never touched). */
  force?: boolean
  /** Log sink for created-file messages. Default `console.log`. */
  log?: (message: string) => void
}

/**
 * Scaffold the backend files that don't exist yet (idempotent). Used by the
 * module's first-run auto-scaffold and by the CLI's `init` / `add` commands.
 */
export function scaffoldBackendFiles(rootDir: string, options: ScaffoldOptions = {}) {
  const log = options.log ?? console.log
  const functionsDir = resolveFunctionsDir(rootDir)
  const functionsDirPath = join(rootDir, functionsDir)
  const convexJsonPath = join(rootDir, 'convex.json')

  if (!existsSync(functionsDirPath)) {
    mkdirSync(functionsDirPath, { recursive: true })
    log(`[nuxt-backend] Created ${functionsDir}/ directory`)
  }

  const templates = Object.entries(getBackendFileTemplates(options))
    .filter(([file]) => !options.files || options.files.includes(file))

  for (const [file, contents] of templates) {
    if (writeUnlessPresent(join(functionsDirPath, file), contents, options.force)) {
      log(`[nuxt-backend] Created ${functionsDir}/${file}`)
    }
  }

  if (!options.files && functionsDir !== STANDARD_FUNCTIONS_DIR) {
    const convexJson = `${JSON.stringify({ functions: `${functionsDir}/` }, null, 2)}\n`
    if (writeUnlessPresent(convexJsonPath, convexJson)) {
      log('[nuxt-backend] Created convex.json')
    }
  }
}

/**
 * One exclusive create (`wx`) instead of exists-then-write, so a file that
 * appears between the two — another `init`, the app's own `convex dev` — is
 * kept rather than overwritten. Returns whether the file was written.
 */
function writeUnlessPresent(path: string, contents: string, force = false): boolean {
  mkdirSync(dirname(path), { recursive: true })
  try {
    writeFileSync(path, contents, { flag: force ? 'w' : 'wx' })
    return true
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw error
  }
}

export function resolveFunctionsDir(rootDir: string) {
  const convexJsonPath = join(rootDir, 'convex.json')
  const configuredFunctionsDir = readFunctionsDirFromConvexJson(convexJsonPath)
  if (configuredFunctionsDir) {
    return configuredFunctionsDir
  }

  if (existsSync(join(rootDir, DEFAULT_FUNCTIONS_DIR))) {
    return DEFAULT_FUNCTIONS_DIR
  }

  if (existsSync(join(rootDir, STANDARD_FUNCTIONS_DIR))) {
    return STANDARD_FUNCTIONS_DIR
  }

  return DEFAULT_FUNCTIONS_DIR
}

function readFunctionsDirFromConvexJson(convexJsonPath: string) {
  if (!existsSync(convexJsonPath)) {
    return
  }

  try {
    const convexJson = JSON.parse(readFileSync(convexJsonPath, 'utf-8')) as { functions?: unknown }
    if (typeof convexJson.functions !== 'string') {
      return
    }

    const normalizedFunctionsDir = normalizeFunctionsDir(convexJson.functions)
    return normalizedFunctionsDir || undefined
  }
  catch (error) {
    console.warn(`[nuxt-backend] Failed to parse convex.json: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function normalizeFunctionsDir(functionsDir: string) {
  const normalized = functionsDir
    .replace(/^\.?\//, '')
    .replace(/\/+$/, '')
  return normalized || undefined
}
