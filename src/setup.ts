import { spawnSync, type SpawnSyncOptions } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { installedVersion, MCP_SDK, writeAgentFiles, type AgentsMdAction, type McpJsonAction, type SkillsReport } from './agents'
import { renderEnvExample } from './capabilities'
import { adoptBackendDevScript } from './cli/dev'
import { packageDir } from './dirs'
import { ensureDefaultLayout, mountPagesInAppComponent, scaffoldBackendFiles } from './scaffold'

// A project's setup, in one place: what `npx nuxt-backend init` writes, and
// what the module's install step (`onInstall`, run by `npx nuxt module add
// nuxt-backend`) writes the first time the module loads in a project.

/**
 * The `.env.example` that setup writes, grouped by capability
 * (src/capabilities/env-example.ts). The templates and examples are pinned
 * to it byte for byte (test/unit/scaffold-parity.test.ts): the file an app
 * created from a template ships must be the file `init` would write.
 */
export const ENV_EXAMPLE = renderEnvExample()

/** What one setup run did. */
export interface ProjectSetup {
  /** The files written, relative to the project: scaffold files, `convex.json`, `.env.example`. */
  created: string[]
  /** What happened to AGENTS.md; null when the agent files were skipped. */
  agentsMd: AgentsMdAction | null
  /** What happened to `.mcp.json`; null when the agent files were skipped. */
  mcpJson: McpJsonAction | null
  /** What happened to the agent skills, by name; null when the agent files were skipped. */
  skills: SkillsReport | null
  /** The root component whose `<NuxtWelcome />` became `<NuxtLayout><NuxtPage /></NuxtLayout>`, or null. */
  appComponent: string | null
  /** The `dev` script, when setup pointed it at `nuxt-backend dev`; null when it left the script alone. */
  devScript: string | null
  /** The `convex` range added to `dependencies`, or null. */
  convexDependency: string | null
  /** The `@modelcontextprotocol/sdk` range added to `devDependencies` for the developer MCP server, or null. */
  mcpSdkDependency: string | null
  /** The command that starts the app: `npm run dev` once the `dev` script runs `nuxt-backend dev`. */
  start: string
}

/**
 * Declare `convex` in the app's own manifest when it is missing. It is this
 * package's peer dependency, so a package manager installs it anyway — but
 * `npx convex dev` reads the app's `package.json` and refuses to run until
 * the app lists it itself. Returns the range written, or `undefined` when
 * nothing needed doing.
 */
export function declareConvexDependency(rootDir: string): string | undefined {
  return declarePeer(rootDir, 'convex', 'dependencies')
}

/**
 * Declare the MCP SDK in the app's devDependencies when it is missing: an
 * optional peer, which no package manager installs on its own, and which
 * `npx nuxt-backend mcp` needs. Setup calls it whenever it writes the
 * server into `.mcp.json`.
 */
export function declareMcpSdkDependency(rootDir: string): string | undefined {
  return declarePeer(rootDir, MCP_SDK, 'devDependencies')
}

/**
 * Declare one of this package's peers in the app's manifest, under `field`,
 * unless the app lists it already. The range comes from the copy already
 * installed (a caret on its version, so nothing changes on the next
 * install), else from this package's peer range.
 */
function declarePeer(rootDir: string, name: string, field: 'dependencies' | 'devDependencies'): string | undefined {
  const manifestPath = join(rootDir, 'package.json')
  // One read: the same bytes decide, are parsed, and set the formatting.
  let source: string
  let manifest: Partial<Record<'dependencies' | 'devDependencies', Record<string, string>>>
  try {
    source = readFileSync(manifestPath, 'utf-8')
    manifest = JSON.parse(source) as typeof manifest
  }
  catch {
    // No manifest, or not JSON — nothing to declare into.
    return undefined
  }
  if (manifest.dependencies?.[name] || manifest.devDependencies?.[name]) return undefined

  let range: string | undefined
  try {
    const installed = JSON.parse(readFileSync(createRequire(manifestPath).resolve(`${name}/package.json`), 'utf-8')) as { version: string }
    range = `^${installed.version}`
  }
  catch {
    const own = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf-8')) as { peerDependencies?: Record<string, string> }
    range = own.peerDependencies?.[name]
  }
  if (!range) return undefined

  // Keys sorted like a package manager would write them, so the diff is
  // one line.
  const entries = Object.fromEntries(
    Object.entries({ ...manifest[field], [name]: range }).sort(([a], [b]) => a.localeCompare(b)),
  )
  const indent = /^(\s+)"/m.exec(source)?.[1] ?? '  '
  const eol = source.endsWith('\n') ? '\n' : ''
  writeFileSync(manifestPath, JSON.stringify({ ...manifest, [field]: entries }, null, indent) + eol)
  return range
}

/**
 * Set a project up, each file only when it needs it: the backend scaffold,
 * `.env.example`, the agent files (unless `agents` is false), `<NuxtPage />`
 * in an untouched starter root component, the `dev` script and the `convex`
 * dependency. A file that exists is never touched without `force`.
 */
export function setUpProject(rootDir: string, { force = false, agents = true, print }: { force?: boolean, agents?: boolean, print: (line: string) => void }): ProjectSetup {
  const created = scaffoldBackendFiles(rootDir, { force, log: print })
  if (writeEnvExample(rootDir, force, print)) created.push('.env.example')
  const appComponent = mountPagesInAppComponent(rootDir) ?? null
  if (appComponent) print(`[nuxt-backend] Replaced <NuxtWelcome /> with <NuxtLayout><NuxtPage /></NuxtLayout> in ${appComponent} so the module's pages render`)
  const layout = ensureDefaultLayout(rootDir)
  if (layout) {
    created.push(layout)
    print(`[nuxt-backend] Created ${layout}: <AppShell> around your pages, with the brand, the workspace switcher and the account menu`)
  }
  const agentFiles = agents ? setUpAgentFiles(rootDir, force, print) : null
  return { created, agentsMd: agentFiles?.agentsMd ?? null, mcpJson: agentFiles?.mcpJson ?? null, skills: agentFiles?.skills ?? null, appComponent, ...adoptProjectFiles(rootDir, print), mcpSdkDependency: agentFiles?.mcpSdkDependency ?? null }
}

/** `.env.example`, when there is none (or with `force`); whether it was written. */
function writeEnvExample(rootDir: string, force: boolean, print: (line: string) => void): boolean {
  const envExamplePath = join(rootDir, '.env.example')
  if (!force && existsSync(envExamplePath)) return false
  writeFileSync(envExamplePath, ENV_EXAMPLE)
  print('[nuxt-backend] Created .env.example')
  return true
}

/**
 * The agent files, for the version the app installed, with what each did
 * printed, and the MCP SDK the `.mcp.json` server needs declared. `init`
 * and `init --agents` both write them through here.
 */
export function setUpAgentFiles(rootDir: string, force: boolean, print: (line: string) => void) {
  const agentFiles = writeAgentFiles(rootDir, { force, version: installedVersion(rootDir) })
  for (const message of agentFiles.messages) print(`[nuxt-backend] ${message}`)
  const mcpSdkDependency = declareMcpSdkDependency(rootDir) ?? null
  if (mcpSdkDependency) print(`[nuxt-backend] Added ${MCP_SDK}@${mcpSdkDependency} to devDependencies (the nuxt-backend server in .mcp.json runs on it)`)
  return { ...agentFiles, mcpSdkDependency }
}

/** The edits to the app's own files: the `dev` script and the `convex` dependency. */
function adoptProjectFiles(rootDir: string, print: (line: string) => void): Pick<ProjectSetup, 'devScript' | 'convexDependency' | 'start'> {
  const devScript = adoptBackendDevScript(rootDir)
  if (devScript?.changed) {
    print(`[nuxt-backend] Set scripts.dev to \`${devScript.script}\`: one command sets up the deployment, provisions its env and runs Convex beside Nuxt`)
  }

  const convexDependency = declareConvexDependency(rootDir) ?? null
  if (convexDependency) {
    print(`[nuxt-backend] Added convex@${convexDependency} to dependencies (\`npx convex dev\` needs the app itself to declare it)`)
  }

  return {
    devScript: devScript?.changed ? devScript.script : null,
    convexDependency,
    start: devScript ? 'npm run dev' : 'npx nuxt-backend dev',
  }
}

/** Whether setup added a dependency to the manifest that an install still has to link. */
export function addedDependencies(setup: Partial<Pick<ProjectSetup, 'convexDependency' | 'mcpSdkDependency'>>): boolean {
  return Boolean(setup.convexDependency || setup.mcpSdkDependency)
}

/** The commands a set-up project runs next, in order: an install first when setup added a dependency and nothing linked it yet. */
export function nextCommands(setup: Pick<ProjectSetup, 'convexDependency' | 'start'> & Partial<Pick<ProjectSetup, 'mcpSdkDependency'>>, { installed = false } = {}): string[] {
  return [...addedDependencies(setup) && !installed ? ['npm install'] : [], setup.start]
}

/** The next steps, as `init` and the install step end with them. */
export function formatNextSteps(setup: Pick<ProjectSetup, 'convexDependency' | 'start'> & Partial<Pick<ProjectSetup, 'mcpSdkDependency'>>, { installed = false } = {}): string {
  const comment = (command: string, text: string) => `  ${command.padEnd(27)}# ${text}`
  const added = setup.convexDependency && setup.mcpSdkDependency
    ? 'convex and the MCP SDK, added above'
    : setup.convexDependency ? 'the convex dependency added above' : 'the MCP SDK added above'
  const install = addedDependencies(setup) && !installed ? [comment('npm install', `links ${added}`)] : []
  return [
    'Next steps:',
    ...install,
    comment(setup.start, 'the first run sets up your Convex dev deployment (log in'),
    comment('', 'when asked) and provisions its env, then runs Convex and Nuxt'),
    '  Sign in at /login: in development, the sign-in code prints in the same terminal.',
  ].join('\n')
}

/**
 * Install what the manifest declares, with the project's own package manager
 * (`npm`, `pnpm`, `yarn` or `bun`, each of which takes `install`): it links
 * the dependencies setup declared, at the ranges it wrote. Whether it
 * worked, never a throw: the next steps still name the install when it did
 * not.
 */
export function installDeclaredDependencies(rootDir: string, packageManager: string): boolean {
  const options: SpawnSyncOptions = { cwd: rootDir, shell: process.platform === 'win32', stdio: 'inherit' }
  // One literal command per package manager: nothing outside these four ever runs.
  switch (packageManager) {
    case 'npm': return spawnSync('npm', ['install'], options).status === 0
    case 'pnpm': return spawnSync('pnpm', ['install'], options).status === 0
    case 'yarn': return spawnSync('yarn', ['install'], options).status === 0
    case 'bun': return spawnSync('bun', ['install'], options).status === 0
    default: return false
  }
}
