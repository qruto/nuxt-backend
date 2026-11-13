import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, type Dirent } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { readTextIfPresent } from './source-text'
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

/** The names `nuxt.config` takes, in the order Nuxt looks for them. */
const NUXT_CONFIG_FILES = ['nuxt.config.ts', 'nuxt.config.js', 'nuxt.config.mjs', 'nuxt.config.mts']

/** What a `nuxt.config` says about where the source and the pages live, and whether it extends a layer. */
interface SourceConfig {
  srcDir?: string
  pages?: string
  extendsLayer: boolean
}

/** `code` with its comments blanked out; strings and template literals stay as written. */
const withoutComments = (code: string) =>
  code.replace(/(["'`])(?:\\[\s\S]|(?!\1)[^\\])*\1|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, match => match.startsWith('/') ? ' ' : match)

/** The index of the quote that closes the string opening at `code[open]`; past the end when none does. */
function closingQuote(code: string, open: number): number {
  let at = open + 1
  while (at < code.length && code[at] !== code[open]) at += code[at] === '\\' ? 2 : 1
  return at
}

/**
 * The properties of the object literal that opens at `code[open]`, by key,
 * each value as written: a nested object, array or call stays whole, so only
 * this object's own keys are found. Spreads and shorthands have no value
 * written: a spread is kept under the key `...`, since it may set any key.
 */
function objectProperties(code: string, open: number): Map<string, string> {
  const properties = new Map<string, string>()
  const add = (entry: string) => {
    if (entry.trim().startsWith('...')) properties.set('...', entry.trim())
    const match = /^(?:(["'])([^"']+)\1|([\w$]+))\s*:([\s\S]*)$/.exec(entry.trim())
    if (match) properties.set(match[2] ?? match[3]!, match[4]!.trim())
  }
  let depth = 0
  let start = open + 1
  for (let at = open; at < code.length; at++) {
    const char = code[at]!
    if ('"\'`'.includes(char)) {
      at = closingQuote(code, at)
    }
    else if ('{[('.includes(char)) {
      depth++
    }
    else if ('}])'.includes(char) && --depth === 0) {
      add(code.slice(start, at))
      break
    }
    else if (char === ',' && depth === 1) {
      add(code.slice(start, at))
      start = at + 1
    }
  }
  return properties
}

/** A value written as a plain string literal; a computed one reads as unset. */
const stringValue = (value: string | undefined) => /^(["'`])([^"'`$\\]+)\1$/.exec(value ?? '')?.[2]

/**
 * The options of `dir`'s `nuxt.config` that move its source and its pages
 * (`srcDir`, `dir.pages`), and whether it names an `extends`: read from the
 * object `defineNuxtConfig` is given, without running it, so a comment, a key
 * of a nested option and a computed value all read as unset. A config this
 * cannot read whole, a spread (`...base`) or no object literal at all, may
 * extend a layer, and counts as one that does.
 */
function readSourceConfig(dir: string): SourceConfig {
  const source = NUXT_CONFIG_FILES.map(name => readTextIfPresent(join(dir, name))).find(text => text !== undefined) ?? ''
  const code = withoutComments(source)
  const open = /\bdefineNuxtConfig\s*\(\s*\{|\bexport\s+default\s*\{/.exec(code)
  const config = open ? objectProperties(code, open.index + open[0].length - 1) : new Map<string, string>()
  const folders = config.get('dir')
  const unread = code.trim() !== '' && (!open || config.has('...'))
  return {
    srcDir: stringValue(config.get('srcDir')),
    pages: folders?.startsWith('{') ? stringValue(objectProperties(folders, 0).get('pages')) : undefined,
    extendsLayer: unread || config.has('extends'),
  }
}

/**
 * The folder Nuxt takes `dir`'s source from: the `srcDir` its `nuxt.config`
 * sets, else Nuxt's default, `app/`, unless that holds nothing while `dir`
 * itself holds the app (an `app.vue`, or a `pages/`, `layouts/`, … folder).
 */
function sourceDir(dir: string, config = readSourceConfig(dir)): string {
  if (config.srcDir) return resolve(dir, config.srcDir)
  const app = join(dir, 'app')
  let files: string[]
  try {
    files = readdirSync(app)
  }
  catch {
    return dir
  }
  if (files.some(file => file !== 'spa-loading-template.html' && !file.startsWith('router.options'))) return app
  const legacy = ['app.vue', 'App.vue', 'assets', 'layouts', 'middleware', config.pages ?? 'pages', 'plugins']
  return legacy.some(name => existsSync(resolve(dir, name))) ? dir : app
}

/** The pages folder Nuxt reads for the app or layer in `dir`: `dir.pages` (default `pages/`) in its source folder. */
function pagesDir(dir: string, config = readSourceConfig(dir)): string {
  return resolve(sourceDir(dir, config), config.pages ?? 'pages')
}

/**
 * Where the app's root component lives, if it exists: `app.vue` in the
 * folder Nuxt takes the source from (`app/` in Nuxt 4, the root in an app
 * laid out for Nuxt 3, or the `srcDir` that `nuxt.config` sets). `name` is
 * the posix-relative form for messages; `path` is the file.
 */
export function resolveAppComponent(rootDir: string): { name: string, path: string } | undefined {
  const folder = sourceDir(rootDir)
  return ['app.vue', 'App.vue']
    .map(file => join(folder, file))
    .filter(existsSync)
    .map(path => ({ name: relative(rootDir, path).replace(/\\/g, '/'), path }))[0]
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

/**
 * A page file the router matches `/` with: `index`, an optional parameter
 * (`[[slug]]`) or a catch-all (`[...slug]`), a client-only or server-only
 * page (`index.client.vue`) included.
 */
const ROOT_PAGE_FILE = /^(?:index|\[\[[^\]]+\]\]|\[\.\.\.[^\]]+\])(?:\.(?:client|server))?\.(?:vue|[cm]?[jt]sx?)$/

/** A pages folder that adds no segment the path must have: `index/`, a route group, an optional parameter, a catch-all. */
const ROOT_PAGE_FOLDER = /^(?:index|\(.+\)|\[\[[^\]]+\]\]|\[\.\.\.[^\]]+\])$/

/** A file Nuxt makes a page of. */
const PAGE_FILE = /\.(?:vue|[cm]?[jt]sx?)$/

/** `code` with the inside of every string and template literal blanked out, so each offset still points where it did. */
const withoutStrings = (code: string) =>
  code.replace(/(["'`])(?:\\[\s\S]|(?!\1)[^\\])*\1/g, match => `${match[0]}${' '.repeat(match.length - 2)}${match[0]}`)

/**
 * Whether the page file at `path` moves itself to `/` with
 * `definePageMeta({ path: '/' })`, which Nuxt reads from its script. The
 * call is looked for in the code alone, so one quoted in a string or a
 * comment does not count.
 */
function declaresRootPath(path: string): boolean {
  const source = readTextIfPresent(path) ?? ''
  const script = path.endsWith('.vue') ? [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\b[^>]*>/gi)].map(match => match[1]).join('\n') : source
  const code = withoutComments(script)
  const call = /\bdefinePageMeta\s*\(\s*\{/.exec(withoutStrings(code))
  return call !== null && stringValue(objectProperties(code, call.index + call[0].length - 1).get('path')) === '/'
}

/**
 * Whether the pages folder `dir` holds a page the router matches `/` with:
 * an `index` page, an optional parameter (`[[slug]].vue`) or a catch-all
 * (`[...slug].vue`), at its top or inside folders that add no required
 * segment (`index/`, `(marketing)/`, `[[locale]]/`), or a page anywhere
 * in it that `definePageMeta` gives the path `/`.
 */
function pagesServeRoot(dir: string, atRoot = true): boolean {
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  }
  catch {
    return false
  }
  return entries.some((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return pagesServeRoot(path, atRoot && ROOT_PAGE_FOLDER.test(entry.name))
    return (atRoot && ROOT_PAGE_FILE.test(entry.name)) || (PAGE_FILE.test(entry.name) && declaresRootPath(path))
  })
}

/** The pages folders Nuxt reads for the layers in `layers/`, which it registers on its own. */
function localLayerPages(rootDir: string): string[] {
  const layers = join(rootDir, 'layers')
  if (!existsSync(layers)) return []
  return readdirSync(layers, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => pagesDir(join(layers, entry.name)))
}

/**
 * Write the app's home page, `index.vue` in its pages folder, when the root
 * component renders `<NuxtPage />` and nothing answers `/`: no page in the
 * pages folder Nuxt reads (in the `srcDir`, under the `dir.pages` name
 * `nuxt.config` sets) or in a local layer's matches it, by its file name or
 * by the `path` its `definePageMeta` sets. Routes added another way
 * (`router.options`, the `pages:extend` hook) are not seen. A pages folder Nuxt
 * does not read, such as a root `pages/` beside `app/`, counts for nothing.
 * The module's pages turn the router on, and without such a page `/` is a
 * 404. An app that extends a layer gets none, since the layer may serve `/`.
 * Never written over a file. Returns its path relative to `rootDir`, or
 * `undefined`.
 */
export function ensureIndexPage(rootDir: string): string | undefined {
  const component = resolveAppComponent(rootDir)
  if (!component || !readFileSync(component.path, 'utf-8').includes('<NuxtPage')) return undefined
  const config = readSourceConfig(rootDir)
  if (config.extendsLayer) return undefined
  const pages = pagesDir(rootDir, config)
  if ([pages, ...localLayerPages(rootDir)].some(folder => pagesServeRoot(folder))) return undefined
  const page = join(pages, 'index.vue')
  return writeUnlessPresent(page, DEFAULT_INDEX_PAGE_TEMPLATE) ? relative(rootDir, page).replace(/\\/g, '/') : undefined
}
