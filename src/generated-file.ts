/**
 * The files the module writes into the functions directory from the app's
 * config (`brand.generated.ts`, `labels.generated.ts`): where each one is,
 * and writing it only when its text changes, so a start that finds it
 * current touches nothing and the dev server reloads nothing.
 */
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { finding, type FindingId, type PreflightFinding } from './findings'
import { resolveFunctionsDir } from './scaffold'
import { readTextIfPresent } from './source-text'

/** A generated file's location in the functions directory, relative to the project and absolute. */
export function generatedFileLocation(rootDir: string, file: string): { name: string, path: string } {
  const functionsDir = resolveFunctionsDir(rootDir)
  return { name: `${functionsDir}/${file}`, path: join(rootDir, functionsDir, file) }
}

/** Write a generated file when it holds other text. An app without a functions directory yet gets none. */
export function syncGeneratedFile(rootDir: string, file: string, text: string): 'written' | 'unchanged' | 'no-functions-dir' {
  const { path } = generatedFileLocation(rootDir, file)
  if (!existsSync(join(path, '..'))) return 'no-functions-dir'
  if (readTextIfPresent(path) === text) return 'unchanged'
  writeFileSync(path, text)
  return 'written'
}

/** Whether a generated file is missing (`missing`), holds other text (`stale`) or this text (`current`); `null` before there is a functions directory. */
export function generatedFileState(rootDir: string, file: string, text: string): 'missing' | 'stale' | 'current' | null {
  const { path } = generatedFileLocation(rootDir, file)
  if (!existsSync(join(path, '..'))) return null
  const found = readTextIfPresent(path)
  return found === undefined ? 'missing' : found === text ? 'current' : 'stale'
}

/**
 * `doctor`'s check of a generated file against the config it comes from:
 * a pass when it holds `text`, else a warning that it is missing or out of
 * date, with what that leaves wrong. Nothing before there is a functions
 * directory.
 */
export function generatedFileFinding(rootDir: string, check: { id: FindingId, file: string, text: string, holds: string, source: string, consequence: string }): PreflightFinding[] {
  const state = generatedFileState(rootDir, check.file, check.text)
  if (state === null) return []
  const { name } = generatedFileLocation(rootDir, check.file)
  if (state === 'current') return [finding(check.id, 'pass', `${name} carries ${check.holds}.`)]
  const problem = state === 'stale' ? `${name} is out of date with ${check.source}` : `${name} is missing`
  return [finding(check.id, 'warn', `${problem}: ${check.consequence}.`, 'Run: npx nuxt-backend doctor --fix (or any `nuxt prepare`, `dev` or `build`), and deploy the functions.')]
}
