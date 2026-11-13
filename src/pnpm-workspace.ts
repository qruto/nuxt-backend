import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { PROJECT_SKILLS } from './agents'
import { packageManagerOf } from './cli/deploy/package-manager'
import { CORE_SKILL } from './guidance/skills'

// pnpm 12.11 and later link the agent skills a direct dependency ships once
// `pnpm approve` grants them, and list the package under "Agent skills
// awaiting approval" until then. `init` copies nuxt-backend's skills into
// `.agents/skills` itself, and a second copy, linked by pnpm, shows an agent
// each skill twice. So `init` records the denial `pnpm approve '!nuxt-backend'`
// would, in the file pnpm reads its settings from:
//
//   permissions:
//     nuxt-backend:
//       skills: false
//
// pnpm 11 warns about a `permissions` key it does not know on every install,
// so the entry is written only for a pnpm that reads it.

export const PNPM_WORKSPACE = 'pnpm-workspace.yaml'

/**
 * What happened to the denial: `created`, a new `pnpm-workspace.yaml` that
 * holds it; `added`, written into the file; `unchanged`, the file already
 * says whether pnpm may link nuxt-backend's skills, either way; `manual`,
 * `permissions` is written in a form `init` does not edit (a flow mapping),
 * so the file was left alone.
 */
export type PnpmWorkspaceAction = 'created' | 'added' | 'unchanged' | 'manual'

/** The first pnpm that reads `permissions`. */
const PERMISSIONS_SINCE = { major: 12, minor: 11 }

/** The comment above the entry, for whoever reads the file next. */
const ENTRY_COMMENT = '# The nuxt-backend agent skills are in .agents/skills, where `npx nuxt-backend init` copies them'

/** The pnpm version `package.json`'s `packageManager` field pins (`pnpm@12.16.1+sha512.…`), which pnpm and Corepack both switch to. */
function pinnedPnpm(rootDir: string): string | undefined {
  try {
    const field = (JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')) as { packageManager?: unknown }).packageManager
    return typeof field === 'string' ? /^pnpm@(\d+\.\d+\.\d+)/.exec(field)?.[1] : undefined
  }
  catch {
    return undefined
  }
}

/**
 * The version of the pnpm that installs in `rootDir`: the one the project
 * pins, else the one running this command (`pnpm exec nuxt-backend init`),
 * else what `pnpm --version` says there. `undefined` when pnpm is not on
 * the path.
 */
export function pnpmVersionIn(rootDir: string): string | undefined {
  const known = pinnedPnpm(rootDir) ?? /^pnpm\/(\d+\.\d+\.\d+)/.exec(process.env.npm_config_user_agent ?? '')?.[1]
  if (known) return known
  const result = spawnSync('pnpm', ['--version'], { cwd: rootDir, encoding: 'utf8', shell: process.platform === 'win32', timeout: 10_000 })
  return result.status === 0 ? /\d+\.\d+\.\d+/.exec(result.stdout)?.[0] : undefined
}

/** Whether a pnpm of `version` reads the `permissions` setting (12.11 and later). */
export function pnpmReadsPermissions(version: string | undefined): boolean {
  const [major = 0, minor = 0] = (version ?? '').split('.').map(Number)
  return major > PERMISSIONS_SINCE.major || (major === PERMISSIONS_SINCE.major && minor >= PERMISSIONS_SINCE.minor)
}

/**
 * The `pnpm-workspace.yaml` pnpm reads its settings from for `rootDir`: the
 * nearest one in it or a folder above, as pnpm looks for it, else a new one
 * in `rootDir`.
 */
export function pnpmWorkspaceFile(rootDir: string): string {
  for (let dir = rootDir; ; dir = dirname(dir)) {
    const file = join(dir, PNPM_WORKSPACE)
    if (existsSync(file)) return file
    if (dir === dirname(dir)) return join(rootDir, PNPM_WORKSPACE)
  }
}

/** The key a block mapping line at exactly `indent` names, unquoted; undefined for any other line. */
function keyAt(line: string, indent: string): string | undefined {
  const rest = line.startsWith(indent) ? line.slice(indent.length) : ''
  const colon = rest.search(/:(?:\s|$)/)
  if (colon <= 0 || /^[\s#-]/.test(rest)) return undefined
  return rest.slice(0, colon).trim().replace(/^(["'])(.*)\1$/, '$2')
}

/** The indentation of a line: its leading spaces. */
const indentOf = (line: string) => /^ */.exec(line)![0]

/** A line that carries content: not blank, not a comment. */
const isContent = (line: string) => line.trim() !== '' && !line.trimStart().startsWith('#')

/**
 * The lines of the block under the mapping key at `index` (indented deeper
 * than `indent`), as indexes, blank and comment lines included.
 */
function blockAfter(lines: string[], index: number, indent: string): number[] {
  const block: number[] = []
  for (let at = index + 1; at < lines.length; at++) {
    const line = lines[at]!
    if (isContent(line) && indentOf(line).length <= indent.length) break
    block.push(at)
  }
  return block
}

/** The value written on a key's own line, comments off: `{ skills: false }`, or `''` for a block. */
const inlineValue = (line: string) => line.slice(line.indexOf(':') + 1).replace(/\s#.*$/, '').trim()

/**
 * `source` (a `pnpm-workspace.yaml`, or `undefined` for none) with
 * `skills: false` for nuxt-backend under `permissions`, inserted line by
 * line so every other key, comment and blank line stays as it was. A
 * `skills` entry nuxt-backend already has is the project's choice, and
 * stays. Exported for tests.
 *
 * @internal
 */
export function denyPnpmSkills(source: string | undefined): { action: PnpmWorkspaceAction, content?: string } {
  const entry = (indent: string, step: string) => [`${indent}${ENTRY_COMMENT}`, `${indent}${CORE_SKILL.name}:`, `${indent}${step}skills: false`]
  if (source === undefined) return { action: 'created', content: ['permissions:', ...entry('  ', '  '), ''].join('\n') }

  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const lines = source.split(/\r?\n/)
  const top = lines.findIndex(line => keyAt(line, '') === 'permissions')
  if (top === -1) {
    // No `permissions` yet: a new one at the end, after the last line.
    const end = lines.at(-1) === '' ? lines.length - 1 : lines.length
    lines.splice(end, 0, 'permissions:', ...entry('  ', '  '))
    if (lines.at(-1) !== '') lines.push('')
    return { action: 'added', content: lines.join(eol) }
  }
  if (inlineValue(lines[top]!) !== '') return { action: 'manual' }

  const children = blockAfter(lines, top, '').filter(at => isContent(lines[at]!))
  const indent = children.length > 0 ? indentOf(lines[children[0]!]!) : '  '
  const own = children.find(at => keyAt(lines[at]!, indent) === CORE_SKILL.name)
  if (own === undefined) {
    lines.splice(top + 1, 0, ...entry(indent, indent))
    return { action: 'added', content: lines.join(eol) }
  }

  const value = inlineValue(lines[own]!)
  if (value !== '') return { action: /\bskills\s*:/.test(value) ? 'unchanged' : 'manual' }
  const grandchildren = blockAfter(lines, own, indent).filter(at => isContent(lines[at]!))
  const inner = grandchildren.length > 0 ? indentOf(lines[grandchildren[0]!]!) : `${indent}${indent}`
  if (grandchildren.some(at => keyAt(lines[at]!, inner) === 'skills')) return { action: 'unchanged' }
  lines.splice(own + 1, 0, `${inner}skills: false`)
  return { action: 'added', content: lines.join(eol) }
}

/** What `recordPnpmSkillsDenial` did, and to which file, relative to the project. */
export interface PnpmWorkspaceResult {
  action: PnpmWorkspaceAction
  file: string
}

/**
 * In a pnpm project whose pnpm reads `permissions`, once `init` has copied
 * the agent skills into `.agents/skills`, deny pnpm's own link of them in
 * `pnpm-workspace.yaml` (see {@link denyPnpmSkills}), creating the file when
 * there is none. `null` when it does not apply: another package manager, no
 * skill copies, or a pnpm older than 12.11, or not found.
 */
export function recordPnpmSkillsDenial(rootDir: string, { version = pnpmVersionIn }: { version?: (rootDir: string) => string | undefined } = {}): PnpmWorkspaceResult | null {
  if (packageManagerOf(rootDir) !== 'pnpm') return null
  if (!existsSync(join(rootDir, PROJECT_SKILLS, CORE_SKILL.name, 'SKILL.md'))) return null
  if (!pnpmReadsPermissions(version(rootDir))) return null
  const path = pnpmWorkspaceFile(rootDir)
  const { action, content } = denyPnpmSkills(existsSync(path) ? readFileSync(path, 'utf8') : undefined)
  if (content !== undefined) writeFileSync(path, content)
  return { action, file: relative(rootDir, path).replace(/\\/g, '/') }
}

/** The line `init` prints about the denial; undefined when there is nothing to say. */
export function pnpmWorkspaceMessage({ action, file }: PnpmWorkspaceResult): string | undefined {
  const why = `its agent skills are in ${PROJECT_SKILLS} already, so pnpm links no second copy and stops listing it as awaiting approval`
  switch (action) {
    case 'created': return `Created ${file} with skills: false for nuxt-backend under permissions: ${why}`
    case 'added': return `Added skills: false for nuxt-backend under permissions in ${file}: ${why}`
    case 'manual': return `${file} writes permissions in a form init does not edit, so it was left alone. Run \`pnpm approve '!nuxt-backend'\`: the agent skills are in ${PROJECT_SKILLS} already`
    default: return undefined
  }
}
