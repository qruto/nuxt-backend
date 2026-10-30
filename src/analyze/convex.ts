// The Convex half of `analyze`: Convex's own bundle analyzer
// (`@convex-dev/bundle-analyzer`), pointed at the app's functions, read as
// JSON and shaped into a `BundleReport`. The analyzer bundles the backend
// the way `convex deploy` does and writes nothing to a deployment.

import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import { resolveFunctionsDir } from '../scaffold'
import type { BundleInsight, BundlePackage, BundlePart, BundleReport, BundleShare } from './types'

/** The analyzer's `components --json` rows that matter here. */
export interface AnalyzerComponent {
  /** `<component>:<kind>`, kind being `convex`, `schema` or `auth`. */
  id: string
  /** `app` for the app's own functions. */
  component: string
  /** Where the component is defined; empty for the app. */
  definitionPath: string
  codeBytes: number
  sourceMapBytes: number
}

/** The analyzer's `packages --json` rows that matter here. */
export interface AnalyzerPackage {
  package: string
  name: string
  version: string | null
  codeBytes: number
  /** Bytes by build id (`<component>:<kind>`). */
  byBuild: Readonly<Record<string, { codeBytes: number }>>
}

/** The analyzer's `insights --json` rows that matter here. */
export interface AnalyzerInsight {
  kind: string
  level: 'info' | 'warn'
  title: string
  detail?: string
  savedCodeBytes?: number
  savedBytes?: number
  subject?: string
}

export interface AnalyzerOutput {
  components: readonly AnalyzerComponent[]
  packages: readonly AnalyzerPackage[]
  insights: readonly AnalyzerInsight[]
}

const TOP_PARTS = 8
const TOP_PACKAGES = 12

/** The package's own component: where `nuxt-backend/convex.config` is defined. */
export function isBackendComponent(component: Pick<AnalyzerComponent, 'component' | 'definitionPath'>): boolean {
  return component.component === 'nuxt-backend' || /(?:^|\/)dist\/convex\/components\/backend$/.test(component.definitionPath.replace(/\\/g, '/'))
}

/** The name a component goes by in the report: the app's functions say so, a path-named one keeps its package. */
function partName(component: AnalyzerComponent): string {
  if (component.definitionPath === '') return 'your functions'
  if (isBackendComponent(component)) return 'nuxt-backend'
  // The innermost package on the path names it: a component installed under another's node_modules is its own.
  const named = [...component.definitionPath.replace(/\\/g, '/').matchAll(/node_modules\/((?:@[^/]+\/)?[^/]+)/g)].at(-1)?.[1]
  return named ?? component.component
}

function share(id: BundleShare['id'], label: string, bytes: number, total: number): BundleShare {
  return { id, label, bytes, share: total > 0 ? bytes / total : 0 }
}

/**
 * The analyzer's three listings as a report. The Convex bundle is each
 * component's own bundle plus the app's, so its size is their sum. The
 * package's share is the backend component's whole bundle (the dependencies
 * it brings included) and its own files inside every other bundle; the
 * app's, the code under your `backend/`; the rest, everything else.
 */
export function buildConvexReport({ components, packages, insights }: AnalyzerOutput): BundleReport {
  const total = components.reduce((sum, component) => sum + component.codeBytes, 0)
  const sourceMaps = components.reduce((sum, component) => sum + component.sourceMapBytes, 0)
  const backendBuilds = new Set(components.filter(isBackendComponent).map(component => component.id))
  const appBuilds = new Set(components.filter(component => component.definitionPath === '' && component.component === 'app').map(component => component.id))

  const ownBytes = (row: AnalyzerPackage | undefined, wanted: (build: string) => boolean) =>
    Object.entries(row?.byBuild ?? {}).reduce((sum, [build, size]) => sum + (wanted(build) ? size.codeBytes : 0), 0)
  const backendPackage = packages.find(row => row.name === 'nuxt-backend')
  const appCode = packages.find(row => row.package === 'your code')

  const nuxtBackend = components.filter(isBackendComponent).reduce((sum, component) => sum + component.codeBytes, 0)
    + ownBytes(backendPackage, build => !backendBuilds.has(build))
  const app = ownBytes(appCode, build => appBuilds.has(build))

  const parts = new Map<string, number>()
  for (const component of components) parts.set(partName(component), (parts.get(partName(component)) ?? 0) + component.codeBytes)

  // The analyzer counts as "your code" every file outside node_modules, in every build; the app's is what its own functions' builds hold.
  const named = (rows: readonly AnalyzerPackage[]): BundlePackage[] => rows
    .map(row => row.package === 'your code'
      ? { name: 'your code', bytes: app }
      : { name: row.name, ...(row.version ? { version: row.version } : {}), bytes: row.codeBytes })
    .filter(item => item.bytes > 0)
    .toSorted((a, b) => b.bytes - a.bytes)

  return {
    title: 'Convex bundle',
    id: 'convex',
    bytes: total,
    sourceMapBytes: sourceMaps,
    parts: [...parts].map(([name, bytes]): BundlePart => ({ name, bytes })).toSorted((a, b) => b.bytes - a.bytes).slice(0, TOP_PARTS),
    packages: named(packages).slice(0, TOP_PACKAGES),
    shares: [
      share('nuxt-backend', 'nuxt-backend', nuxtBackend, total),
      share('app', 'your code', app, total),
      share('other', 'everything else', Math.max(0, total - nuxtBackend - app), total),
    ],
    insights: insights.map((insight): BundleInsight => ({
      kind: insight.kind,
      level: insight.level,
      title: insight.title,
      ...(insight.detail ? { detail: insight.detail } : {}),
      savedBytes: insight.savedCodeBytes ?? insight.savedBytes ?? 0,
      ...(insight.subject ? { subject: insight.subject } : {}),
    })),
    notes: [],
  }
}

/** The analyzer's pinned version: an optional peer, so only the apps that run `analyze` install it. */
export const BUNDLE_ANALYZER = '@convex-dev/bundle-analyzer@0.1.0'

/** The command that installs the analyzer, for the refusal when it is missing. */
export const INSTALL_BUNDLE_ANALYZER = `npm install -D ${BUNDLE_ANALYZER}`

/**
 * The analyzer's entry file, resolved from this package (where a package
 * manager links an optional peer the app installed), else from the app.
 * `undefined` when the app has not installed it.
 */
export function resolveBundleAnalyzer(rootDir?: string): string | undefined {
  const from = [import.meta.url, ...rootDir ? [join(rootDir, 'package.json')] : []]
  for (const base of from) {
    try {
      const manifestPath = createRequire(base).resolve('@convex-dev/bundle-analyzer/package.json')
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { bin?: string | Record<string, string> }
      const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.['bundle-analyzer']
      if (bin) return join(dirname(manifestPath), bin)
    }
    catch {
      // Not installed where this base resolves: try the next one.
    }
  }
  return undefined
}

/** One analyzer run: its stdout, and the warnings it printed on stderr. */
export interface AnalyzerRun {
  stdout: string
  stderr: string
}

export type RunAnalyzer = (rootDir: string, args: string[]) => Promise<AnalyzerRun>

/** The analyzer as a child process in the app's root, which is where it looks for `convex.json`. */
export const runBundleAnalyzer: RunAnalyzer = (rootDir, args) => new Promise((resolve, reject) => {
  const entry = resolveBundleAnalyzer(rootDir)
  if (!entry) {
    reject(new Error(`@convex-dev/bundle-analyzer is not installed: run \`${INSTALL_BUNDLE_ANALYZER}\` to measure the Convex bundle.`))
    return
  }
  execFile(process.execPath, [entry, ...args, '--json'], { cwd: rootDir, maxBuffer: 256 * 1024 * 1024, timeout: 300_000, env: { ...process.env, NO_COLOR: '1' } }, (error, stdout, stderr) => {
    if (error) {
      const lines = stripVTControlCharacters(stderr).split('\n').map(line => line.trim()).filter(line => line.startsWith('✘') || line.includes('ERROR') || line.startsWith('Error'))
      reject(new Error(`the Convex bundle analyzer failed: ${(lines.length > 0 ? lines : stripVTControlCharacters(stderr).split('\n').filter(Boolean).slice(-3)).join(' ').slice(0, 600) || error.message}`))
      return
    }
    resolve({ stdout, stderr })
  })
})

/** Why the Convex half cannot run, or null: it needs the functions' codegen, which `nuxt-backend dev` keeps current. */
export function convexRefusal(rootDir: string): string | null {
  const functionsDir = resolveFunctionsDir(rootDir)
  if (existsSync(join(rootDir, functionsDir, '_generated'))) return null
  return `${functionsDir}/_generated/ is missing: run npx nuxt-backend dev once (or npx convex codegen) so the functions have their codegen, then analyze again.`
}

function parse<T>(run: AnalyzerRun, what: string): T {
  try {
    return JSON.parse(run.stdout) as T
  }
  catch {
    throw new Error(`the Convex bundle analyzer printed something other than JSON for ${what}.`)
  }
}

/** The analyzer's warnings worth passing on: its bundler is not the project's `convex`. */
function analyzerNotes(stderr: string): string[] {
  return stripVTControlCharacters(stderr).split('\n').map(line => line.trim()).filter(line => line.startsWith('Warning: this project uses convex')).map(line => line.replace(/^Warning: /, ''))
}

/** Measure the Convex bundle: three analyzer runs, side by side. Throws when the analyzer cannot run. */
export async function analyzeConvex(rootDir: string, run: RunAnalyzer = runBundleAnalyzer): Promise<BundleReport> {
  const refusal = convexRefusal(rootDir)
  if (refusal) throw new Error(refusal)
  const [components, packages, insights] = await Promise.all([
    run(rootDir, ['components']),
    run(rootDir, ['packages', '--limit', '1000']),
    run(rootDir, ['insights']),
  ])
  const report = buildConvexReport({
    components: parse<AnalyzerComponent[]>(components, 'components'),
    packages: parse<AnalyzerPackage[]>(packages, 'packages'),
    insights: parse<{ insights: AnalyzerInsight[] }>(insights, 'insights').insights,
  })
  report.notes.push(...new Set([components, packages, insights].flatMap(output => analyzerNotes(output.stderr))))
  return report
}
