import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BACKEND_FILE_TEMPLATES } from './templates'

const DEFAULT_FUNCTIONS_DIR = 'backend'
const STANDARD_FUNCTIONS_DIR = 'convex'

/**
 * Auto-scaffold the minimum backend files if they don't exist.
 */
export function scaffoldBackendFiles(rootDir: string) {
  const functionsDir = resolveFunctionsDir(rootDir)
  const functionsDirPath = join(rootDir, functionsDir)
  const convexJsonPath = join(rootDir, 'convex.json')

  if (!existsSync(functionsDirPath)) {
    mkdirSync(functionsDirPath, { recursive: true })
    console.log(`[nuxt-backend] Created ${functionsDir}/ directory`)
  }

  for (const [file, contents] of Object.entries(BACKEND_FILE_TEMPLATES)) {
    const targetPath = join(functionsDirPath, file)
    if (!existsSync(targetPath)) {
      writeFileSync(targetPath, contents)
      console.log(`[nuxt-backend] Created ${functionsDir}/${file}`)
    }
  }

  if (functionsDir !== STANDARD_FUNCTIONS_DIR && !existsSync(convexJsonPath)) {
    writeFileSync(convexJsonPath, `${JSON.stringify({ functions: `${functionsDir}/` }, null, 2)}\n`)
    console.log('[nuxt-backend] Created convex.json')
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
