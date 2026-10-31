// The Nuxt half of `analyze`: the build `nuxi analyze` makes, read back. The
// build is Nuxt's own (`nuxt analyze --no-serve`); a temporary layer turns
// the two bundle visualizers it already runs, the browser's and Nitro's, from
// their HTML treemap to raw data, which this file shapes into a
// `BundleReport` for each. The app's `nuxt.config` is not touched.

import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import { packageDir } from '../dirs'
import { formatSize } from './sizes'
import type { BundleInsight, BundlePackage, BundleReport, BundleShare } from './types'

/** The part of the visualizer's raw data this file reads. */
export interface RawBundleData {
  nodeParts: Readonly<Record<string, { renderedLength: number, gzipLength: number }>>
  nodeMetas: Readonly<Record<string, { id: string, moduleParts: Readonly<Record<string, string>> }>>
  options?: { gzip?: boolean }
}

export interface NuxtBundleContext {
  /** Directories of this package where it is linked into the app rather than installed, so its files sit outside `node_modules`. */
  ownDirs?: readonly string[]
  /** A package's version, read from its directory. */
  readVersion?: (dir: string) => string | undefined
}

const TOP_PACKAGES = 12

/** A duplicate that would save less than this is not worth a line. */
const MIN_SAVED_BYTES = 1000
const SCOPED_OR_PLAIN = /^((?:@[^/]+\/)?[^/]+)/

type Origin
  = | { kind: 'package', name: string, dir: string }
    | { kind: 'app' }
    | { kind: 'generated' }

/** Who a module belongs to, from its id in the bundle. */
export function originOf(id: string, ownDirs: readonly string[]): Origin {
  const path = id.split('?')[0]!.replace(/\\/g, '/')
  // Templates the module writes into `.nuxt/nuxt-backend/` reach the bundle as virtual modules.
  if (/^virtual:nuxt:\.nuxt%2Fnuxt-backend%2F/.test(path)) return { kind: 'package', name: 'nuxt-backend', dir: '' }
  if (path.startsWith('\0') || path.startsWith('virtual:') || path.startsWith('#')) return { kind: 'generated' }
  const marker = '/node_modules/'
  const at = path.lastIndexOf(marker)
  if (at >= 0) {
    const name = SCOPED_OR_PLAIN.exec(path.slice(at + marker.length))?.[1]
    // `node_modules/.cache` and the like are tools' caches, not packages.
    if (name?.startsWith('.')) return { kind: 'generated' }
    if (name) return { kind: 'package', name, dir: path.slice(0, at + marker.length + name.length) }
  }
  // Nuxt's build directory holds what it generates, apart from the templates this package's module writes there.
  if (path.includes('/.nuxt/')) return path.includes('/.nuxt/nuxt-backend/') ? { kind: 'package', name: 'nuxt-backend', dir: '' } : { kind: 'generated' }
  const own = ownDirs.map(dir => dir.replace(/\\/g, '/')).find(dir => path.startsWith(`${dir}/`))
  if (own) return { kind: 'package', name: 'nuxt-backend', dir: own }
  return { kind: 'app' }
}

function readInstalledVersion(dir: string): string | undefined {
  try {
    return (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) as { version?: string }).version
  }
  catch {
    return undefined
  }
}

/** Copies of one package in the bundle: the same name from more than one install directory. */
function duplicateInsights(copies: ReadonlyMap<string, Map<string, number>>, readVersion: (dir: string) => string | undefined): BundleInsight[] {
  const insights: BundleInsight[] = []
  for (const [name, byDir] of copies) {
    // A copy that tree-shook to nothing is installed, not bundled.
    const sorted = [...byDir].filter(([, bytes]) => bytes > 0).toSorted((a, b) => b[1] - a[1])
    const saved = sorted.slice(1).reduce((sum, [, bytes]) => sum + bytes, 0)
    if (sorted.length < 2 || saved < MIN_SAVED_BYTES) continue
    const listed = sorted.map(([dir, bytes]) => {
      const version = readVersion(dir)
      return `${version ? `${version} in ` : ''}${dir.slice(dir.indexOf('node_modules/'))} (${formatSize(bytes)})`
    })
    insights.push({
      kind: 'duplicate-package',
      level: 'warn',
      title: `${name} is bundled ${sorted.length} times`,
      detail: `Copies: ${listed.join(', ')}. Deduplicating the install (for example pnpm dedupe), or aligning the versions your dependencies ask for, keeps one.`,
      savedBytes: saved,
      subject: name,
    })
  }
  return insights.toSorted((a, b) => b.savedBytes - a.savedBytes)
}

/** What a run's modules add up to. */
interface Tally {
  total: number
  gzip: number
  /** Bytes by package, `your code` and `generated code`. */
  byName: Map<string, number>
  /** For each package, the bytes by install directory. */
  copies: Map<string, Map<string, number>>
  ownBytes: number
  appBytes: number
}

/** Count one module's bytes to whoever it belongs to. */
function record(tally: Tally, origin: Origin, bytes: number): void {
  const name = origin.kind === 'package' ? origin.name : origin.kind === 'app' ? 'your code' : 'generated code'
  tally.byName.set(name, (tally.byName.get(name) ?? 0) + bytes)
  if (origin.kind === 'app') tally.appBytes += bytes
  if (origin.kind !== 'package') return
  if (origin.name === 'nuxt-backend') tally.ownBytes += bytes
  else if (origin.dir !== '') {
    const byDir = tally.copies.get(origin.name) ?? new Map<string, number>()
    byDir.set(origin.dir, (byDir.get(origin.dir) ?? 0) + bytes)
    tally.copies.set(origin.name, byDir)
  }
}

function tallyModules(raw: RawBundleData, ownDirs: readonly string[]): Tally {
  const tally: Tally = { total: 0, gzip: 0, byName: new Map(), copies: new Map(), ownBytes: 0, appBytes: 0 }
  for (const meta of Object.values(raw.nodeMetas)) {
    const sizes = Object.values(meta.moduleParts).map(uid => raw.nodeParts[uid]).filter(part => part !== undefined)
    const bytes = sizes.reduce((sum, part) => sum + part.renderedLength, 0)
    tally.total += bytes
    tally.gzip += sizes.reduce((sum, part) => sum + part.gzipLength, 0)
    record(tally, originOf(meta.id, ownDirs), bytes)
  }
  return tally
}

/** One visualizer run's raw data as a report. The size is the modules' rendered code, summed over every chunk. */
export function buildNuxtReport(id: 'client' | 'server', raw: RawBundleData, context: NuxtBundleContext = {}): BundleReport {
  const { total, gzip, byName, copies, ownBytes, appBytes } = tallyModules(raw, context.ownDirs ?? [packageDir])
  const share = (shareId: BundleShare['id'], label: string, bytes: number): BundleShare => ({ id: shareId, label, bytes, share: total > 0 ? bytes / total : 0 })
  const packages: BundlePackage[] = [...byName].map(([name, bytes]) => ({ name, bytes })).toSorted((a, b) => b.bytes - a.bytes).slice(0, TOP_PACKAGES)
  return {
    id,
    title: id === 'client' ? 'Nuxt client bundle' : 'Nuxt server bundle',
    bytes: total,
    ...(raw.options?.gzip ? { gzipBytes: gzip } : {}),
    parts: [],
    packages,
    shares: [share('nuxt-backend', 'nuxt-backend', ownBytes), share('app', 'your code', appBytes), share('other', 'everything else', Math.max(0, total - ownBytes - appBytes))],
    insights: duplicateInsights(copies, context.readVersion ?? readInstalledVersion),
    notes: id === 'server' ? ['The server bundle is measured before minification: Nitro does not minify unless the app asks it to.'] : [],
  }
}

/** The project's Nuxt CLI entry, resolved from the app's root. `undefined` when Nuxt is not installed there. */
export function resolveNuxtCli(rootDir: string): string | undefined {
  try {
    const manifestPath = createRequire(join(rootDir, 'package.json')).resolve('nuxt/package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { bin?: string | Record<string, string> }
    const bin = typeof manifest.bin === 'string' ? manifest.bin : (manifest.bin?.nuxt ?? manifest.bin?.nuxi)
    return bin ? join(dirname(manifestPath), bin) : undefined
  }
  catch {
    return undefined
  }
}

/** Where a run's raw data lands, and what to run. Injectable for tests. */
export interface NuxtBuildOutput {
  /** The client visualizer's raw data, or null when the build wrote none. */
  client: RawBundleData | null
  server: RawBundleData | null
}

export type RunNuxtBuild = (rootDir: string) => Promise<NuxtBuildOutput>

/** The temporary layer: both visualizers write raw data, and the build's output stays out of the app's `.output`. */
export function analyzeLayerConfig(workDir: string): string {
  const files = JSON.stringify(join(workDir, '{name}.json'))
  const output = JSON.stringify(join(workDir, 'output'))
  return `export default {
  build: { analyze: { template: 'raw-data', filename: ${files} } },
  nitro: { analyze: { template: 'raw-data', gzipSize: true, filename: ${files} }, output: { dir: ${output}, serverDir: ${JSON.stringify(join(workDir, 'output/server'))}, publicDir: ${JSON.stringify(join(workDir, 'output/public'))} } },
}
`
}

function readRaw(file: string): RawBundleData | null {
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as RawBundleData
  }
  catch {
    return null
  }
}

/** `nuxt analyze --no-serve` in the app, with the temporary layer. Throws with the end of Nuxt's output when the build fails. */
export const runNuxtBuild: RunNuxtBuild = async (rootDir) => {
  const cli = resolveNuxtCli(rootDir)
  if (!cli) throw new Error('Nuxt is not installed in this project: run install first, or analyze with --only convex.')
  const workDir = mkdtempSync(join(tmpdir(), 'nuxt-backend-analyze-'))
  try {
    writeLayer(workDir)
    await new Promise<void>((resolve, reject) => {
      execFile(process.execPath, [cli, 'analyze', '--no-serve', '--cwd', rootDir, '--extends', join(workDir, 'layer')], {
        cwd: rootDir,
        maxBuffer: 256 * 1024 * 1024,
        timeout: 900_000,
        env: { ...process.env, CI: '1', NO_COLOR: '1', NODE_ENV: 'production' },
      }, (error, stdout, stderr) => {
        if (!error) {
          resolve()
          return
        }
        const tail = stripVTControlCharacters(`${stdout}\n${stderr}`).split('\n').map(line => line.trim()).filter(Boolean).slice(-6).join(' | ')
        reject(new Error(`the Nuxt build failed: ${tail.slice(0, 800) || error.message}`))
      })
    })
    return { client: readRaw(join(workDir, 'client.json')), server: readRaw(join(workDir, 'nitro.json')) }
  }
  finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

function writeLayer(workDir: string): void {
  // A layer is a directory with a Nuxt config in it.
  const layer = join(workDir, 'layer')
  mkdirSync(layer, { recursive: true })
  writeFileSync(join(layer, 'nuxt.config.mjs'), analyzeLayerConfig(workDir))
}

/** Measure the Nuxt app's browser and server bundles. Throws when the build fails or writes no stats. */
export async function analyzeNuxt(rootDir: string, run: RunNuxtBuild = runNuxtBuild, context: NuxtBundleContext = {}): Promise<BundleReport[]> {
  const { client, server } = await run(rootDir)
  if (!client) {
    throw new Error('Nuxt built the app but wrote no stats for the client: add rollup-plugin-visualizer to the project (pnpm add -D rollup-plugin-visualizer), which nuxt analyze needs for it.')
  }
  return [buildNuxtReport('client', client, context), ...server ? [buildNuxtReport('server', server, context)] : []]
}
