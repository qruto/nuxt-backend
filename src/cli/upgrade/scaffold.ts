/**
 * `nuxt-backend upgrade`'s scaffold half: the repairs `doctor --fix` makes
 * (src/cli/repair.ts), run as they are. For a dry run they run on a scratch
 * copy of what they read — the functions directory, `convex.json` and
 * `package.json`, with the app's `node_modules` linked so an installed
 * package reads as installed — and the copy is compared with the app, so the
 * dry run shows exactly what the real run writes.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { resolveFunctionsDir } from '../../scaffold'
import { repairProjectFiles } from '../repair'

/** A file the repairs change: its text before and after. */
interface FileChange {
  path: string
  before: string
  after: string
}

/** What the repairs write: new files, their change lines, and every file's text before and after. */
interface RepairPlan {
  written: string[]
  changes: string[]
  files: FileChange[]
}

/** Every file under `dir`, relative to it, `/`-separated. */
function filesUnder(dir: string, prefix = ''): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${prefix}${entry.name}`
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : filesUnder(join(dir, entry.name), `${path}/`)
    return entry.isFile() ? [path] : []
  })
}

/**
 * Where the project's copy goes in the scratch directory, so that the
 * functions directory lands inside it too: the scratch directory itself, or,
 * for a functions directory above the project (`functions: "../backend"`
 * in a monorepo), as deep as the project's own last folders, which the copy
 * keeps, so the two lie as they do on disk. Undefined for a functions
 * directory on another drive, which no copy can mirror.
 */
function projectCopy(scratch: string, rootDir: string, functionsDir: string): string | undefined {
  const path = relative(rootDir, resolve(rootDir, functionsDir))
  if (isAbsolute(path)) return undefined
  const up = path.split(sep).filter(segment => segment === '..').length
  // A drive's colon is no part of a folder's name.
  const kept = up === 0 ? [] : resolve(rootDir).split(sep).filter(Boolean).slice(-up).map(segment => segment.replace(/:/g, ''))
  return join(scratch, ...kept)
}

/**
 * What the repairs read, copied to `scratch`: the functions directory,
 * `convex.json` and `package.json`, and the app's `node_modules` linked,
 * so an installed package reads as installed. Copies, never links: a repair
 * in the copy must not write through a link into the app.
 */
function copyProject(rootDir: string, scratch: string, functionsDir: string): void {
  mkdirSync(scratch, { recursive: true })
  const read = [functionsDir, 'convex.json', 'package.json']
  for (const path of read.filter(item => existsSync(join(rootDir, item)))) {
    cpSync(join(rootDir, path), join(scratch, path), { recursive: true, dereference: true, filter: source => !source.includes(join(rootDir, 'node_modules')) })
  }
  if (existsSync(join(rootDir, 'node_modules'))) symlinkSync(join(rootDir, 'node_modules'), join(scratch, 'node_modules'), 'junction')
}

/**
 * The repairs, planned on a scratch copy: what they would write and change.
 * Nothing in the app is touched, and nothing outside the scratch copy is
 * written.
 */
export async function planRepairs(rootDir: string): Promise<RepairPlan> {
  const scratchDir = mkdtempSync(join(tmpdir(), 'nuxt-backend-upgrade-'))
  try {
    const functionsDir = resolveFunctionsDir(rootDir)
    const scratch = projectCopy(scratchDir, rootDir, functionsDir)
    if (!scratch) return { written: [], changes: [`${functionsDir}: on another drive, which the dry run cannot copy; \`npx nuxt-backend doctor\` names what the repairs would change`], files: [] }
    copyProject(rootDir, scratch, functionsDir)
    const { written, changes } = await repairProjectFiles(scratch)
    const files = [...filesUnder(join(scratch, functionsDir), `${functionsDir}/`), 'convex.json', 'package.json'].flatMap((path) => {
      if (!existsSync(join(scratch, path))) return []
      const after = readFileSync(join(scratch, path), 'utf-8')
      const before = existsSync(join(rootDir, path)) ? readFileSync(join(rootDir, path), 'utf-8') : ''
      return after === before ? [] : [{ path, before, after }]
    })
    return { written, changes, files }
  }
  finally {
    rmSync(scratchDir, { recursive: true, force: true })
  }
}
