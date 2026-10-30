/**
 * Writing and checking the generated paths file (src/paths-file.ts renders
 * it). The module rewrites the file on every start (`nuxt prepare`, `dev`,
 * `build`) when nuxt.config says something else; `init` and `dev` scaffold
 * it with the defaults before the module has run, and `doctor` names a file
 * that is missing or says something other than nuxt.config, and a backend
 * file that does not pass it on (`paths-file`).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { readTextIfPresent } from './source-text'
import { join } from 'node:path'
import { BACKEND_PATH_KEYS, DEFAULT_BACKEND_PATHS, type BackendPaths } from './convex/paths'
import { finding, type PreflightFinding } from './findings'
import { backendPathsOf, parsePathsFile, pathOption, PATHS_FILE, renderPathsFile, type PathsSource } from './paths-file'
import { resolveFunctionsDir } from './scaffold'

/** The file's location, relative to the project and absolute. */
export function pathsFileLocation(rootDir: string): { name: string, path: string } {
  const functionsDir = resolveFunctionsDir(rootDir)
  return { name: `${functionsDir}/${PATHS_FILE}`, path: join(rootDir, functionsDir, PATHS_FILE) }
}

/**
 * Write the file when it says something other than these paths. An app
 * without a functions directory yet gets none: `init` or `dev` scaffolds it.
 */
export function syncPathsFile(rootDir: string, paths: BackendPaths): 'written' | 'unchanged' | 'no-functions-dir' {
  const { path } = pathsFileLocation(rootDir)
  if (!existsSync(join(path, '..'))) return 'no-functions-dir'
  const text = renderPathsFile(paths)
  if (readTextIfPresent(path) === text) return 'unchanged'
  writeFileSync(path, text)
  return 'written'
}

/** The keys whose paths differ, each as `key: file → config`. */
function differences(held: Partial<BackendPaths>, wanted: BackendPaths): string[] {
  return BACKEND_PATH_KEYS.filter(key => held[key] !== wanted[key]).map(key => `${key} is ${held[key] === undefined ? 'missing' : held[key]}, and ${pathOption(key)} says ${wanted[key]}`)
}

/**
 * The backend files that pass the paths on, with the paths their helper
 * reads: `defineBackendAuthConfig` the JWKS route, `setupAuth` the auth
 * routes and its emails' pages, `setupAccount` the keep-account page,
 * `setupWaitlist` the sign-in page, and `setupAccess` the sign-in and
 * privacy pages its invitation email links to.
 */
const PATH_READERS: ReadonlyArray<{ file: string, keys: ReadonlyArray<keyof BackendPaths> }> = [
  { file: 'auth.config.ts', keys: ['authRoute'] },
  { file: 'auth.ts', keys: ['authRoute', 'acceptInvitation', 'security', 'waitlist'] },
  { file: 'account.ts', keys: ['keepAccount'] },
  { file: 'waitlist.ts', keys: ['login'] },
  { file: 'access.ts', keys: ['login', 'privacy'] },
]

/** An import of the paths file, however the specifier ends. */
const IMPORTS_PATHS_FILE = /from\s+['"][^'"]*paths\.generated(?:\.[jt]s)?['"]/

/**
 * The backend files that do not import the paths file while nuxt.config
 * moves a path their helper reads: each still uses the default, so the auth
 * route or an email's link points where nothing is. An 0.1 `auth.config.ts`
 * (`export { default } from 'nuxt-backend/auth.config'`) is one.
 */
function unreadPaths(functionsDir: string, wanted: BackendPaths): string[] {
  return PATH_READERS.flatMap(({ file, keys }) => {
    const path = join(functionsDir, file)
    if (!existsSync(path) || IMPORTS_PATHS_FILE.test(readFileSync(path, 'utf-8'))) return []
    const moved = keys.filter(key => wanted[key] !== DEFAULT_BACKEND_PATHS[key])
    return moved.length === 0 ? [] : [`${file} does not pass the paths on, so it uses ${moved.map(key => `${key} ${DEFAULT_BACKEND_PATHS[key]} where ${pathOption(key)} says ${wanted[key]}`).join(', ')}`]
  })
}

/**
 * `doctor`'s check of the file against nuxt.config: missing, or holding other
 * paths, the backend links to pages that are not there; and of the backend
 * files that should pass it on. Nothing when the app has no functions
 * directory yet, or nuxt.config did not load.
 */
export function pathsFileFinding(rootDir: string, source: PathsSource | null): PreflightFinding[] {
  if (!source) return []
  const { name, path } = pathsFileLocation(rootDir)
  const functionsDir = join(path, '..')
  if (!existsSync(functionsDir)) return []
  const wanted = backendPathsOf(source)
  const problems: string[] = []
  const fixes: string[] = []
  const changed = existsSync(path) ? differences(parsePathsFile(readFileSync(path, 'utf-8')), wanted) : []
  if (!existsSync(path)) problems.push(`${name} is missing: the backend links to every page at its default path, whatever nuxt.config moves.`)
  else if (changed.length > 0) problems.push(`${name} is out of date with nuxt.config: ${changed.join('; ')}.`)
  if (problems.length > 0) fixes.push('Run: npx nuxt-backend doctor --fix (or any `nuxt prepare`, `dev` or `build`), and deploy the functions.')
  const unread = unreadPaths(functionsDir, wanted)
  if (unread.length > 0) {
    problems.push(`${unread.join('; ')}.`)
    fixes.push(`Import { paths } from './paths.generated' and pass it on as the scaffold does (defineBackendAuthConfig({ paths }), setupAuth, setupAccount and setupWaitlist take \`paths\`), then deploy the functions.`)
  }
  if (problems.length === 0) return [finding('paths-file', 'pass', `${name} carries the paths nuxt.config declares.`)]
  return [finding('paths-file', 'warn', problems.join(' '), fixes.join(' '))]
}
