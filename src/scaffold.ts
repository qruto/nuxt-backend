import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, type Dirent } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { BACKEND_FILE_TEMPLATES, DEFAULT_INDEX_PAGE_TEMPLATE, DEFAULT_LAYOUT_TEMPLATE } from './templates'

const DEFAULT_FUNCTIONS_DIR = 'backend'
const STANDARD_FUNCTIONS_DIR = 'convex'

export interface ScaffoldOptions {
  /** Only scaffold these template files (e.g. `['billing.ts']`). Default: all. */
  files?: string[]
  /** Overwrite existing files. Default `false` (existing files are never touched). */
  force?: boolean
  /** Log sink for created-file messages. Default `console.log`. */
  log?: (message: string) => void
}

/**
 * Scaffold the backend files that don't exist yet (idempotent). Used by the
 * module's first-run auto-scaffold and by the CLI's `init`, `dev` and `doctor --fix`.
 * Returns the files it wrote, relative to `rootDir`.
 */
export function scaffoldBackendFiles(rootDir: string, options: ScaffoldOptions = {}): string[] {
  const log = options.log ?? console.log
  const functionsDir = resolveFunctionsDir(rootDir)
  const functionsDirPath = join(rootDir, functionsDir)
  const convexJsonPath = join(rootDir, 'convex.json')
  const written: string[] = []

  if (!existsSync(functionsDirPath)) {
    mkdirSync(functionsDirPath, { recursive: true })
    log(`[nuxt-backend] Created ${functionsDir}/ directory`)
  }

  const templates = Object.entries(BACKEND_FILE_TEMPLATES)
    .filter(([file]) => !options.files || options.files.includes(file))

  for (const [file, contents] of templates) {
    if (writeUnlessPresent(join(functionsDirPath, file), contents, options.force)) {
      written.push(`${functionsDir}/${file}`)
      log(`[nuxt-backend] Created ${functionsDir}/${file}`)
    }
  }

  if (!options.files && functionsDir !== STANDARD_FUNCTIONS_DIR) {
    const convexJson = `${JSON.stringify({ functions: `${functionsDir}/` }, null, 2)}\n`
    if (writeUnlessPresent(convexJsonPath, convexJson)) {
      written.push('convex.json')
      log('[nuxt-backend] Created convex.json')
    }
  }
  return written
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

/**
 * Where the app's root component lives, if it exists: Nuxt 4's `app/app.vue`
 * first, then the legacy root `app.vue`. `name` is the posix-relative form
 * for messages; `path` is the file.
 */
export function resolveAppComponent(rootDir: string): { name: string, path: string } | undefined {
  return ['app/app.vue', 'app.vue']
    .map(name => ({ name, path: join(rootDir, name) }))
    .find(({ path }) => existsSync(path))
}

/**
 * Whether the app's root component is still the `create nuxt` starter: it
 * renders `<NuxtWelcome />` and no `<NuxtPage />`, so every page this module
 * registers (`/login`, `/pricing`, …) resolves but never renders.
 */
export function appComponentIsStarter(rootDir: string): boolean {
  const component = resolveAppComponent(rootDir)
  if (!component) return false
  const source = readFileSync(component.path, 'utf-8')
  return source.includes('<NuxtWelcome') && !source.includes('<NuxtPage')
}

/**
 * Put the router outlet into the starter root component: `<NuxtWelcome />`
 * becomes `<NuxtLayout><NuxtPage /></NuxtLayout>`, so the pages render inside
 * the app's layout; everything else (the route announcer, the wrapper) stays.
 * A root component the user has already touched is left alone. Returns the
 * rewritten file's name, relative to `rootDir`, or `undefined`.
 */
export function mountPagesInAppComponent(rootDir: string): string | undefined {
  if (!appComponentIsStarter(rootDir)) return undefined
  const { name, path } = resolveAppComponent(rootDir)!
  const source = readFileSync(path, 'utf-8')
  writeFileSync(path, source.replace(/^([ \t]*)<NuxtWelcome\s*\/>/m, (_match, indent: string) => `${indent}<NuxtLayout>\n${indent}  <NuxtPage />\n${indent}</NuxtLayout>`))
  return name
}

/**
 * Write the app's default layout, `<AppShell>` around the page, when the root
 * component renders `<NuxtLayout>` and the app has no layout at all: the
 * frame of the starter, restored if it went missing. A layout the app has
 * (any `.vue` file in its `layouts/` folder) is never touched or replaced.
 * Returns the file's path relative to `rootDir`, or `undefined`.
 */
export function ensureDefaultLayout(rootDir: string): string | undefined {
  const component = resolveAppComponent(rootDir)
  if (!component) return undefined
  const source = readFileSync(component.path, 'utf-8')
  if (!source.includes('<NuxtLayout') || !source.includes('<NuxtPage')) return undefined
  const folder = join(dirname(component.path), 'layouts')
  if (existsSync(folder) && readdirSync(folder).some(file => file.endsWith('.vue'))) return undefined
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'default.vue'), DEFAULT_LAYOUT_TEMPLATE)
  return join(dirname(component.name), 'layouts/default.vue').replace(/\\/g, '/').replace(/^\.\//, '')
}

/** A page file the router matches `/` with: `index`, an optional parameter (`[[slug]]`) or a catch-all (`[...slug]`). */
const ROOT_PAGE_FILE = /^(?:index|\[\[[^\]]+\]\]|\[\.\.\.[^\]]+\])\.(?:vue|[cm]?[jt]sx?)$/

/** A pages folder that adds no segment the path must have: `index/`, a route group, an optional parameter, a catch-all. */
const ROOT_PAGE_FOLDER = /^(?:index|\(.+\)|\[\[[^\]]+\]\]|\[\.\.\.[^\]]+\])$/

/**
 * Whether the pages folder `dir` holds a page the router matches `/` with:
 * an `index` page, an optional parameter (`[[slug]].vue`) or a catch-all
 * (`[...slug].vue`), at its top or inside folders that add no required
 * segment (`index/`, `(marketing)/`, `[[locale]]/`).
 */
function pagesServeRoot(dir: string): boolean {
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  }
  catch {
    return false
  }
  return entries.some(entry => entry.isDirectory()
    ? ROOT_PAGE_FOLDER.test(entry.name) && pagesServeRoot(join(dir, entry.name))
    : ROOT_PAGE_FILE.test(entry.name))
}

/** What `nuxt.config` says about where pages live, read from its source, and whether it extends a layer. */
interface PagesConfig {
  srcDir?: string
  pages?: string
  extendsLayer: boolean
}

/**
 * The options `nuxt.config` spells as string literals that move the pages
 * folder (`srcDir`, `dir.pages`), and whether it names an `extends`: read
 * from the source, without running it, so a computed value reads as unset.
 */
function readPagesConfig(rootDir: string): PagesConfig {
  const path = ['nuxt.config.ts', 'nuxt.config.js', 'nuxt.config.mjs', 'nuxt.config.mts'].map(name => join(rootDir, name)).find(existsSync)
  const source = path ? readFileSync(path, 'utf-8') : ''
  return {
    srcDir: /\bsrcDir\s*:\s*(['"`])([^'"`$]+)\1/.exec(source)?.[2],
    pages: /\bdir\s*:\s*\{[^}]*?\bpages\s*:\s*(['"`])([^'"`$]+)\1/.exec(source)?.[2],
    extendsLayer: /\bextends\s*:/.test(source),
  }
}

/** The pages folders of the layers in `layers/`, which Nuxt registers on its own. */
function localLayerPages(rootDir: string): string[] {
  const layers = join(rootDir, 'layers')
  if (!existsSync(layers)) return []
  return readdirSync(layers, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .flatMap(entry => [join(layers, entry.name, 'app/pages'), join(layers, entry.name, 'pages')])
}

/**
 * Write the app's home page, `pages/index.vue` in its pages folder, when the
 * root component renders `<NuxtPage />` and nothing answers `/`: no page in
 * `app/pages/`, `pages/`, the folder `nuxt.config` declares (`srcDir`,
 * `dir.pages`) or a local layer matches it. The module's pages turn the
 * router on, and without such a page `/` is a 404. An app that extends a
 * layer gets none, since the layer may serve `/`. Never written over a
 * file. Returns its path relative to `rootDir`, or `undefined`.
 */
export function ensureIndexPage(rootDir: string): string | undefined {
  const component = resolveAppComponent(rootDir)
  if (!component || !readFileSync(component.path, 'utf-8').includes('<NuxtPage')) return undefined
  const config = readPagesConfig(rootDir)
  if (config.extendsLayer) return undefined
  const pagesDir = resolve(rootDir, config.srcDir ?? dirname(component.name), config.pages ?? 'pages')
  const folders = [pagesDir, join(rootDir, 'app/pages'), join(rootDir, 'pages'), ...localLayerPages(rootDir)]
  if (folders.some(pagesServeRoot)) return undefined
  const page = join(pagesDir, 'index.vue')
  return writeUnlessPresent(page, DEFAULT_INDEX_PAGE_TEMPLATE) ? relative(rootDir, page).replace(/\\/g, '/') : undefined
}
