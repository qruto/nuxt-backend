import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { packageDir } from './dirs'
import { finding, type PreflightFinding } from './findings'

// doctor's `name-collisions`: the app's own components and composables that
// share a name with one the package (or the Convex module under it)
// registers. A same-named component is how an app swaps a part, so the
// finding only informs, and never warns.

/** The names the installed package registers, as its agent skill's surface manifest lists them. */
export interface PackageNames {
  components: ReadonlySet<string>
  composables: ReadonlySet<string>
}

interface SurfaceManifest {
  autoImports?: {
    components?: string[]
    composables?: string[]
    parts?: string[]
    baseModule?: { components?: string[], composables?: string[] }
  }
}

/** The package's registered names, its parts among the components, from `skills/nuxt-backend/references/surface.json`; empty when it cannot be read. */
export function packageNames(manifestPath = join(packageDir, 'skills/nuxt-backend/references/surface.json')): PackageNames {
  try {
    const { autoImports = {} } = JSON.parse(readFileSync(manifestPath, 'utf8')) as SurfaceManifest
    return {
      components: new Set([...autoImports.components ?? [], ...autoImports.parts ?? [], ...autoImports.baseModule?.components ?? []]),
      composables: new Set([...autoImports.composables ?? [], ...autoImports.baseModule?.composables ?? []]),
    }
  }
  catch {
    return { components: new Set(), composables: new Set() }
  }
}

/** Every file under `dir` with one of `extensions`, as paths relative to it. */
function filesUnder(dir: string, extensions: RegExp, depth = Number.POSITIVE_INFINITY): string[] {
  if (!existsSync(dir)) return []
  const walk = (current: string, level: number): string[] => readdirSync(current).flatMap((entry) => {
    const path = join(current, entry)
    if (statSync(path).isDirectory()) return level < depth ? walk(path, level + 1) : []
    return extensions.test(entry) ? [relative(dir, path)] : []
  })
  return walk(dir, 0)
}

const pascal = (segment: string) => segment.split(/[-_.]/).filter(Boolean).map(part => part[0]!.toUpperCase() + part.slice(1)).join('')

/**
 * The name Nuxt registers a component file under: its path segments in
 * PascalCase, `index` dropped, a mode suffix (`.client`, `.server`) dropped,
 * and a segment the next one already starts with dropped (`auth/AuthForm.vue`
 * is `AuthForm`).
 */
export function componentName(file: string): string {
  const segments = file.replace(/\\/g, '/').replace(/\.vue$/, '').replace(/\.(?:client|server)$/, '').split('/')
  if (segments.at(-1) === 'index' && segments.length > 1) segments.pop()
  const parts = segments.map(pascal)
  return parts.reduce((name, part) => part.startsWith(name) ? part : `${name}${part}`, '')
}

/** The names a composables file exports: functions and constants, the default export named after the file. */
function exportedNames(path: string): string[] {
  const code = readFileSync(path, 'utf8')
  const named = [...code.matchAll(/export\s+(?:async\s+)?(?:function\b\s*(?:\*\s*)?|const\s+|let\s+)([A-Za-z_$][\w$]*)/g)].map(match => match[1]!)
  const listed = [...code.matchAll(/export\s*\{([^}]*)\}/g)].flatMap(match => match[1]!.split(',').map(item => item.trim().split(/\s+as\s+/).pop()!).filter(Boolean))
  return [...named, ...listed].filter(name => name !== 'default')
}

/** The app's component and composable names, where Nuxt finds them: `app/` (Nuxt 4) or the root. */
export function appNames(rootDir: string): { components: Map<string, string>, composables: Map<string, string> } {
  const components = new Map<string, string>()
  const composables = new Map<string, string>()
  const add = (names: Map<string, string>, name: string, file: string) => {
    // Shown to the developer, so `/`-separated on every platform, as Nuxt's own messages are.
    if (!names.has(name)) names.set(name, relative(rootDir, file).split(sep).join('/'))
  }
  for (const base of ['app', '.']) {
    const componentsDir = join(rootDir, base, 'components')
    for (const file of filesUnder(componentsDir, /\.vue$/)) add(components, componentName(file), join(componentsDir, file))
    for (const file of composableFiles(join(rootDir, base))) {
      for (const name of exportedNames(file)) add(composables, name, file)
    }
  }
  return { components, composables }
}

/** The files Nuxt auto-imports from: the top level of `composables/` and `utils/`, and the index file of each folder in them. */
function composableFiles(srcDir: string): string[] {
  return ['composables', 'utils'].flatMap((folder) => {
    const dir = join(srcDir, folder)
    return filesUnder(dir, /\.(?:ts|js|mjs|mts)$/, 1)
      .map(file => file.replace(/\\/g, '/'))
      .filter(file => !file.includes('/') || /\/index\.\w+$/.test(file))
      .map(file => join(dir, file))
  })
}

/** `name-collisions`: informational, whatever it finds. */
export function nameCollisionFinding(rootDir: string, ours: PackageNames = packageNames()): PreflightFinding {
  const app = appNames(rootDir)
  const shared = [
    ...[...app.components].filter(([name]) => ours.components.has(name)).map(([name, file]) => `<${name}> (${file})`),
    ...[...app.composables].filter(([name]) => ours.composables.has(name)).map(([name, file]) => `${name} (${file})`),
  ]
  if (shared.length === 0) return finding('name-collisions', 'pass', 'No app component or composable shares a name with one of the package\'s.')
  return finding(
    'name-collisions',
    'pass',
    `The app's ${shared.join(', ')} share${shared.length === 1 ? 's' : ''} a name with one of the package's.`,
    'Nothing to do when you meant it: a same-named component is how a part is swapped. Rename yours otherwise.',
  )
}
