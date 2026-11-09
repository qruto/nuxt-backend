import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderEnvExample } from './capabilities'
import { BACKEND_ENV } from './env-registry'
import { finding, type PreflightFinding } from './findings'
import { readTextIfPresent } from './source-text'

// doctor's `env-example`: the app's `.env.example` against the names the
// package's own (`init` writes it, src/capabilities/env-example.ts) lists,
// and against what reads them. It drifts both ways as the package moves on:
// a release adds a name the app's copy never gets, and a name an earlier
// release (or the app itself) stopped reading stays listed.

/** A name a line of a dotenv file sets, or lists commented out: `NAME=`, `# NAME=`, `export NAME=`. */
const LISTED = /^[\t ]*(?:#[\t ]*)?(?:export[\t ]+)?([A-Z][A-Z0-9_]*)[\t ]*=/gm

/** The names a dotenv file lists, set or commented out, in order. */
export function listedEnvNames(text: string): string[] {
  return [...new Set([...text.matchAll(LISTED)].map(([, name]) => name!))]
}

/**
 * Names something other than the app's code reads by convention: the
 * platform's (`CONVEX_*`), Nuxt's and Nitro's runtime overrides (`NUXT_*`,
 * `NITRO_*`), the host's, the error-reporting build plugin's, Node's.
 */
const READ_ELSEWHERE = /^(?:CONVEX|NUXT|NITRO|VERCEL|NETLIFY|CF|SENTRY|NODE|NPM)_|^(?:PORT|HOST|DEBUG|CI|TZ)$/

/** The folders no source of the app's lives in: dependencies, build output, codegen, dotfolders. */
const SKIPPED = new Set(['node_modules', 'dist', 'coverage', '_generated'])

/** The files the app's code and config live in. */
const SOURCE = /\.(?:[cm]?[jt]s|vue|json|jsonc|ya?ml|toml|sh)$/

/** Every source file under `dir`, dependencies, build output and dotfolders aside. */
function sourceFiles(dir: string): string[] {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  }
  catch {
    return []
  }
  return entries.flatMap((entry) => {
    if (entry.name.startsWith('.') || SKIPPED.has(entry.name)) return []
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.isFile() && SOURCE.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : []
  })
}

/** A name as code spells it: an upper-case identifier, a whole word. */
const IDENTIFIER = /\b[A-Z][A-Z0-9_]*\b/g

/** The names of `candidates` the app's own files mention, as whole words. */
function namesTheAppMentions(rootDir: string, candidates: readonly string[]): Set<string> {
  const found = new Set<string>()
  if (candidates.length === 0) return found
  const wanted = new Set(candidates)
  for (const file of sourceFiles(rootDir)) {
    let text: string
    try {
      text = readFileSync(file, 'utf8')
    }
    catch {
      continue
    }
    for (const [name] of text.matchAll(IDENTIFIER)) {
      if (wanted.has(name)) found.add(name)
    }
    if (found.size === candidates.length) break
  }
  return found
}

/** What `.env.example` lacks and lists in vain, as the finding's sentences. */
function drift(missing: readonly string[], unread: readonly string[]): string {
  return [
    ...missing.length ? [`It lacks ${missing.join(', ')}, which the package reads.`] : [],
    ...unread.length ? [`It lists ${unread.join(', ')}, which neither the package nor the app's code reads.`] : [],
  ].join(' ')
}

/**
 * The app's `.env.example` against the package's: the names the package's
 * lists and the app's lacks, and the names the app's lists that neither the
 * package, the platform nor the app's own files read. No finding without a
 * `.env.example`.
 */
export function envExampleFinding(rootDir: string): PreflightFinding[] {
  const text = readTextIfPresent(join(rootDir, '.env.example'))
  if (text === undefined) return []
  const listed = listedEnvNames(text)
  const missing = listedEnvNames(renderEnvExample()).filter(name => !listed.includes(name))
  const others = listed.filter(name => !(name in BACKEND_ENV) && !READ_ELSEWHERE.test(name))
  const mentioned = namesTheAppMentions(rootDir, others)
  const unread = others.filter(name => !mentioned.has(name))
  if (missing.length === 0 && unread.length === 0) return [finding('env-example', 'pass', '.env.example lists every name the package reads, and none that nothing reads.')]
  return [finding(
    'env-example',
    'warn',
    `.env.example has drifted. ${drift(missing, unread)}`,
    [
      ...missing.length ? [`Add ${missing.map(name => `\`# ${name}=\``).join(', ')} under their groups`] : [],
      ...unread.length ? [`remove ${unread.join(', ')}, or leave a name a tool outside the app's code reads`] : [],
    ].join('; ').replace(/^./, first => first.toUpperCase()).concat('.'),
  )]
}
