/**
 * The files `nuxt-backend init` writes for coding agents: a section of
 * `AGENTS.md` (read by Codex, Cursor, Copilot, Claude Code through
 * `@AGENTS.md`, and most others), the developer MCP server in `.mcp.json`,
 * and a copy of the agent skills the package ships in `.agents/skills/`.
 * The section names the installed version and points at those skills inside
 * the package, so an agent reads guidance for exactly that version. The
 * merges are pure, so `init`, `doctor` and the tests share them.
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { packageDir, packageVersion } from './dirs'
import { finding, type PreflightFinding } from './findings'
import { CORE_SKILL, TASK_SKILLS } from './guidance/skills'

/** The markers around the section `init` owns in AGENTS.md. Text outside them is never touched. */
export const AGENTS_START = '<!-- nuxt-backend-start -->'
export const AGENTS_END = '<!-- nuxt-backend-end -->'

/** Where an app's installed copy of the package's agent skills lives. */
export const INSTALLED_SKILLS = 'node_modules/nuxt-backend/skills'

/** The core skill in it, which an agent reads first. */
export const INSTALLED_SKILL = `${INSTALLED_SKILLS}/${CORE_SKILL.name}`

/**
 * Where `init` copies the skills in a project: the folder the skills CLI
 * installs to, which Codex, Cursor, Copilot and most agents read.
 */
export const PROJECT_SKILLS = '.agents/skills'

/** Claude Code reads its own folder, where `init` links each skill when the project uses Claude Code. */
const CLAUDE_SKILLS = '.claude/skills'

/** `words` as Markdown list-item lines of at most `width` columns, continued under a two-space indent. */
function wrapItem(words: string, width = 100): string {
  const lines: string[] = []
  let line = '-'
  for (const word of words.split(' ')) {
    if (line.length + 1 + word.length > width) {
      lines.push(line)
      line = ' '
    }
    line += ` ${word}`
  }
  return [...lines, line].join('\n')
}

/** The task skills, as a sentence's list: `a`, `b` and `c`. */
const TASK_SKILL_LIST = TASK_SKILLS.map(skill => `\`${skill.name}\``).join(', ').replace(/, ([^,]+)$/, ' and $1')

/**
 * The AGENTS.md section, markers included, for an app on `version` of the
 * package. Without a version it names none: the templates ship it that way,
 * since they install `latest`.
 */
export function agentsSection(version?: string): string {
  const runsOn = version ? `[nuxt-backend](https://nuxt-backend.dev) \`${version}\`` : '[nuxt-backend](https://nuxt-backend.dev)'
  return `${AGENTS_START}
## nuxt-backend

This app runs on ${runsOn}: a Nuxt module plus an all-in-one Convex
backend (passwordless auth, workspaces, billing with credits and gifts, email, webhooks, an agent
endpoint).

- Read \`${INSTALLED_SKILL}/SKILL.md\` first: the core skill, with the rules
  every change follows and the names that don't exist. The package ships its agent skills, so those
  copies match the installed version; the website documents the latest release.
${wrapItem(`Each task has a task skill beside the core in \`${INSTALLED_SKILLS}/\`: ${TASK_SKILL_LIST}. \`init\` copies them all into \`${PROJECT_SKILLS}/\` too.`)}
- After an upgrade, \`npx nuxt-backend init --agents\` refreshes those copies and rewrites this
  section for the new version.
- \`backend/\` holds the Convex functions (\`convex.json\` points there). The scaffolded files
  re-export the package's setup; add your own functions beside them. Never edit
  \`backend/_generated/\`: \`convex dev\` rewrites it.
- The app imports them through \`#backend/api\` and \`#backend/dataModel\`. Composables such as
  \`useAuth\`, \`useBilling\`, \`useCredits\` and \`useWorkspace\` are auto-imported.
- Names are neutral: auth, billing, email, backend. Keep provider names out of app code, labels and
  env var names.
- \`npx nuxt-backend dev\` runs Convex and Nuxt together, and \`npx nuxt-backend doctor\` checks the
  whole setup. \`npx nuxt-backend env push\` syncs \`.env.local\` to the deployment, and
  \`npx nuxt-backend billing sync\` turns \`backend/billing.catalog.ts\` into products.
- The CLI never prompts: every input is a flag, \`--json\` prints one JSON document, and \`--help\`
  ends with what a command may change. To sign in on a dev deployment without a mailbox, request a
  code for \`delivered+agent@resend.dev\` and read it with
  \`npx nuxt-backend inbox delivered+agent@resend.dev --json\`.
- The deployment's env: \`AUTH_SECRET\` and \`SITE_URL\` are required, and \`EMAIL_*\` and
  \`BILLING_*\` are optional. \`CONVEX_DEPLOYMENT\` belongs to the Convex CLI: read it, never rename
  it.
- Docs for agents: https://nuxt-backend.dev/llms.txt.
- The \`nuxt-backend\` server in \`.mcp.json\` (\`npx nuxt-backend mcp\`) answers \`doctor\`, \`status\`, the
  env names, the docs, and the Convex, billing, email and hosting consoles. A tool that writes asks
  first.
- For Convex itself, \`npx convex ai-files install\` writes its guidelines.
${AGENTS_END}
`
}

/**
 * Where the section sits in an AGENTS.md: `none` without markers, `found`
 * with exactly one start marker before exactly one end marker, and
 * `malformed` otherwise. A malformed file is never rewritten: with a start
 * marker left on its own, the text after it is the person's, and replacing
 * up to some later end marker would delete it.
 */
type SectionPlace = { kind: 'none' } | { kind: 'found', start: number, end: number } | { kind: 'malformed' }

/** Where the section sits in `text` (see {@link SectionPlace}). */
function placeSection(text: string): SectionPlace {
  const starts = text.split(AGENTS_START).length - 1
  const ends = text.split(AGENTS_END).length - 1
  if (starts === 0 && ends === 0) return { kind: 'none' }
  const end = text.indexOf(AGENTS_END)
  const start = text.lastIndexOf(AGENTS_START, end)
  if (starts !== 1 || ends !== 1 || start === -1) return { kind: 'malformed' }
  return { kind: 'found', start, end: end + AGENTS_END.length }
}

/** What `init` and `doctor` say about an AGENTS.md whose markers don't pair up. */
export const MALFORMED_AGENTS_MD = `AGENTS.md has unpaired or repeated nuxt-backend markers, so it was left as it is. Keep exactly one ${AGENTS_START} … ${AGENTS_END} pair around the nuxt-backend section, or delete every marker, then run the command again.`

/** The version a section names, if it names one. */
function sectionVersion(section: string): string | undefined {
  return /^This app runs on \[nuxt-backend\]\([^)]*\) `([^`]+)`/m.exec(section)?.[1]
}

/**
 * The version the nuxt-backend section of the app's AGENTS.md was written
 * for: the one the app ran when `init` last wrote it, which
 * `nuxt-backend upgrade` compares with the installed one to say whether the
 * agent files need refreshing. Undefined without one.
 */
export function agentsMdVersion(rootDir: string): string | undefined {
  const path = join(rootDir, 'AGENTS.md')
  const text = existsSync(path) ? readFileSync(path, 'utf8').replace(/\r\n/g, '\n') : undefined
  const place = text === undefined ? undefined : placeSection(text)
  return text !== undefined && place?.kind === 'found' ? sectionVersion(text.slice(place.start, place.end)) : undefined
}

export type AgentsMdAction = 'created' | 'appended' | 'replaced' | 'unchanged' | 'malformed'

/**
 * AGENTS.md with the section for `version` in place. A missing file is
 * created, a file without the markers gets the section appended, and one
 * with them is left as it is unless `force` replaces what sits between the
 * markers. A file whose markers don't pair up is left untouched
 * (`malformed`).
 */
export function mergeAgentsMd(existing: string | undefined, { force = false, version }: { force?: boolean, version?: string } = {}): { content: string, action: AgentsMdAction } {
  const section = agentsSection(version)
  if (existing === undefined) return { content: section, action: 'created' }
  const place = placeSection(existing)
  if (place.kind === 'malformed') return { content: existing, action: 'malformed' }
  if (place.kind === 'none') {
    const separator = existing === '' || existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n'
    return { content: `${existing}${separator}${section}`, action: 'appended' }
  }
  if (!force) return { content: existing, action: 'unchanged' }
  const after = existing.slice(place.end).replace(/^\r?\n/, '')
  const content = `${existing.slice(0, place.start)}${section}${after}`
  return { content, action: content === existing ? 'unchanged' : 'replaced' }
}

/** The developer MCP server's name in `.mcp.json`. */
export const MCP_SERVER_NAME = 'nuxt-backend'

/**
 * The SDK the developer MCP server runs on. It is an optional peer of this
 * package, so an app that never starts the server never installs it; setup
 * adds it to the app's devDependencies whenever it writes the server into
 * `.mcp.json`.
 */
export const MCP_SDK = '@modelcontextprotocol/sdk'

/**
 * The developer MCP server (`nuxt-backend mcp`): the project's state, the
 * docs and the providers' consoles, Convex's tools passed through, run by
 * the app's own copy of the package.
 */
export const DEVELOPER_MCP_SERVER = { command: 'npx', args: ['nuxt-backend', 'mcp'] } as const

/**
 * What the dev server tells a coding agent while setup still needs attention.
 * nuxt-convex-module prints a hint of its own that points agents at
 * `convex dev --once`, which cannot finish a first push here: the deployment
 * needs AUTH_SECRET and SITE_URL before it, and `nuxt-backend dev`
 * provisions them.
 */
export const AGENT_HINT = 'A coding agent is running this app, which runs on nuxt-backend. '
  + 'Set it up with `npx nuxt-backend init`, then start it with `npx nuxt-backend dev`: it provisions AUTH_SECRET and SITE_URL on the deployment before `convex dev` (a bare `convex dev --once` cannot finish its first push here). '
  + 'Check the setup with `npx nuxt-backend doctor`. '
  + `The package's agent skills ship in \`${INSTALLED_SKILLS}/\`: read \`${INSTALLED_SKILL}/SKILL.md\` first, and it routes each task to its task skill. \`init\` copies them into \`${PROJECT_SKILLS}/\`.`

export type McpJsonAction = 'created' | 'added' | 'replaced' | 'unchanged' | 'invalid'

/** Whether a server entry runs the Convex CLI's own MCP server, as `init` wrote it before 0.2.0. */
function isConvexServer(server: unknown): boolean {
  return isRecord(server) && Array.isArray(server.args) && server.args.join(' ').includes('convex mcp start')
}

/**
 * `.mcp.json` with a `nuxt-backend` server. A missing file is created; an
 * existing one gains the server only when it has none by that name, keeping
 * its indentation, final newline and every other server. `force` replaces
 * a `nuxt-backend` server that differs (`replaced`). A file that is not a
 * JSON object is left alone (`invalid`). `convexServer` says whether it
 * still holds the Convex server an earlier version wrote, which the
 * developer server makes redundant.
 */
export function mergeMcpJson(existing: string | undefined, { force = false }: { force?: boolean } = {}): { content: string | undefined, action: McpJsonAction, convexServer: boolean } {
  if (existing === undefined) {
    return { content: `${JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: DEVELOPER_MCP_SERVER } }, null, 2)}\n`, action: 'created', convexServer: false }
  }
  let config: unknown
  try {
    config = JSON.parse(existing)
  }
  catch {
    return { content: undefined, action: 'invalid', convexServer: false }
  }
  if (!isRecord(config) || (config.mcpServers !== undefined && !isRecord(config.mcpServers))) {
    return { content: undefined, action: 'invalid', convexServer: false }
  }
  const servers = (config.mcpServers ?? {}) as Record<string, unknown>
  const convexServer = Object.values(servers).some(isConvexServer)
  const current = servers[MCP_SERVER_NAME]
  if (current !== undefined && (!force || JSON.stringify(current) === JSON.stringify(DEVELOPER_MCP_SERVER))) {
    return { content: existing, action: 'unchanged', convexServer }
  }
  const indent = /^(\s+)"/m.exec(existing)?.[1] ?? '  '
  const eol = existing.endsWith('\n') ? '\n' : ''
  const content = JSON.stringify({ ...config, mcpServers: { ...servers, [MCP_SERVER_NAME]: DEVELOPER_MCP_SERVER } }, null, indent) + eol
  return { content, action: current === undefined ? 'added' : 'replaced', convexServer }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const readIfExists = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : undefined)

/** Whether anything, a dangling link included, sits at `path`. */
function occupied(path: string): boolean {
  try {
    lstatSync(path)
    return true
  }
  catch {
    return false
  }
}

/** Whether `path` is a link (a junction, on Windows), which is followed but never written through. */
function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink()
  }
  catch {
    return false
  }
}

/** A name in the package's skill namespace: the core, `nuxt-backend`, or a task skill, `nuxt-backend-<task>`. */
const SKILL_NAME = /^nuxt-backend(?:-[a-z]+)*$/

/** The entries of `dir` in the package's skill namespace, whatever each is; none when `dir` can't be read. */
function skillEntries(dir: string): string[] {
  try {
    return readdirSync(dir).filter(name => SKILL_NAME.test(name)).sort()
  }
  catch {
    return []
  }
}

/**
 * The folder holding the skills of the version the app runs: the app's own
 * copy of the package, else this package's (a linked or global run).
 */
function shippedSkillsDir(rootDir: string): string {
  const installed = join(rootDir, INSTALLED_SKILLS)
  return existsSync(installed) ? installed : join(packageDir, 'skills')
}

/** The skills a skills folder ships: the core and every task skill, by folder name. */
function shippedSkills(dir: string): string[] {
  return skillEntries(dir).filter(name => existsSync(join(dir, name, 'SKILL.md')))
}

/**
 * The package's skills the project's `skills-lock.json` lists. The skills
 * CLI installed those, and restores and updates them from where it found
 * them, so `init` leaves them to it: a copy it replaced would no longer
 * match the lock, and the CLI's next update would put the other one back.
 */
function managedSkills(rootDir: string): Set<string> {
  try {
    const lock = JSON.parse(readFileSync(join(rootDir, 'skills-lock.json'), 'utf8')) as unknown
    const skills = isRecord(lock) && isRecord(lock.skills) ? Object.keys(lock.skills) : []
    return new Set(skills.filter(name => SKILL_NAME.test(name)))
  }
  catch {
    return new Set()
  }
}

/** How the skills CLI puts the skills of the version the app runs in place of the ones it manages. */
const SKILLS_CLI_FIX = `\`npx skills add ./${INSTALLED_SKILLS} --skill '*' -y\` reinstalls the installed version's, and \`npx skills remove <name> -y\` drops one it doesn't ship`

/**
 * Every file of a skill folder, by its path relative to the folder, with its
 * text, line endings as `\n`: a checkout that converts them (Git for
 * Windows' `core.autocrlf`) holds the same skill. Dotfiles, such as the
 * `.DS_Store` Finder leaves, are no part of a skill.
 */
function folderFiles(dir: string): Map<string, string> {
  const files = new Map<string, string>()
  const walk = (sub: string) => {
    for (const entry of readdirSync(join(dir, sub), { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      const path = sub ? `${sub}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(path)
      else files.set(path, readFileSync(join(dir, path), 'utf8').replaceAll('\r\n', '\n'))
    }
  }
  walk('')
  return files
}

/**
 * Whether the folder `copy` holds the skill `source` holds, file for file
 * (see `folderFiles`). One that can't be read, such as a plain file or a
 * dangling link where the folder belongs, does not.
 */
function sameFolder(source: string, copy: string): boolean {
  try {
    const left = folderFiles(source)
    const right = folderFiles(copy)
    return left.size === right.size && [...left].every(([path, text]) => right.get(path) === text)
  }
  catch {
    return false
  }
}

/** `source` copied to `target`, dotfiles left out, replacing whatever was there: a link goes as a link, never written through. */
function copyFolder(source: string, target: string): void {
  if (occupied(target)) rmSync(target, { recursive: true, force: true })
  mkdirSync(dirname(target), { recursive: true })
  cpSync(source, target, { recursive: true, dereference: true, filter: path => path === source || !basename(path).startsWith('.') })
}

/**
 * `link` made a link to the folder `target`, as the skills CLI links a
 * skill: relative, or on Windows a junction, which needs no privileges and
 * an absolute target. False when the link can't be made.
 */
function linkFolder(target: string, link: string): boolean {
  mkdirSync(dirname(link), { recursive: true })
  try {
    if (process.platform === 'win32') symlinkSync(resolve(target), link, 'junction')
    else symlinkSync(relative(dirname(link), target), link, 'dir')
    return true
  }
  catch {
    return false
  }
}

/** What a project holds of the package's skills, against the ones the installed version ships. */
interface ProjectSkills {
  /** The folder the installed version's skills are copied from. */
  source: string
  /** The skills the installed version ships. */
  shipped: string[]
  /** Shipped skills `.agents/skills` lacks, less the ones the skills CLI manages. */
  missing: string[]
  /** Copies in `.agents/skills` that differ from the skill the installed version ships. */
  differ: string[]
  /** Copies in `.agents/skills` or `.claude/skills` of a skill the installed version doesn't ship. */
  extra: string[]
  /** Copies of their own in `.claude/skills` (not links) that differ from the shipped skill. */
  claudeDiffer: string[]
  /** The skills `skills-lock.json` lists, which `init` leaves to the skills CLI. */
  managed: Set<string>
}

/** What `rootDir` holds of the package's skills (see {@link ProjectSkills}). */
function projectSkills(rootDir: string): ProjectSkills {
  const source = shippedSkillsDir(rootDir)
  const shipped = shippedSkills(source)
  const managed = managedSkills(rootDir)
  const here = join(rootDir, PROJECT_SKILLS)
  const claude = join(rootDir, CLAUDE_SKILLS)
  const missing = shipped.filter(name => !existsSync(join(here, name)) && !managed.has(name))
  const differ = shipped.filter(name => !missing.includes(name) && occupied(join(here, name)) && !sameFolder(join(source, name), join(here, name)))
  // With nothing shipped to compare against, nothing is extra.
  const extra = shipped.length === 0 ? [] : [...new Set([...skillEntries(here), ...skillEntries(claude)])].filter(name => !shipped.includes(name)).sort()
  const claudeDiffer = skillEntries(claude).filter(name => shipped.includes(name) && !managed.has(name) && !isLink(join(claude, name)) && !sameFolder(join(source, name), join(claude, name)))
  return { source, shipped, missing, differ, extra, claudeDiffer, managed }
}

/**
 * In a project that uses Claude Code (a `.claude/` folder or a `CLAUDE.md`),
 * link each of `names` from `.claude/skills` to its copy in `.agents/skills`,
 * as the skills CLI links it, or copy it there when the link can't be made.
 * An entry already there is left alone, except the copies in `refresh`,
 * which become the shipped skill. Returns the names it linked or copied, and
 * the ones it refreshed.
 */
function linkClaudeSkills(rootDir: string, source: string, names: string[], refresh: string[]): { linked: string[], refreshed: string[] } {
  const done = { linked: [] as string[], refreshed: [] as string[] }
  if (!existsSync(join(rootDir, '.claude')) && !existsSync(join(rootDir, 'CLAUDE.md'))) return done
  for (const name of names) {
    const link = join(rootDir, CLAUDE_SKILLS, name)
    const target = join(rootDir, PROJECT_SKILLS, name)
    if (!occupied(link)) {
      if (!existsSync(target)) continue
      if (!linkFolder(target, link)) copyFolder(target, link)
      done.linked.push(name)
    }
    else if (refresh.includes(name)) {
      copyFolder(join(source, name), link)
      done.refreshed.push(name)
    }
  }
  return done
}

/**
 * What `installAgentSkills` did, each a list of skill names: `installed`,
 * written where there was none (a copy in `.agents/skills`, or its link in
 * `.claude/skills`); `refreshed`, a copy of another version replaced;
 * `removed`, a copy of a skill the installed version no longer ships,
 * deleted; `stale`, such copies left as they are, without `force` or because
 * the skills CLI manages them. All empty: every copy was current.
 */
export interface SkillsReport {
  installed: string[]
  refreshed: string[]
  removed: string[]
  stale: string[]
}

const names = (list: Iterable<string>) => [...new Set(list)].sort()
const nameList = (list: string[]) => list.join(', ')

/** `installAgentSkills`, with the lines `init` prints about it. */
function applyAgentSkills(rootDir: string, force: boolean): { report: SkillsReport, messages: string[] } {
  const { source, shipped, missing, differ, extra, claudeDiffer, managed } = projectSkills(rootDir)
  const here = join(rootDir, PROJECT_SKILLS)
  const claude = join(rootDir, CLAUDE_SKILLS)
  const ours = (list: string[]) => list.filter(name => !managed.has(name))
  const replaced = force ? ours(differ) : []
  const removed = force ? ours(extra) : []
  for (const name of [...missing, ...replaced]) copyFolder(join(source, name), join(here, name))
  for (const name of removed) {
    rmSync(join(here, name), { recursive: true, force: true })
    rmSync(join(claude, name), { recursive: true, force: true })
  }
  const linked = linkClaudeSkills(rootDir, source, ours(shipped), force ? claudeDiffer : [])
  const report: SkillsReport = {
    installed: names([...missing, ...linked.linked]),
    refreshed: names([...replaced, ...linked.refreshed]),
    removed,
    stale: names([...differ, ...extra, ...claudeDiffer].filter(name => !replaced.includes(name) && !removed.includes(name) && !linked.refreshed.includes(name))),
  }
  const left = ours(report.stale)
  const cli = report.stale.filter(name => managed.has(name))
  const messages = [
    report.installed.length > 0 && `Installed the nuxt-backend agent skills in ${PROJECT_SKILLS}: ${nameList(report.installed)}`,
    report.refreshed.length > 0 && `Refreshed the nuxt-backend agent skills ${nameList(report.refreshed)} for the installed version`,
    report.removed.length > 0 && `Removed the nuxt-backend agent skills ${nameList(report.removed)}, which the installed version no longer ships`,
    left.length > 0 && `The nuxt-backend agent skills ${nameList(left)} belong to another version, so they were left alone. \`npx nuxt-backend init --agents\` refreshes them`,
    cli.length > 0 && `The skills CLI manages ${nameList(cli)} (skills-lock.json), which don't match the installed version, so init left them to it: ${SKILLS_CLI_FIX}`,
  ].filter((line): line is string => typeof line === 'string')
  return { report, messages }
}

/**
 * Copy the skills of the version the app runs into `rootDir/.agents/skills`,
 * where the skills CLI installs them and most agents read them, and link
 * them for Claude Code (`linkClaudeSkills`). A missing skill is written. A
 * copy another version wrote, or one of a skill the installed version no
 * longer ships, is replaced or deleted only with `force`. A skill the
 * project's `skills-lock.json` lists is the skills CLI's, and left to it.
 */
export function installAgentSkills(rootDir: string, { force = false }: { force?: boolean } = {}): SkillsReport {
  return applyAgentSkills(rootDir, force).report
}

const AGENTS_MESSAGES: Record<AgentsMdAction, string | undefined> = {
  created: 'Created AGENTS.md with a nuxt-backend section for coding agents',
  appended: 'Added a nuxt-backend section to AGENTS.md',
  replaced: 'Replaced the nuxt-backend section in AGENTS.md',
  unchanged: undefined,
  malformed: MALFORMED_AGENTS_MD,
}

const MCP_MESSAGES: Record<McpJsonAction, string | undefined> = {
  created: 'Created .mcp.json with the developer MCP server (npx nuxt-backend mcp)',
  added: 'Added the developer MCP server (npx nuxt-backend mcp) to .mcp.json',
  replaced: 'Replaced the nuxt-backend server in .mcp.json with npx nuxt-backend mcp',
  unchanged: undefined,
  invalid: '.mcp.json is not a JSON object, so it was left alone. Add the developer MCP server yourself: "nuxt-backend": { "command": "npx", "args": ["nuxt-backend", "mcp"] }',
}

/** What `init` says about a Convex server an earlier version wrote: it stays, and may go. */
const CONVEX_SERVER_NOTE = 'The convex server in .mcp.json is no longer needed: the nuxt-backend server passes Convex\'s tools through. Remove it when you like'

/** What `writeAgentFiles` did to each file, and the lines `init` prints about it. */
export interface AgentFilesResult {
  agentsMd: AgentsMdAction
  mcpJson: McpJsonAction
  skills: SkillsReport
  messages: string[]
}

/**
 * Write AGENTS.md, `.mcp.json` and the agent skills in `rootDir` for
 * `version`, and return what happened: the action on each, and one line
 * each for `init` to print. `force` replaces a section already there, and
 * replaces or deletes skill copies another version wrote (see
 * `installAgentSkills`). An AGENTS.md whose markers don't pair up is not
 * written (`malformed`).
 */
export function writeAgentFiles(rootDir: string, { force = false, version }: { force?: boolean, version?: string } = {}): AgentFilesResult {
  const messages: string[] = []

  const agentsPath = join(rootDir, 'AGENTS.md')
  const agents = mergeAgentsMd(readIfExists(agentsPath), { force, version })
  if (agents.action !== 'unchanged' && agents.action !== 'malformed') writeFileSync(agentsPath, agents.content)
  if (AGENTS_MESSAGES[agents.action]) messages.push(AGENTS_MESSAGES[agents.action]!)

  const mcpPath = join(rootDir, '.mcp.json')
  const mcp = mergeMcpJson(readIfExists(mcpPath), { force })
  if ((mcp.action === 'created' || mcp.action === 'added' || mcp.action === 'replaced') && mcp.content) writeFileSync(mcpPath, mcp.content)
  if (MCP_MESSAGES[mcp.action]) messages.push(MCP_MESSAGES[mcp.action]!)
  if (mcp.convexServer) messages.push(CONVEX_SERVER_NOTE)

  const skills = applyAgentSkills(rootDir, force)
  messages.push(...skills.messages)

  // Claude Code reads CLAUDE.md, and follows AGENTS.md only when CLAUDE.md
  // imports it. Say so; never edit the user's CLAUDE.md.
  const claude = readIfExists(join(rootDir, 'CLAUDE.md'))
  if (claude !== undefined && !claude.includes('AGENTS.md')) {
    messages.push('CLAUDE.md does not mention AGENTS.md. Add a line with `@AGENTS.md` so Claude Code reads it too')
  }
  return { agentsMd: agents.action, mcpJson: mcp.action, skills: skills.report, messages }
}

/**
 * The version of nuxt-backend the app in `rootDir` has installed: its own
 * copy's manifest, else this package's (a linked or global run).
 */
export function installedVersion(rootDir: string): string {
  try {
    const { version } = JSON.parse(readFileSync(join(rootDir, 'node_modules/nuxt-backend/package.json'), 'utf8')) as { version?: unknown }
    if (typeof version === 'string') return version
  }
  catch {
    // No copy of its own: fall back to the running package.
  }
  return packageVersion()
}

const REFRESH_AGENT_FILES = `Run \`npx nuxt-backend init --agents\`: it rewrites only the nuxt-backend section of AGENTS.md, adds the developer MCP server to .mcp.json and refreshes the skills in ${PROJECT_SKILLS}.`

/** The AGENTS.md half of `agentFilesFinding`; undefined when the section is current. */
function agentsMdFinding(agents: string, version: string): PreflightFinding | undefined {
  const text = agents.replace(/\r\n/g, '\n')
  const place = placeSection(text)
  if (place.kind === 'malformed') return finding('agent-files', 'warn', 'AGENTS.md has unpaired or repeated nuxt-backend markers, so nothing rewrites it.', `Keep exactly one ${AGENTS_START} … ${AGENTS_END} pair around the nuxt-backend section, or delete every marker.`)
  if (place.kind === 'none') return finding('agent-files', 'warn', `AGENTS.md has no nuxt-backend section, so coding agents get no guidance for nuxt-backend ${version}.`, REFRESH_AGENT_FILES)
  const section = `${text.slice(place.start, place.end)}\n`
  if (section === agentsSection(version) || section === agentsSection()) return undefined
  const written = sectionVersion(section)
  const message = written && written !== version
    ? `The nuxt-backend section of AGENTS.md was written for ${written}, and ${version} is installed.`
    : `The nuxt-backend section of AGENTS.md differs from the one ${version} writes.`
  return finding('agent-files', 'warn', message, REFRESH_AGENT_FILES)
}

/**
 * The skills half of `agentFilesFinding`: a warning while a copy in
 * `.agents/skills` (or a copy of its own in `.claude/skills`) differs from
 * the skill the installed version ships, or is one of a skill it doesn't
 * ship; undefined otherwise. Missing skills don't warn: agents still find
 * them in `node_modules`, and a project may take some on purpose.
 */
function projectSkillsFinding({ differ, extra, claudeDiffer, managed }: ProjectSkills, version: string): PreflightFinding | undefined {
  const changed = names([...differ, ...claudeDiffer])
  if (changed.length === 0 && extra.length === 0) return undefined
  const where = claudeDiffer.length > 0 ? `${PROJECT_SKILLS} and ${CLAUDE_SKILLS}` : PROJECT_SKILLS
  const what = [
    changed.length > 0 && `the nuxt-backend skills in ${where} differ from the ones ${version} ships (${nameList(changed)})`,
    extra.length > 0 && `the project holds nuxt-backend skills ${version} doesn't ship (${nameList(extra)})`,
  ].filter(Boolean).join(', and ')
  const message = `${what.charAt(0).toUpperCase()}${what.slice(1)}, so agents read guidance for another version.`
  const cli = names([...changed, ...extra]).filter(name => managed.has(name))
  const fix = [
    cli.length < changed.length + extra.length && REFRESH_AGENT_FILES,
    cli.length > 0 && `The skills CLI manages ${nameList(cli)} (skills-lock.json), and \`init\` leaves them to it: ${SKILLS_CLI_FIX}.`,
  ].filter(Boolean).join(' ')
  return finding('agent-files', 'warn', message, fix)
}

/** What the project holds of the skills, for the passing finding: none, some or all of them. */
function heldSkills(rootDir: string, { shipped }: ProjectSkills): string | undefined {
  const held = shipped.filter(name => occupied(join(rootDir, PROJECT_SKILLS, name)))
  if (held.length === 0) return undefined
  return held.length === shipped.length ? `${PROJECT_SKILLS} its skills` : `${PROJECT_SKILLS} ${held.length} of its ${shipped.length} skills (agents find the rest in node_modules)`
}

/**
 * Whether the agent files in `rootDir` are current for `version`: AGENTS.md
 * holds the section this version writes (naming the version, or none, as the
 * templates ship it), `.mcp.json` has the developer MCP server, and every skill
 * copy in the project is one this version ships, as it ships it. A stale or
 * malformed file warns: an agent would work from guidance for another
 * version. A project with no AGENTS.md at all, or none or some of the
 * skills, passes with a note, since `init --no-agents` leaves it that way on
 * purpose.
 */
export function agentFilesFinding(rootDir: string, version: string): PreflightFinding {
  const project = projectSkills(rootDir)
  const skills = projectSkillsFinding(project, version)
  const agents = readIfExists(join(rootDir, 'AGENTS.md'))
  if (agents === undefined) return skills ?? finding('agent-files', 'pass', `No AGENTS.md: coding agents get no nuxt-backend guidance unless they find the skills in node_modules.`, REFRESH_AGENT_FILES)
  const stale = agentsMdFinding(agents, version)
  if (stale) return stale
  const mcp = mergeMcpJson(readIfExists(join(rootDir, '.mcp.json')))
  if (mcp.action === 'invalid') return finding('agent-files', 'warn', '.mcp.json is not a JSON object, so agents get no developer MCP server.', 'Make .mcp.json a JSON object, then run `npx nuxt-backend init --agents`.')
  if (mcp.action !== 'unchanged') return finding('agent-files', 'warn', '.mcp.json has no nuxt-backend server, so agents get no developer MCP server: no project state, docs or provider consoles.', REFRESH_AGENT_FILES)
  if (skills) return skills
  const held = [`AGENTS.md holds the nuxt-backend section ${version} writes`, '.mcp.json the developer MCP server', ...[heldSkills(rootDir, project)].filter(text => text !== undefined)]
  return finding('agent-files', 'pass', `${held.slice(0, -1).join(', ')}, and ${held.at(-1)}.`)
}
