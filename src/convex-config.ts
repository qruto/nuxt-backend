/**
 * The `convex-config` doctor check and its `--fix`: whether the app's
 * `convex.config.ts` mounts every component the scaffold mounts (and the
 * optional ones its backend code calls for), and its `http.ts` passes every
 * route group the scaffold passes to `registerBackendRoutes`, and its
 * `backend` mount forwards every env name the scaffold forwards. What
 * "every" means is read from the scaffold's own templates, so a component,
 * route or forwarded name a release adds to them is checked — and added by
 * `--fix` — without a list kept here.
 *
 * An app that predates a mount keeps working without it, until code uses the
 * component: so a missing mount warns, and fails only once a backend file
 * needs it. `--fix` parses the two files with magicast and inserts text at
 * the parsed positions, keeping everything else byte for byte (a BOM and
 * every line end included); it mounts only on a top-level `defineApp()`
 * variable, re-parses the result and refuses to write one that does not
 * come out as intended, and writes through a temporary file. A file that
 * does not parse is reported, never touched.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { REMOVED_ENV } from './env-registry'
import { finding, type PreflightFinding } from './findings'
import { resolveFunctionsDir } from './scaffold'
import { applyEdits, keyOf, type Magicast, type Node, parse, readSource, type SourceText, walk, writeSource } from './source-text'
import { BACKEND_FILE_TEMPLATES } from './templates'

/** One mount `convex.config.ts` should have: its import, its `app.use(…)` statement, and where it goes. */
interface ExpectedMount {
  /** The import source, `@convex-dev/aggregate/convex.config`. */
  from: string
  /** The name the scaffold binds it to, `aggregate`. */
  local: string
  /** The statement as the scaffold writes it, `app.use(aggregate)`. */
  statement: string
  /** Where the mounted identifier sits in `statement`, so another name can take its place. */
  argument: { start: number, end: number }
  /** The sources mounted before it, which a restored mount follows. */
  earlier: string[]
  /** The import (`<source>:<name>`) that makes an optional mount expected in a backend file; absent for the scaffold's own. */
  neededBy?: string
  /** The package an optional mount needs installed. */
  requires?: string
}

/** One route group of the scaffold's `registerBackendRoutes` call: its key, its value and the imports the value reads. */
interface ScaffoldRoute {
  key: string
  /** The property as the scaffold writes it, `ai` or `auth: { authComponent, createAuth, mcp }`. */
  property: string
  imports: Array<{ local: string, imported: string, from: string }>
}

/**
 * Components the scaffold leaves out but a backend file can ask for, by the
 * import that needs them: a file importing `Crons` from `@convex-dev/crons`
 * needs that component mounted (and installed), and so does one importing
 * the action cache, an aggregate or the migrations runner directly.
 */
const LAST_SCAFFOLD_MOUNT = '@convex-dev/workpool/convex.config'
const OPTIONAL_MOUNTS = [
  { from: '@convex-dev/action-cache/convex.config', local: 'actionCache', neededBy: '@convex-dev/action-cache:ActionCache', requires: '@convex-dev/action-cache', after: LAST_SCAFFOLD_MOUNT },
  { from: '@convex-dev/aggregate/convex.config', local: 'aggregate', neededBy: '@convex-dev/aggregate:TableAggregate', requires: '@convex-dev/aggregate', after: LAST_SCAFFOLD_MOUNT },
  { from: '@convex-dev/migrations/convex.config', local: 'migrations', neededBy: '@convex-dev/migrations:Migrations', requires: '@convex-dev/migrations', after: LAST_SCAFFOLD_MOUNT },
  { from: '@convex-dev/crons/convex.config', local: 'crons', neededBy: '@convex-dev/crons:Crons', requires: '@convex-dev/crons', after: LAST_SCAFFOLD_MOUNT },
] as const

/**
 * The scaffold mounts a package helper reads off the `components` object a
 * backend file passes it, by the import that calls it: a file importing
 * `setupRateLimiter` needs the `rateLimiter` mount as surely as one reading
 * `components.rateLimiter` does. Every helper that takes the whole
 * `components` object has a row, with each mount its components type reads.
 */
const HELPER_MOUNTS: Record<string, readonly string[]> = {
  'nuxt-backend/ai:setupAi': ['backend', 'persistentTextStreaming'],
  'nuxt-backend/billing:setupBilling': ['backend', 'polar'],
  'nuxt-backend/email:setupEmail': ['backend'],
  'nuxt-backend/functions:createFunctions': ['backend'],
  'nuxt-backend/rate-limit:setupRateLimiter': ['rateLimiter'],
  'nuxt-backend/workflows:setupWorkflows': ['workflow'],
}

/**
 * The comment that marks scaffold mounts an app left out on purpose, by the
 * scaffold's name for them: `// nuxt-backend-unmounted: aggregate`. Doctor
 * neither reports nor restores them.
 */
export const UNMOUNTED_MARKER = 'nuxt-backend-unmounted:'

/** What the app's two files lack, by the scaffold's measure. */
export interface ConvexConfigDrift {
  /** The functions directory, relative to the app root. */
  functionsDir: string
  /** Import sources of expected components `convex.config.ts` does not mount and `--fix` can add; every one when the file is missing. */
  missingMounts: string[]
  /** The names of those a backend file already needs, so the push fails without them. */
  usedButUnmounted: string[]
  /** Expected components `--fix` leaves alone, each with why. */
  blocked: Array<{ name: string, reason: string }>
  /**
   * Every expected component, in the scaffold's order, then every other one
   * the app mounts: its import source, its name (the identifier mounted, the
   * scaffold's for one that is missing), and whether it is mounted.
   */
  mounts: Array<{ from: string, name: string, mounted: boolean, scaffold: boolean }>
  /** Route groups the scaffold passes to `registerBackendRoutes` that `http.ts` does not. */
  missingRoutes: string[]
  /** Whether `http.ts` calls `registerBackendRoutes` at all: without the call there is nothing to check. */
  routerFound: boolean
  /**
   * Env names the scaffold forwards to the `backend` component that the
   * app's mount does not: an app without an `env` object on that mount
   * forwards on purpose, and is not checked.
   */
  missingForwards: string[]
  /**
   * Forwarded names the app's mount still carries that 0.2.0 removed
   * (`EMAIL_TEST_MODE`, `MONITORING_ENVIRONMENT`): the deployment declares
   * none of them any more, so the push fails on the line. `--fix` leaves the
   * app's own code alone: the line goes by hand.
   */
  staleForwards: string[]
  /** Files that could not be read as TypeScript, each with the parser's message. */
  unreadable: string[]
}

/** A `<object>.use(<identifier>, …)` call: the object's name and the identifier mounted. */
function useCall(node: Node): { app: string, local: string } | undefined {
  if (node.type !== 'CallExpression') return undefined
  const callee = node.callee as Node
  const [first] = node.arguments as Node[]
  const object = callee.object as Node | undefined
  const property = callee.property as Node | undefined
  if (callee.type !== 'MemberExpression' || object?.type !== 'Identifier' || property?.type !== 'Identifier' || property.name !== 'use') return undefined
  return first?.type === 'Identifier' ? { app: object.name as string, local: first.name as string } : undefined
}

/** A top-level `<app>.use(<identifier>, …)` statement's call. */
function mountOf(statement: Node): { app: string, local: string } | undefined {
  return statement.type === 'ExpressionStatement' ? useCall(statement.expression as Node) : undefined
}

/** Every identifier the program mounts anywhere: at the top level, in a branch, in a function. */
function mountedLocals(program: Node): Set<string> {
  const locals = new Set<string>()
  walk(program, (node) => {
    const call = useCall(node)
    if (call) locals.add(call.local)
  })
  return locals
}

/** The program's import bindings: local name → source. */
function importSources(program: Node): Map<string, string> {
  const sources = new Map<string, string>()
  for (const statement of program.body as Node[]) {
    if (statement.type !== 'ImportDeclaration') continue
    for (const specifier of statement.specifiers as Node[]) {
      sources.set((specifier.local as Node).name as string, (statement.source as Node).value as string)
    }
  }
  return sources
}

/** The names one top-level statement declares: a variable's, a function's or a class's. */
function declaredNames(statement: Node): string[] {
  const declaration = (statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement) as Node | null
  if (declaration?.type === 'VariableDeclaration') {
    return (declaration.declarations as Node[]).map(declarator => declarator.id as Node).filter(id => id.type === 'Identifier').map(id => id.name as string)
  }
  const id = (declaration?.type === 'FunctionDeclaration' || declaration?.type === 'ClassDeclaration') ? declaration.id as Node | null : null
  return id ? [id.name as string] : []
}

/** Every name the program binds at its top level: imports, variables, functions and classes. */
function topLevelNames(program: Node): Set<string> {
  return new Set([...importSources(program).keys(), ...(program.body as Node[]).flatMap(declaredNames)])
}

/**
 * The top-level variable `defineApp()` is assigned to, and the index of its
 * statement: where a mount added at the top level can see it. `undefined`
 * when the app is built anywhere else (in a function, a branch).
 */
function topLevelApp(program: Node): { name: string, index: number } | undefined {
  const body = program.body as Node[]
  for (const [index, statement] of body.entries()) {
    const declaration = (statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement) as Node | null
    if (declaration?.type !== 'VariableDeclaration') continue
    for (const declarator of declaration.declarations as Node[]) {
      const init = declarator.init as Node | undefined
      const id = declarator.id as Node
      if (init?.type === 'CallExpression' && (init.callee as Node).type === 'Identifier' && (init.callee as Node).name === 'defineApp' && id.type === 'Identifier') {
        return { name: id.name as string, index }
      }
    }
  }
  return undefined
}

/** The identifiers top-level `<app>.use(…)` statements mount after the app's declaration. */
function topLevelMounts(program: Node, app: { name: string, index: number }): Set<string> {
  const locals = new Set<string>()
  for (const statement of (program.body as Node[]).slice(app.index + 1)) {
    const mount = mountOf(statement)
    if (mount?.app === app.name) locals.add(mount.local)
  }
  return locals
}

/** Whether `name` occurs in `text` as a whole identifier (or member path), not inside a longer one. */
function hasIdentifier(text: string, name: string): boolean {
  const isPart = (char: string | undefined) => char !== undefined && /[\w$]/.test(char)
  for (let at = text.indexOf(name); at >= 0; at = text.indexOf(name, at + 1)) {
    if (!isPart(text[at - 1]) && !isPart(text[at + name.length])) return true
  }
  return false
}

/** The source text of a node, from the code it was parsed from. */
function textOf(code: string, node: Node): string {
  return code.slice(node.start as number, node.end as number)
}

/** The scaffold's mounts, read from its `convex.config.ts` template. */
function scaffoldMounts(magicast: Magicast): ExpectedMount[] {
  const code = BACKEND_FILE_TEMPLATES['convex.config.ts']!
  const program = magicast.parseModule(code).$ast as unknown as Node
  const sources = importSources(program)
  const mounts: ExpectedMount[] = []
  for (const statement of program.body as Node[]) {
    const mount = mountOf(statement)
    const from = mount && sources.get(mount.local)
    if (!mount || !from) continue
    const argument = ((statement.expression as Node).arguments as Node[])[0]!
    const start = statement.start as number
    const range = { start: (argument.start as number) - start, end: (argument.end as number) - start }
    mounts.push({ from, local: mount.local, statement: textOf(code, statement), argument: range, earlier: mounts.map(entry => entry.from) })
  }
  return mounts
}

/**
 * What the backend's own files use, read from their syntax: the imports
 * (`<source>:<name>`), and the `components.<name>` they read, directly or
 * through a package helper ({@link HELPER_MOUNTS}).
 */
interface BackendUsage {
  imports: Set<string>
  components: Set<string>
}

/** Every source file under `dir`, generated code and dependencies aside. */
function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '_generated' || entry.name === 'node_modules' || entry.name.startsWith('.')) return []
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.[cm]?[jt]s$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : []
  })
}

/** The `<source>:<name>` of every name a program imports. */
function importedNames(program: Node): string[] {
  return (program.body as Node[]).filter(statement => statement.type === 'ImportDeclaration').flatMap(statement =>
    (statement.specifiers as Node[]).map((specifier) => {
      const imported = specifier.imported as Node | undefined
      const name = specifier.type === 'ImportSpecifier' ? (imported?.name ?? imported?.value) : 'default'
      return `${(statement.source as Node).value as string}:${name as string}`
    }))
}

/** The `<name>` of every `components.<name>` a program reads. */
function componentReads(program: Node): string[] {
  const names: string[] = []
  walk(program, (node) => {
    const object = node.object as Node | undefined
    const property = node.property as Node | undefined
    if (node.type === 'MemberExpression' && !node.computed && object?.type === 'Identifier' && object.name === 'components' && property?.type === 'Identifier') {
      names.push(property.name as string)
    }
  })
  return names
}

/** What the backend's files use (`convex.config.ts` aside). A file that does not parse uses nothing. */
function backendUsage(magicast: Magicast, rootDir: string, functionsDir: string): BackendUsage {
  const usage: BackendUsage = { imports: new Set(), components: new Set() }
  const dir = join(rootDir, functionsDir)
  for (const file of sourceFiles(dir).filter(path => path !== join(dir, 'convex.config.ts'))) {
    const program = parse(magicast, readFileSync(file, 'utf-8'))
    if (typeof program === 'string') continue
    for (const name of importedNames(program)) usage.imports.add(name)
    for (const name of componentReads(program)) usage.components.add(name)
  }
  for (const [helper, mounts] of Object.entries(HELPER_MOUNTS)) {
    if (usage.imports.has(helper)) for (const mount of mounts) usage.components.add(mount)
  }
  return usage
}

/** Whether `pkg` resolves from the app's root, as Convex's bundler would find it. */
function installed(rootDir: string, pkg: string): boolean {
  try {
    createRequire(join(rootDir, 'package.json')).resolve(`${pkg}/package.json`)
    return true
  }
  catch {
    return false
  }
}

/** The mounts `convex.config.ts` should have: the scaffold's, then each optional one a backend file imports what needs. */
function expectedMounts(magicast: Magicast, usage: BackendUsage): ExpectedMount[] {
  const mounts = scaffoldMounts(magicast)
  for (const optional of OPTIONAL_MOUNTS) {
    if (!usage.imports.has(optional.neededBy)) continue
    const statement = `app.use(${optional.local})`
    const earlier = mounts.slice(0, mounts.findIndex(mount => mount.from === optional.after) + 1).map(mount => mount.from)
    mounts.push({ from: optional.from, local: optional.local, statement, argument: { start: 8, end: 8 + optional.local.length }, earlier, neededBy: optional.neededBy, requires: optional.requires })
  }
  return mounts
}

/** The scaffold names an app marked as left out on purpose (`// nuxt-backend-unmounted: a, b`). */
function unmountedOnPurpose(code: string): Set<string> {
  const names = new Set<string>()
  for (const line of code.split('\n')) {
    const at = line.indexOf(UNMOUNTED_MARKER)
    if (at < 0) continue
    for (const name of line.slice(at + UNMOUNTED_MARKER.length).split(',')) {
      if (name.trim()) names.add(name.trim())
    }
  }
  return names
}

/** Why `--fix` cannot add `mount`, or `undefined` when it can. */
function blockedReason(mount: ExpectedMount, context: { sources: Map<string, string>, mounted: Set<string>, app: unknown, rootDir: string }): string | undefined {
  const { sources, mounted } = context
  if (mount.requires && !installed(context.rootDir, mount.requires)) return `needs ${mount.requires}, which is not installed: install it (\`npm install ${mount.requires}\`), then run doctor --fix again`
  if (!context.app) return 'has no top-level `const app = defineApp()` to mount on, so the mount is ambiguous: mount it by hand'
  const imported = [...sources].find(([, from]) => from === mount.from)?.[0]
  if (imported) return `imports it as ${imported} but no \`use(${imported})\` was found; mount it yourself, or remove the import`
  const other = sources.get(mount.local)
  if (other && mounted.has(mount.local)) return `mounts a ${mount.local} from ${other}; if that is the same component, mark it with \`// ${UNMOUNTED_MARKER} ${mount.local}\``
  return undefined
}

/** The `registerBackendRoutes(http, { … })` call's options of a program, by the name it imports it under. */
function routerCall(program: Node): Node | undefined {
  const local = [...importSources(program)].find(([, from]) => from === 'nuxt-backend/http')?.[0] ?? 'registerBackendRoutes'
  let found: Node | undefined
  walk(program, (node) => {
    if (found || node.type !== 'CallExpression' || (node.callee as Node).type !== 'Identifier' || (node.callee as Node).name !== local) return
    const options = (node.arguments as Node[])[1]
    if (options?.type === 'ObjectExpression') found = options
  })
  return found
}

/** The scaffold's route groups, read from its `http.ts` template. */
function scaffoldRoutes(magicast: Magicast): ScaffoldRoute[] {
  const code = BACKEND_FILE_TEMPLATES['http.ts']!
  const program = magicast.parseModule(code).$ast as unknown as Node
  const named = (program.body as Node[]).filter(statement => statement.type === 'ImportDeclaration').flatMap(statement =>
    (statement.specifiers as Node[]).map(specifier => ({
      local: (specifier.local as Node).name as string,
      imported: specifier.type === 'ImportDefaultSpecifier' ? 'default' : ((specifier.imported as Node).name as string),
      from: (statement.source as Node).value as string,
    })))
  const options = routerCall(program)
  if (!options) return []
  return (options.properties as Node[]).flatMap((property) => {
    const key = keyOf(property)
    if (!key) return []
    const text = textOf(code, property)
    return [{ key, property: text, imports: named.filter(entry => entry.from.startsWith('./') && hasIdentifier(text, entry.local)) }]
  })
}

/** The package's own component, as `convex.config.ts` imports it. */
const BACKEND_COMPONENT = 'nuxt-backend/convex.config'

/**
 * The `env` object of the `<app>.use(<backend>, { env: { … } })` mount of
 * a program, and the app's name; `undefined` without one.
 */
function backendForwards(program: Node): { env: Node, app: string } | undefined {
  const local = [...importSources(program)].find(([, from]) => from === BACKEND_COMPONENT)?.[0]
  if (!local) return undefined
  let found: { env: Node, app: string } | undefined
  walk(program, (node) => {
    const call = useCall(node)
    if (found || call?.local !== local) return
    const options = (node.arguments as Node[])[1]
    const env = options?.type === 'ObjectExpression' ? (options.properties as Node[]).find(property => keyOf(property) === 'env')?.value as Node | undefined : undefined
    if (env?.type === 'ObjectExpression') found = { env, app: call.app }
  })
  return found
}

/** The env names the scaffold forwards to the `backend` component, in its order, each with its property as written. */
function scaffoldForwards(magicast: Magicast): Array<{ key: string, property: string }> {
  const code = BACKEND_FILE_TEMPLATES['convex.config.ts']!
  const forwards = backendForwards(magicast.parseModule(code).$ast as unknown as Node)
  return ((forwards?.env.properties as Node[] | undefined) ?? []).flatMap((property) => {
    const key = keyOf(property)
    return key ? [{ key, property: textOf(code, property) }] : []
  })
}

/** The forwarded names the app's mount lacks, by the scaffold's; none when it forwards no `env` object. */
function forwardDrift(magicast: Magicast, program: Node | undefined): string[] {
  const forwards = program ? backendForwards(program) : undefined
  if (!forwards) return []
  const present = new Set((forwards.env.properties as Node[]).map(keyOf))
  return scaffoldForwards(magicast).map(entry => entry.key).filter(key => !present.has(key))
}

/** The forwarded names the app's mount carries that a release removed; none when it forwards no `env` object. */
function staleDrift(program: Node | undefined): string[] {
  const forwards = program ? backendForwards(program) : undefined
  if (!forwards) return []
  return (forwards.env.properties as Node[]).map(keyOf).filter((key): key is string => key !== undefined && key in REMOVED_ENV)
}

/** The forwarded names `convex.config.ts` at `path` lacks, and those it carries that a release removed; none when it is missing or does not parse. */
function configForwards(magicast: Magicast, path: string): { missing: string[], stale: string[] } {
  if (!existsSync(path)) return { missing: [], stale: [] }
  const program = parse(magicast, readSource(path).code)
  return typeof program === 'string' ? { missing: [], stale: [] } : { missing: forwardDrift(magicast, program), stale: staleDrift(program) }
}

/** What `convex.config.ts` mounts against what it should, or why it could not be read. */
type MountDrift
  = | { unreadable: string }
    | { unreadable?: undefined, missing: ExpectedMount[], used: ExpectedMount[], blocked: ConvexConfigDrift['blocked'], mounts: ConvexConfigDrift['mounts'] }

/** What `convex.config.ts` mounts against what it should: see {@link ConvexConfigDrift}. */
function mountDrift(magicast: Magicast, code: string | undefined, usage: BackendUsage, rootDir: string): MountDrift {
  const expected = expectedMounts(magicast, usage)
  const program = code === undefined ? undefined : parse(magicast, code)
  if (typeof program === 'string') return { unreadable: program }
  const sources = program ? importSources(program) : new Map<string, string>()
  const mounted = program ? mountedLocals(program) : new Set<string>()
  const optOut = unmountedOnPurpose(code ?? '')
  const mountedFrom = new Map([...mounted].flatMap(local => sources.has(local) ? [[sources.get(local)!, local] as const] : []))
  const absent = expected.filter(mount => !mountedFrom.has(mount.from) && !optOut.has(mount.local))
  const context = { sources, mounted, app: program ? topLevelApp(program) : true, rootDir }
  const blocked = absent.flatMap(mount => (reason => reason ? [{ name: mount.local, reason }] : [])(blockedReason(mount, context)))
  const missing = absent.filter(mount => !blocked.some(entry => entry.name === mount.local))
  const used = absent.filter(mount => mount.neededBy || usage.components.has(mount.local))
  const expectedFrom = new Set(expected.map(mount => mount.from))
  const mounts = [
    ...expected.map(mount => ({ from: mount.from, name: mountedFrom.get(mount.from) ?? mount.local, mounted: mountedFrom.has(mount.from), scaffold: !mount.neededBy })),
    ...[...mountedFrom].filter(([from]) => !expectedFrom.has(from)).map(([from, name]) => ({ from, name, mounted: true, scaffold: false })),
  ]
  return { missing, used, blocked, mounts }
}

/**
 * Compare the app's `convex.config.ts` and `http.ts` with the scaffold's.
 * Missing files count as missing everything they hold; `doctor --fix`
 * restores them first. Never throws on what the files hold: a file that
 * does not parse is listed in `unreadable`.
 */
export async function readConvexConfigDrift(rootDir: string): Promise<ConvexConfigDrift> {
  const magicast = await import('magicast')
  const functionsDir = resolveFunctionsDir(rootDir)
  const configPath = join(rootDir, functionsDir, 'convex.config.ts')
  const httpPath = join(rootDir, functionsDir, 'http.ts')
  const mounts = mountDrift(magicast, existsSync(configPath) ? readSource(configPath).code : undefined, backendUsage(magicast, rootDir, functionsDir), rootDir)
  const unreadable = mounts.unreadable !== undefined ? [`${functionsDir}/convex.config.ts: ${mounts.unreadable}`] : []
  const http = existsSync(httpPath) ? parse(magicast, readSource(httpPath).code) : undefined
  if (typeof http === 'string') unreadable.push(`${functionsDir}/http.ts: ${http}`)
  const options = http && typeof http !== 'string' ? routerCall(http) : undefined
  const forwards = mounts.unreadable === undefined ? configForwards(magicast, configPath) : { missing: [], stale: [] }
  const present = new Set((options?.properties as Node[] | undefined ?? []).map(keyOf))
  return {
    functionsDir,
    missingMounts: mounts.unreadable === undefined ? mounts.missing.map(mount => mount.from) : [],
    usedButUnmounted: mounts.unreadable === undefined ? mounts.used.map(mount => mount.local) : [],
    blocked: mounts.unreadable === undefined ? mounts.blocked : [],
    mounts: mounts.unreadable === undefined ? mounts.mounts : [],
    missingRoutes: options ? scaffoldRoutes(magicast).map(route => route.key).filter(key => !present.has(key)) : [],
    routerFound: options !== undefined,
    missingForwards: forwards.missing,
    staleForwards: forwards.stale,
    unreadable,
  }
}

/** The finding for a drift with nothing missing. */
function passing(drift: ConvexConfigDrift): PreflightFinding {
  return finding('convex-config', 'pass', drift.routerFound
    ? 'Every component the scaffold mounts is mounted, and every route group is registered.'
    : `Every component the scaffold mounts is mounted (${drift.functionsDir}/http.ts does not call registerBackendRoutes, so its routes are yours to check).`)
}

/**
 * What to do about a drift: `--fix` adds what is missing, and deletes a
 * forward 0.2.0 removed when it is the scaffold's own line
 * (`NAME: app.env.NAME`); one the app wrote another way goes by hand.
 */
function convexConfigFixHint(drift: ConvexConfigDrift, { fixable, onlyStale }: { fixable: boolean, onlyStale: boolean }): string {
  const stale = drift.staleForwards.join(', ')
  if (fixable) {
    return `Run \`npx nuxt-backend doctor --fix\` to add them${stale ? ` and delete the forwarded ${stale}` : ''}; mark a component you left out on purpose with \`// ${UNMOUNTED_MARKER} <name>\`.`
  }
  if (stale && onlyStale) return `Run \`npx nuxt-backend doctor --fix\` to delete the ${stale} line${drift.staleForwards.length > 1 ? 's' : ''} from the backend mount; a forward written another way than \`NAME: app.env.NAME\` is yours to delete.`
  return 'Resolve it by hand: doctor --fix will not guess.'
}

/** The `convex-config` finding for the app in `rootDir`. */
export async function convexConfigFinding(rootDir: string): Promise<PreflightFinding> {
  const drift = await readConvexConfigDrift(rootDir)
  const { functionsDir } = drift
  if (drift.unreadable.length > 0) {
    return finding('convex-config', 'warn', `Could not check the mounts and routes: ${drift.unreadable.join('; ')}.`, 'Fix the syntax error, then run doctor again; --fix leaves a file it cannot parse alone.')
  }
  const missing = drift.mounts.filter(mount => drift.missingMounts.includes(mount.from)).map(mount => mount.name)
  const gaps = [
    ...missing.length ? [`${functionsDir}/convex.config.ts does not mount ${missing.join(', ')}`] : [],
    ...drift.missingRoutes.length ? [`${functionsDir}/http.ts passes no ${drift.missingRoutes.join(', ')} to registerBackendRoutes`] : [],
    ...drift.missingForwards.length ? [`${functionsDir}/convex.config.ts does not forward ${drift.missingForwards.join(', ')} to the backend component`] : [],
    ...drift.staleForwards.length ? [`${functionsDir}/convex.config.ts still forwards ${drift.staleForwards.join(', ')}, which 0.2.0 removed (BACKEND_ENVIRONMENT replaces them)`] : [],
    ...drift.blocked.map(entry => `${entry.name} is left alone: ${functionsDir}/convex.config.ts ${entry.reason}`),
  ]
  if (gaps.length === 0) return passing(drift)
  const fixHint = convexConfigFixHint(drift, { fixable: Boolean(missing.length || drift.missingRoutes.length || drift.missingForwards.length), onlyStale: gaps.length === 1 })
  if (drift.usedButUnmounted.length > 0) {
    return finding('convex-config', 'fail', `${gaps.join('; ')} — and ${drift.usedButUnmounted.join(', ')} is needed by a backend file, so the push fails.`, fixHint)
  }
  if (drift.staleForwards.length > 0) {
    return finding('convex-config', 'fail', `${gaps.join('; ')}: the push fails on a name the deployment no longer declares.`, fixHint)
  }
  return finding('convex-config', 'warn', `${gaps.join('; ')}: the features that need them stay off until they are added.`, fixHint)
}

/** A local name free in `bindings`: `name`, else `name` with a numeric suffix. */
function freeName(name: string, bindings: Set<string>): string {
  if (!bindings.has(name)) return name
  let index = 2
  while (bindings.has(`${name}${index}`)) index++
  return `${name}${index}`
}

/** The index of the last element `matches` accepts, or -1. */
function lastIndex<T>(items: T[], matches: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index--) {
    if (matches(items[index]!)) return index
  }
  return -1
}

/** Text to insert at an offset of the original code. */
interface Insertion {
  at: number
  text: string
}

/**
 * Apply insertions to `code`. Offsets are the original code's; several at
 * one offset land in the order they were made.
 */
function applyInsertions(source: SourceText, insertions: Insertion[]): string {
  return applyEdits(source, insertions.map(({ at, text }) => ({ start: at, end: at, text })))
}

/** Where the line `offset` is on ends: before its line break, a CRLF's `\r` included. */
function lineEndAt(code: string, offset: number): number {
  const newline = code.indexOf('\n', offset)
  if (newline < 0) return code.length
  return code[newline - 1] === '\r' && newline - 1 >= offset ? newline - 1 : newline
}

/**
 * Where a line inserted after a node goes: past a comment that ends the
 * node's line, so the comment stays with the line it annotates.
 */
function afterLine(code: string, offset: number): number {
  const lineEnd = lineEndAt(code, offset)
  return /^\s*(?:;\s*)?(?:\/\/.*|\/\*.*\*\/\s*)?$/.test(code.slice(offset, lineEnd)) ? lineEnd : offset
}

/**
 * A new line after the line `offset` is on (past a comment ending it):
 * inserted at the start of the next line, so the line break it ends with,
 * CRLF or LF, stays with that line. At the end of a file without a final
 * line break, it is added before the new line instead.
 */
function lineAfter(code: string, offset: number, line: string): Insertion {
  const end = afterLine(code, offset)
  return code[end] === '\n' ? { at: end + 1, text: `${line}\n` } : { at: end, text: `\n${line}` }
}

/** How the file writes a statement's end: a semicolon when most of its lines end in one. */
function statementEnd(magicast: Magicast, code: string): string {
  return magicast.detectCodeFormat(code).useSemi ? ';' : ''
}

/** `import <specifier> from '<from>'`, in the file's quotes. */
function importLine(magicast: Magicast, code: string, specifier: string, from: string): string {
  const quote = magicast.detectCodeFormat(code).quote === 'double' ? '"' : '\''
  return `import ${specifier} from ${quote}${from}${quote}${statementEnd(magicast, code)}`
}

/** Where a restored import goes: after the import of an `earlier` source, else after the last import, else first. */
function importInsertion(code: string, body: Node[], earlier: Set<string>, line: string): Insertion {
  const after = lastIndex(body, node => node.type === 'ImportDeclaration' && earlier.has((node.source as Node).value as string))
  const anchor = after >= 0 ? after : lastIndex(body, node => node.type === 'ImportDeclaration')
  return anchor < 0 ? { at: 0, text: `${line}\n` } : lineAfter(code, body[anchor]!.end as number, line)
}

/**
 * Where a restored `app.use(…)` goes: after an `earlier` top-level mount
 * of the app, else after its last one, else right after the app's
 * declaration, so the app is always in scope.
 */
function mountInsertion(code: string, body: Node[], sources: Map<string, string>, app: { name: string, index: number }, earlier: Set<string>, statement: string): Insertion {
  const ofApp = (node: Node, index: number) => index > app.index && mountOf(node)?.app === app.name
  let anchor = lastIndex(body.map((node, index) => ({ node, index })), ({ node, index }) => ofApp(node, index) && earlier.has(sources.get(mountOf(node)!.local) ?? ''))
  if (anchor < 0) anchor = lastIndex(body.map((node, index) => ({ node, index })), ({ node, index }) => ofApp(node, index))
  if (anchor < 0) anchor = app.index
  return lineAfter(code, body[anchor]!.end as number, statement)
}

/**
 * Add the missing mounts to `convex.config.ts`: each import after the
 * import of the mount the scaffold lists before it, and each `app.use(…)`
 * after that mount's, so an untouched file comes out as the scaffold writes
 * it. The rest of the file is kept byte for byte. Returns the new code and
 * the components added.
 */
function addMounts(magicast: Magicast, source: SourceText, missing: ExpectedMount[]): { code: string, added: string[] } {
  const { code } = source
  const program = magicast.parseModule(code).$ast as unknown as Node
  const body = program.body as Node[]
  const sources = importSources(program)
  const bindings = topLevelNames(program)
  const app = topLevelApp(program)
  if (!app) return { code: source.raw, added: [] }
  const insertions: Insertion[] = []
  const added: string[] = []
  for (const mount of missing) {
    const earlier = new Set(mount.earlier)
    const local = freeName(mount.local, bindings)
    bindings.add(local)
    insertions.push(importInsertion(code, body, earlier, importLine(magicast, code, local, mount.from)))
    const { start, end } = mount.argument
    const statement = `${mount.statement.slice(0, start)}${local}${mount.statement.slice(end)}`.replace(/\bapp\./g, `${app.name}.`) + statementEnd(magicast, code)
    insertions.push(mountInsertion(code, body, sources, app, earlier, statement))
    added.push(local)
  }
  return { code: applyInsertions(source, insertions), added }
}

/** The whitespace a line starts with, for the line `offset` is on. */
function indentAt(code: string, offset: number): string {
  const lineStart = code.lastIndexOf('\n', offset - 1) + 1
  return /^[\t ]*/.exec(code.slice(lineStart))![0]
}

/** Where an import goes among `imports` so their sources keep the scaffold's `order`. */
function orderedImportInsertion(code: string, imports: Node[], order: string[], from: string, line: string): Insertion {
  const rank = order.indexOf(from)
  const rankOf = (node: Node) => order.indexOf((node.source as Node).value as string)
  const after = lastIndex(imports, node => rankOf(node) >= 0 && rankOf(node) < rank)
  const before = imports.find(node => rankOf(node) > rank)
  if (after >= 0) return lineAfter(code, imports[after]!.end as number, line)
  if (before) return { at: before.start as number, text: `${line}\n` }
  return imports.length > 0 ? lineAfter(code, imports.at(-1)!.end as number, line) : { at: 0, text: `${line}\n` }
}

/**
 * Where a route group goes in the options object: on a line of its own
 * after an `earlier` group (past a comment ending that group's line), else
 * first, at their indent.
 */
function propertyInsertions(code: string, options: Node, earlier: Set<string>, property: string): Insertion[] {
  const properties = options.properties as Node[]
  const anchor = lastIndex(properties, node => earlier.has(keyOf(node) ?? ''))
  if (anchor >= 0) {
    const node = properties[anchor]!
    const indent = indentAt(code, node.start as number)
    const lineEnd = lineEndAt(code, node.end as number)
    if (!/^\s*(?:,\s*)?(?:\/\/.*|\/\*.*\*\/\s*)?$/.test(code.slice(node.end as number, lineEnd))) {
      return [{ at: node.end as number, text: `,\n${indent}${property}` }]
    }
    const comma = /^\s*,/.test(code.slice(node.end as number, lineEnd))
    return [...comma ? [] : [{ at: node.end as number, text: ',' }], lineAfter(code, lineEnd, `${indent}${property}${comma ? ',' : ''}`)]
  }
  const first = properties[0]
  if (first) return [{ at: first.start as number, text: `${property},\n${indentAt(code, first.start as number)}` }]
  const indent = indentAt(code, options.start as number)
  return [{ at: (options.start as number) + 1, text: `\n${indent}  ${property},\n${indent}` }]
}

/**
 * Add the missing route groups to `registerBackendRoutes`, each after the
 * group the scaffold lists before it, with the imports they read, placed
 * among the file's imports in the scaffold's order. Returns the new code
 * and the groups added.
 */
function addRoutes(magicast: Magicast, source: SourceText, missing: string[]): { code: string, added: string[] } {
  const { code } = source
  const program = magicast.parseModule(code).$ast as unknown as Node
  const options = routerCall(program)
  if (!options) return { code: source.raw, added: [] }
  const imports = (program.body as Node[]).filter(node => node.type === 'ImportDeclaration')
  const bindings = topLevelNames(program)
  const order = scaffoldRoutes(magicast)
  // The scaffold's own import order, which a restored import follows.
  const importOrder = [...importSources(magicast.parseModule(BACKEND_FILE_TEMPLATES['http.ts']!).$ast as unknown as Node).values()]
  const insertions: Insertion[] = []
  const added: string[] = []
  for (const [position, route] of order.entries()) {
    if (!missing.includes(route.key)) continue
    for (const entry of route.imports.filter(item => !bindings.has(item.local))) {
      bindings.add(entry.local)
      const specifier = entry.imported === 'default' ? entry.local : `{ ${entry.imported === entry.local ? entry.local : `${entry.imported} as ${entry.local}`} }`
      insertions.push(orderedImportInsertion(code, imports, importOrder, entry.from, importLine(magicast, code, specifier, entry.from)))
    }
    insertions.push(...propertyInsertions(code, options, new Set(order.slice(0, position).map(entry => entry.key)), route.property))
    added.push(route.key)
  }
  return { code: applyInsertions(source, insertions), added }
}

/** Fix `convex.config.ts` if it needs it; returns the change line, or why it was left alone. */
function fixMounts(magicast: Magicast, path: string, label: string, usage: BackendUsage, rootDir: string): string[] {
  const source = readSource(path)
  const drift = mountDrift(magicast, source.code, usage, rootDir)
  if (drift.unreadable !== undefined || drift.missing.length === 0) return []
  const { code, added } = addMounts(magicast, source, drift.missing)
  // Verify the edit: it parses, and each new mount is a top-level use of the
  // app, after its declaration, of a binding imported from the right source.
  const program = parse(magicast, code)
  const app = typeof program === 'string' ? undefined : topLevelApp(program)
  const sources = typeof program === 'string' ? new Map<string, string>() : importSources(program)
  const mountedHere = typeof program === 'string' || !app ? new Set<string>() : topLevelMounts(program, app)
  const missed = drift.missing.filter((mount, index) => !mountedHere.has(added[index] ?? '') || sources.get(added[index] ?? '') !== mount.from).map(mount => mount.local)
  if (missed.length > 0) return [`${label}: left as it is — the edit did not come out mounting ${missed.join(', ')}; add them by hand`]
  writeSource(path, source, code)
  return [`${label}: mounted ${added.join(', ')}`]
}

/** `convex.config.ts` at `path`, parsed, with the `backend` mount's `env` object; `null` when it does not parse. */
function readForwards(magicast: Magicast, path: string): { source: SourceText, program: Node, forwards: ReturnType<typeof backendForwards> } | null {
  const source = readSource(path)
  const program = parse(magicast, source.code)
  return typeof program === 'string' ? null : { source, program, forwards: backendForwards(program) }
}

/**
 * Forward the env names the `backend` mount lacks, each after the name the
 * scaffold forwards before it, on the app's own name. Re-parses the edit and
 * leaves the file alone when it does not come out forwarding them.
 */
function fixForwards(magicast: Magicast, path: string, label: string): string[] {
  const read = readForwards(magicast, path)
  if (!read) return []
  const { source, program, forwards } = read
  const missing = forwardDrift(magicast, program)
  if (!forwards || missing.length === 0) return []
  const order = scaffoldForwards(magicast)
  const insertions: Insertion[] = []
  for (const [position, entry] of order.entries()) {
    if (!missing.includes(entry.key)) continue
    const property = entry.property.replace(/\bapp\./g, `${forwards.app}.`)
    insertions.push(...propertyInsertions(source.code, forwards.env, new Set(order.slice(0, position).map(item => item.key)), property))
  }
  const code = applyInsertions(source, insertions)
  const edited = parse(magicast, code.replace(/\r\n/g, '\n'))
  const left = typeof edited === 'string' ? missing : forwardDrift(magicast, edited)
  if (left.length > 0) return [`${label}: left as it is — the edit did not come out forwarding ${missing.join(', ')}; add them by hand`]
  writeSource(path, source, code)
  return [`${label}: forwarded ${missing.join(', ')}`]
}

/**
 * The span a deleted property takes: its whole line when it is alone on it
 * (a comment that ends the line goes with it), else the property and the
 * comma beside it.
 */
function propertySpan(code: string, property: Node): { start: number, end: number } {
  const start = property.start as number
  const end = property.end as number
  const lineStart = code.lastIndexOf('\n', start - 1) + 1
  const lineEnd = lineEndAt(code, end)
  const after = code.slice(end, lineEnd)
  if (/^\s*$/.test(code.slice(lineStart, start)) && /^\s*(?:,\s*)?(?:\/\/.*)?$/.test(after)) {
    const newline = code.indexOf('\n', lineEnd)
    return { start: lineStart, end: newline < 0 ? code.length : newline + 1 }
  }
  const comma = /^\s*,\s*/.exec(after)
  if (comma) return { start, end: end + comma[0].length }
  const before = /,\s*$/.exec(code.slice(0, start))
  return { start: before ? start - before[0].length : start, end }
}

/**
 * Delete the forwards 0.2.0 removed from the `backend` mount, each only when
 * it is the scaffold's own line (`NAME: app.env.NAME`, on the app's name): a
 * forward the app wrote another way is its owner's. Re-parses the edit and
 * leaves the file alone when it does not come out without them.
 */
function fixStaleForwards(magicast: Magicast, path: string, label: string): string[] {
  const read = readForwards(magicast, path)
  if (!read?.forwards) return []
  const { source, program, forwards } = read
  const exact = (forwards.env.properties as Node[]).filter((property) => {
    const key = keyOf(property)
    return key !== undefined && key in REMOVED_ENV
      && textOf(source.code, property.value as Node).replace(/\s+/g, '') === `${forwards.app}.env.${key}`
  })
  const removed = exact.map(property => keyOf(property)!)
  const kept = staleDrift(program).filter(key => !removed.includes(key))
  const leftNote = kept.length > 0 ? [`${label}: left the forwarded ${kept.join(', ')} as it is — written another way than NAME: app.env.NAME; delete it by hand`] : []
  if (removed.length === 0) return leftNote
  const code = applyEdits(source, exact.map(property => ({ ...propertySpan(source.code, property), text: '' })))
  const edited = parse(magicast, code.replace(/\r\n/g, '\n'))
  const left = typeof edited === 'string' ? removed : staleDrift(edited).filter(key => removed.includes(key))
  if (left.length > 0) return [`${label}: left as it is — the edit did not come out without ${removed.join(', ')}; delete them by hand`]
  writeSource(path, source, code)
  return [`${label}: deleted the forwarded ${removed.join(', ')}, which 0.2.0 removed`, ...leftNote]
}

/** Fix `http.ts` if it needs it; returns the change line, or why it was left alone. */
function fixRoutes(magicast: Magicast, path: string, label: string, missing: string[]): string[] {
  const source = readSource(path)
  const { code, added } = addRoutes(magicast, source, missing)
  if (added.length === 0) return []
  const program = parse(magicast, code)
  const options = typeof program === 'string' ? undefined : routerCall(program)
  const keys = new Set((options?.properties as Node[] | undefined ?? []).map(keyOf))
  const missed = added.filter(key => !keys.has(key))
  if (!options || missed.length > 0) return [`${label}: left as it is — the edit did not come out registering ${added.join(', ')}; add them by hand`]
  writeSource(path, source, code)
  return [`${label}: registered ${added.join(', ')}`]
}

/**
 * `doctor --fix` for `convex-config`: add the missing mounts and forwarded
 * env names to `convex.config.ts`, delete the forwards 0.2.0 removed where
 * they are the scaffold's own lines, and add the missing route groups to
 * `http.ts`. Run it after
 * the scaffold restored any missing file, so every import it adds resolves.
 * A file that does not parse, or whose edit does not re-parse to what was
 * intended, is left as it is. Returns a line per change or refusal, for the
 * repair's progress output.
 */
export async function fixConvexConfig(rootDir: string): Promise<string[]> {
  const magicast = await import('magicast')
  const drift = await readConvexConfigDrift(rootDir)
  const { functionsDir } = drift
  if (drift.unreadable.length > 0) return drift.unreadable.map(entry => `${entry.split(':')[0]}: left as it is — it does not parse`)
  const configPath = join(rootDir, functionsDir, 'convex.config.ts')
  const httpPath = join(rootDir, functionsDir, 'http.ts')
  const mounted = drift.missingMounts.length > 0 && existsSync(configPath)
    ? fixMounts(magicast, configPath, `${functionsDir}/convex.config.ts`, backendUsage(magicast, rootDir, functionsDir), rootDir)
    : []
  return [
    ...mounted,
    // Read again: the mounts' edit, if any, is on disk now.
    ...drift.missingForwards.length > 0 && existsSync(configPath) ? fixForwards(magicast, configPath, `${functionsDir}/convex.config.ts`) : [],
    ...drift.staleForwards.length > 0 && existsSync(configPath) ? fixStaleForwards(magicast, configPath, `${functionsDir}/convex.config.ts`) : [],
    ...drift.missingRoutes.length > 0 && existsSync(httpPath) ? fixRoutes(magicast, httpPath, `${functionsDir}/http.ts`, drift.missingRoutes) : [],
  ]
}
