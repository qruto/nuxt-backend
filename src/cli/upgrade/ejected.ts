import { installedVersion } from '../../agents'
import { ejectedFiles, packagedSource, sourceOf, stillShipped, type PackagedSource } from '../eject'
import { unifiedDiff } from './diff'

/** One ejected file as `upgrade` reports it: the upstream changes since the version in its stamp. */
export interface EjectedChange {
  target: string
  file: string
  /** The version in its stamp. */
  from: string
  /** The installed version. */
  to: string
  /** How many hunks the packaged source changed by; `null` when the old source could not be read. */
  changes: number | null
  /** This version ships no part, page or email by that name any more. */
  removed?: true
  /** The upstream diff, with `--diff`. */
  diff?: string
}

/**
 * Every ejected file of the app at `rootDir` whose stamp names another
 * version than the installed one, with the upstream changes since: the
 * packaged source at the stamp's version against the installed one's. It
 * reads only; an ejected file is the app's, and never rewritten.
 */
export async function ejectedChanges(rootDir: string, options: { diff?: boolean, only?: string, source?: PackagedSource } = {}): Promise<EjectedChange[]> {
  const to = installedVersion(rootDir)
  const source = options.source ?? packagedSource(to)
  const files = ejectedFiles(rootDir).filter(file => file.version !== to && (!options.only || file.target === options.only))
  return Promise.all(files.map(async (ejected): Promise<EjectedChange> => {
    const base = { target: ejected.target, file: ejected.file, from: ejected.version, to }
    const path = sourceOf(rootDir, ejected)
    if (!path || !stillShipped(ejected.target)) return { ...base, changes: null, removed: true }
    const [before, after] = await Promise.all([source(ejected.version, path), source(to, path)])
    if (before === undefined || after === undefined) return { ...base, changes: null }
    const diff = unifiedDiff(path, before, after)
    const changes = diff.split('\n').filter(line => line.startsWith('@@')).length
    return { ...base, changes, ...(options.diff ? { diff } : {}) }
  }))
}

/** The ejected files as the terminal shows them. */
export function formatEjected(changes: readonly EjectedChange[]): string[] {
  if (changes.length === 0) return []
  const lines = ['Ejected files']
  for (const change of changes) {
    const versions = `${change.from} → ${change.to}`
    const what = change.removed
      ? 'no longer shipped: the packaged part, page or email is gone'
      : change.changes === null
        ? `the ${change.from} source could not be read`
        : `${change.changes} upstream change${change.changes === 1 ? '' : 's'}`
    lines.push(`  ${change.target.padEnd(20)} ${versions.padEnd(18)} ${what}`)
    if (change.diff) lines.push(...change.diff.split('\n').map(line => `      ${line}`))
    else if (!change.removed && change.changes) lines.push(`  ${' '.repeat(20)} npx nuxt-backend upgrade --diff ${change.target}`)
  }
  return lines
}
