import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { parseSync } from 'oxc-parser'
import { describe, expect, it } from 'vitest'
import { REQUIRED_FUNCTION_EXPORTS } from '../../src/contract'
import { BACKEND_APP_CONFIG_KEYS } from '../../src/runtime/config'
import { BACKEND_FILE_TEMPLATES } from '../../src/templates'
import { aheadOfCode, contentFile, readModuleSources } from '../docs/helpers'

// The public surface, frozen. STABILITY.md promises the 0.x line keeps every
// `nuxt-backend/<subpath>` and every value/type reachable from one; this file
// makes the promise mechanical. The ENTRY table below is the surface — package
// `exports`, the per-entry export names, the docs, and the
// TypeDoc entry points are all checked against it, so a subpath or an export
// cannot appear, move, or vanish without a deliberate edit here.
//
// The nuxt environment gives modules an http `import.meta.url`, so the repo
// root comes from the working directory vitest was started in (its config
// root) — verified against the package name below.
const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

type ExportCondition = string | { types?: string, import?: string, default?: string }
const packageJson = JSON.parse(read('package.json')) as {
  name: string
  exports: Record<string, ExportCondition>
}
const { exports: packageExports } = packageJson

/**
 * How an entry is built and shipped:
 * - `runtime` — nuxt-module-build (the module bundle and the mkdist runtime tree)
 * - `convex` — the component tsc build (`tsconfig.convex-component.build.json`)
 * - `css` — copied verbatim by mkdist
 * - `raw` — shipped as source (`files` includes `src/convex`)
 * - `entry` — an unbuild entry of `build.config.ts`: `dist/<name>.mjs` + `.d.mts`
 */
type EntryKind = 'runtime' | 'convex' | 'css' | 'raw' | 'entry'

interface Entry {
  source: string
  kind: EntryKind
  /** Declaration-only subpath: `types` condition, no JavaScript. */
  typesOnly?: true
}

/** Every `exports` subpath → its source file. Literal on purpose: this is the freeze. */
const ENTRIES: Record<string, Entry> = {
  '.': { source: 'src/module.ts', kind: 'runtime' },
  './auth': { source: 'src/convex/client/index.ts', kind: 'convex' },
  './http': { source: 'src/convex/integrations/http.ts', kind: 'convex' },
  './functions': { source: 'src/convex/integrations/functions.ts', kind: 'convex' },
  './app': { source: 'src/convex/app.ts', kind: 'convex' },
  './billing': { source: 'src/convex/integrations/billing.ts', kind: 'convex' },
  './email': { source: 'src/convex/integrations/email.ts', kind: 'convex' },
  './rate-limit': { source: 'src/convex/integrations/rate-limit.ts', kind: 'convex' },
  './search': { source: 'src/convex/integrations/search.ts', kind: 'convex' },
  './workflows': { source: 'src/convex/integrations/workflows.ts', kind: 'convex' },
  './audit': { source: 'src/convex/integrations/audit.ts', kind: 'convex' },
  './access': { source: 'src/convex/integrations/launch.ts', kind: 'convex' },
  './account': { source: 'src/convex/integrations/account.ts', kind: 'convex' },
  './admin': { source: 'src/convex/integrations/admin.ts', kind: 'convex' },
  './flags': { source: 'src/convex/integrations/flags.ts', kind: 'convex' },
  './ai': { source: 'src/convex/integrations/ai.ts', kind: 'convex' },
  './storage': { source: 'src/convex/integrations/storage.ts', kind: 'convex' },
  './notifications': { source: 'src/convex/integrations/notifications.ts', kind: 'convex' },
  './monitoring': { source: 'src/convex/integrations/monitoring.ts', kind: 'convex' },
  './convex.config': { source: 'src/convex/components/backend/convex.config.ts', kind: 'convex' },
  './_generated/component': { source: 'src/convex/components/backend/_generated/component.ts', kind: 'convex', typesOnly: true },
  './auth.config': { source: 'src/convex/auth.config.ts', kind: 'convex' },
  './test': { source: 'src/convex/test.ts', kind: 'raw' },
  './test-utils': { source: 'src/runtime/test-utils/index.ts', kind: 'runtime' },
  './eslint': { source: 'src/eslint.ts', kind: 'entry' },
}

/**
 * The two component entries Convex itself imports (`convex.config`, the
 * generated `ComponentApi`) are also published under their `.js`-suffixed
 * spelling — the historically documented Convex import style — as exact
 * duplicates of the extensionless entry. Nothing else gets a dual.
 */
const COMPONENT_DUALS = ['./convex.config', './_generated/component']

/** Subpaths with no source file: `exports` self-reference only. */
const SELF_REFERENCES = ['./package.json']

const jsEntries = Object.entries(ENTRIES).filter(([, entry]) => entry.kind !== 'css' && !entry.typesOnly)

/** `src/convex/x.ts` → `./dist/convex/x`, `src/runtime/x.ts` → `./dist/runtime/x`, `src/module.ts` → `./dist/module`. */
function distBase(source: string): string {
  return `./dist/${source.slice('src/'.length).replace(/\.ts$/, '')}`
}

/**
 * The `exports` value an entry must have, derived from its source path alone.
 *
 * Every JavaScript subpath ships under one condition — `default`, which answers
 * `import`, `require` and every bundler alike. Reading the key back out of
 * `package.json` would make the freeze blind exactly where a consumer-visible
 * break lives: flipping a subpath to `import`-only strands `require()` callers
 * on that subpath and no other.
 */
function expectedCondition(key: string, entry: Entry): ExportCondition {
  if (entry.kind === 'css') return distBase(entry.source)
  if (entry.kind === 'raw') return `./${entry.source}`
  const base = distBase(entry.source)
  if (entry.kind === 'entry') return { types: `${base}.d.mts`, default: `${base}.mjs` }
  // The module entry's declarations go through nuxt-module-build's shim, which
  // augments Nuxt's hook/config interfaces before re-exporting the module.
  const types = key === '.' ? './dist/types.d.ts' : `${base}.d.ts`
  if (entry.typesOnly) return { types }
  return { types, default: `${base}.js` }
}

describe('package exports ↔ ENTRY table', () => {
  it('reads the package under test', () => {
    expect(packageJson.name).toBe('nuxt-backend')
  })

  it('lists every subpath, both ways', () => {
    const duals = Object.keys(packageExports).filter(key => key.endsWith('.js'))
    expect(duals.map(key => key.slice(0, -'.js'.length)).sort()).toEqual([...COMPONENT_DUALS].sort())
    for (const dual of duals) expect(packageExports[dual], dual).toEqual(packageExports[dual.slice(0, -'.js'.length)])
    for (const key of SELF_REFERENCES) expect(packageExports[key]).toBe(key)

    const tabled = Object.keys(packageExports).filter(key => !duals.includes(key) && !SELF_REFERENCES.includes(key))
    expect(tabled.sort()).toEqual(Object.keys(ENTRIES).sort())
  })

  it('derives every condition path from the source path', () => {
    for (const [key, entry] of Object.entries(ENTRIES)) {
      expect(packageExports[key], key).toEqual(expectedCondition(key, entry))
    }
  })

  it('resolves through exports alone', () => {
    // Nuxt, Convex and TypeScript's bundler resolution all read `exports`, so
    // there is no `main` or `typesVersions` to keep in step with it.
    expect(packageJson).not.toHaveProperty('main')
    expect(packageJson).not.toHaveProperty('typesVersions')
  })

  it('maps every source file to an existing file', () => {
    for (const [key, entry] of Object.entries(ENTRIES)) {
      if (entry.source.includes('*')) continue
      expect(existsSync(join(root, entry.source)), `${key} → ${entry.source}`).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Static analysis — oxc-parser over the sources, shared by the checks below.

type Parsed = ReturnType<typeof parseSync>
type Statement = Parsed['program']['body'][number]

const parsedFiles = new Map<string, Parsed>()

function parse(file: string, text = readFileSync(file, 'utf8')): Parsed {
  let result = parsedFiles.get(file)
  if (!result) {
    result = parseSync(file, text)
    expect(result.errors.map(error => error.message), file).toEqual([])
    parsedFiles.set(file, result)
  }
  return result
}

/** The const-enum `kind` fields as plain strings. */
const kindOf = (name: { kind: unknown }) => String(name.kind)

const isRelative = (request: string) => request.startsWith('.')

/** `./billing.js` next to `file` → the `.ts` source it compiles from. */
function resolveRelative(file: string, request: string): string {
  const base = join(dirname(file), request.replace(/\.js$/, ''))
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) if (existsSync(candidate)) return candidate
  throw new Error(`${relative(root, file)}: cannot resolve '${request}'`)
}

function walk(dir: string, extension: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, extension, acc)
    else if (entry.name.endsWith(extension)) acc.push(path)
  }
  return acc
}

/** Runtime (value) export names of a module, `export *` followed through relative sources. */
function staticExportNames(file: string, text?: string): string[] {
  const names = new Set<string>()
  for (const statement of parse(file, text).module.staticExports) {
    for (const entry of statement.entries) {
      if (entry.isType) continue
      if (kindOf(entry.exportName) === 'None') {
        const request = entry.moduleRequest?.value
        if (request && isRelative(request)) {
          for (const name of staticExportNames(resolveRelative(file, request))) if (name !== 'default') names.add(name)
        }
        continue
      }
      names.add(kindOf(entry.exportName) === 'Default' ? 'default' : entry.exportName.name!)
    }
  }
  return [...names].sort()
}

/** Names bound by a declaration pattern (`const { a, b: c } = …` binds `a` and `c`). */
function patternNames(pattern: { type: string } & Record<string, unknown>): string[] {
  switch (pattern.type) {
    case 'Identifier':
      return [pattern.name as string]
    case 'ObjectPattern':
      return (pattern.properties as Array<{ type: string, value?: never, argument?: never } & Record<string, unknown>>)
        .flatMap(property => patternNames((property.type === 'RestElement' ? property.argument : property.value) as never))
    case 'ArrayPattern':
      return (pattern.elements as Array<Record<string, unknown> | null>).flatMap(element => (element ? patternNames(element as never) : []))
    case 'AssignmentPattern':
    case 'RestElement':
      return patternNames((pattern.left ?? pattern.argument) as never)
    default:
      return []
  }
}

interface Declaration {
  /** Start offset of the top-level statement. */
  start: number
  /** Set when the name is an import binding rather than a local declaration. */
  importedFrom?: string
  importedName?: string
}

/** The top-level statement that declares (or imports) `name` in `file`. */
function declarationOf(file: string, name: string): Declaration | undefined {
  for (const node of parse(file).program.body) {
    if (node.type === 'ImportDeclaration') {
      const specifier = node.specifiers?.find(candidate => candidate.local.name === name)
      if (!specifier) continue
      const importedName = specifier.type === 'ImportSpecifier'
        ? (specifier.imported.type === 'Identifier' ? specifier.imported.name : specifier.imported.value)
        : specifier.type === 'ImportDefaultSpecifier' ? 'default' : '*'
      return { start: node.start, importedFrom: node.source.value, importedName }
    }
    const declaration = node.type === 'ExportNamedDeclaration' ? node.declaration : node
    if (!declaration) continue
    if (declaration.type === 'VariableDeclaration') {
      if (declaration.declarations.some(declarator => patternNames(declarator.id as never).includes(name))) return { start: node.start }
    }
    else if ('id' in declaration && declaration.id && typeof declaration.id === 'object' && 'name' in declaration.id && declaration.id.name === name) {
      return { start: node.start }
    }
  }
  return undefined
}

/** Whether a comment directly above the top-level statement at `start` matches `tag`. */
function hasLeadingTag(file: string, start: number, tag: RegExp): boolean {
  const { program, comments } = parse(file)
  const previousEnd = program.body.reduce((end: number, node: Statement) => (node.end <= start && node.end > end ? node.end : end), 0)
  return comments.some(comment => comment.start >= previousEnd && comment.end <= start && tag.test(comment.value))
}

interface Reachable {
  name: string
  /** Where the declaration lives — a source file, or the package an upstream re-export comes from. */
  origin: string
  internal: boolean
}

/**
 * Every export of `file` (values and types) resolved to its declaration, so an
 * `@internal` tag on a declaration re-exported through any hop is found.
 */
function reachableExports(file: string, seen = new Set<string>()): Reachable[] {
  if (seen.has(file)) return []
  seen.add(file)
  const result: Reachable[] = []
  const declaredHere = (name: string, start: number) =>
    result.push({ name, origin: file, internal: hasLeadingTag(file, start, /@internal\b/) })
  const viaModule = (name: string, request: string, importName: string) => {
    if (!isRelative(request)) {
      result.push({ name, origin: request, internal: false })
      return
    }
    const target = resolveRelative(file, request)
    const origin = reachableExports(target, new Set()).find(candidate => candidate.name === importName)
    result.push({ name, origin: origin?.origin ?? target, internal: origin?.internal ?? false })
  }

  for (const statement of parse(file).module.staticExports) {
    for (const entry of statement.entries) {
      const request = entry.moduleRequest?.value
      if (kindOf(entry.exportName) === 'None') {
        // `export * from` — everything but the default export of the target.
        if (request && isRelative(request)) {
          result.push(...reachableExports(resolveRelative(file, request), seen).filter(candidate => candidate.name !== 'default'))
        }
        continue
      }
      const name = kindOf(entry.exportName) === 'Default' ? 'default' : entry.exportName.name!
      if (request) {
        viaModule(name, request, kindOf(entry.importName) === 'Default' ? 'default' : (entry.importName.name ?? '*'))
        continue
      }
      // Declared in this statement (`export const x`, `export default …`), or an
      // `export { x }` list whose declaration — or import — sits elsewhere in the file.
      const local = kindOf(entry.localName) === 'Name' ? entry.localName.name! : undefined
      const declaration = local ? declarationOf(file, local) : undefined
      if (declaration?.importedFrom) viaModule(name, declaration.importedFrom, declaration.importedName!)
      else declaredHere(name, declaration?.start ?? statement.start)
    }
  }
  return result
}

/**
 * What `file` takes from the Convex half that the component build strips
 * from dist/convex's declarations, so an app's type check of the runtime
 * fails on it: an @internal declaration imported or re-exported by name,
 * or a module holding one taken whole (a namespace, `export *`, a dynamic
 * import), whose members cannot be told apart here.
 */
function internalTakenBy(file: string, text?: string): string[] {
  const convexRoot = join(root, 'src/convex') + sep
  const where = relative(root, file)
  const intoConvex = (request: string | undefined) => {
    if (!request || !isRelative(request) || !request.includes('/convex/')) return undefined
    const target = resolveRelative(file, request)
    return target.startsWith(convexRoot) ? target : undefined
  }
  const named = (target: string, name: string, verb: string) => {
    const found = reachableExports(target).find(candidate => candidate.name === name)
    return found?.internal ? [`${where} ${verb} ${name} (${relative(root, found.origin)})`] : []
  }
  const whole = (target: string, verb: string) => {
    const internal = reachableExports(target).filter(candidate => candidate.internal).map(candidate => candidate.name)
    return internal.length > 0 ? [`${where} ${verb} all of ${relative(root, target)} (${internal.join(', ')})`] : []
  }
  const { module } = parse(file, text)
  const source = text ?? readFileSync(file, 'utf8')
  const offenders: string[] = []
  for (const statement of module.staticImports) {
    const target = intoConvex(statement.moduleRequest.value)
    if (!target) continue
    for (const entry of statement.entries) {
      const kind = kindOf(entry.importName)
      offenders.push(...(kind === 'NamespaceObject' ? whole(target, 'imports') : named(target, kind === 'Default' ? 'default' : entry.importName.name!, 'imports')))
    }
  }
  for (const statement of module.staticExports) {
    for (const entry of statement.entries) {
      const target = intoConvex(entry.moduleRequest?.value)
      if (!target) continue
      offenders.push(...(kindOf(entry.importName) === 'Name' ? named(target, entry.importName.name!, 're-exports') : whole(target, 're-exports')))
    }
  }
  for (const call of module.dynamicImports) {
    const literal = /^(['"`])([^'"`$]+)\1$/.exec(source.slice(call.moduleRequest.start, call.moduleRequest.end).trim())
    const target = intoConvex(literal?.[2])
    if (target) offenders.push(...whole(target, 'imports'))
  }
  return offenders
}

// ---------------------------------------------------------------------------
// Export names — observed at runtime, written down here as literals.

/**
 * `Object.keys(await import(source)).sort()` per JavaScript entry. A changed
 * array is a surface change: a removal needs the deprecation cycle in
 * STABILITY.md, an addition needs docs.
 */
const EXPORT_NAMES: Record<string, string[]> = {
  '.': ['default'],
  './auth': ['APIError', 'resolveSignInMethod', 'setupAuth', 'storesLastSignInCookie'],
  './http': ['registerBackendRoutes'],
  './functions': ['BACKEND_ERRORS', 'RECENT_SIGN_IN_SECONDS', 'SENSITIVE_ACTIONS', 'backendError', 'createFunctions', 'defineRetention', 'getBackendError', 'normalizeEmail', 'randomToken', 'sha256Hex', 'verifyHuman'],
  './app': ['backendEnv', 'backendEnvironment'],
  './billing': ['ALL_BILLING_EVENTS', 'defineBillingCatalog', 'setupBilling', 'setupReferrals'],
  './email': ['ALL_EMAIL_EVENTS', 'describeOrigin', 'escapeHtml', 'forceColorScheme', 'html', 'linkBlocks', 'setupEmail', 'trustedHtml'],
  './rate-limit': ['DAY', 'DEFAULT_LIMITS', 'HOUR', 'MINUTE', 'SECOND', 'setupRateLimiter'],
  './search': ['defineSearch', 'search'],
  './workflows': ['defineEmailSequence', 'setupWorkflows'],
  './audit': ['BACKEND_EVENTS', 'defineActivation', 'setupAudit', 'vBackendEvent'],
  './access': ['ACCESS_PHASES', 'setupAccess', 'setupWaitlist'],
  './account': ['ACCOUNT_DATA_SOURCES', 'setupAccount'],
  './admin': ['IMPERSONATION_SESSION_SECONDS', 'setupAdmin', 'setupWebhooks'],
  './flags': ['BACKEND_FLAGS', 'FLAG_TARGETS_MAX', 'MAINTENANCE_MESSAGE_MAX', 'ROLLOUT_BUCKETS', 'defineFlags', 'flagBucket', 'setupFlags'],
  './ai': ['defineJobQueue', 'priceTokens', 'setupAi'],
  './storage': ['DEFAULT_ACCEPTED_TYPES', 'DEFAULT_MAX_FILE_SIZE', 'SIGNED_URL_TTL_MAX_MS', 'SIGNED_URL_TTL_MS', 'setupStorage', 'sniffContentType', 'stripImageMetadata'],
  './notifications': ['setupNotifications'],
  './monitoring': ['MONITORING_TAGS', 'checkIn', 'checkingIn', 'isReportable', 'reportError', 'reportingErrors'],

  './convex.config': ['default'],
  './auth.config': ['default', 'defineBackendAuthConfig'],
  './test': ['asUser', 'default', 'defineBackendTestApp', 'register', 'seedWorkspace'],
  './test-utils': ['backendMockProvides', 'backendTestAliases', 'createBackendMock', 'renderEmail', 'resetBackendMock'],
  './eslint': ['BACKEND_ESLINT_RULES', 'backendEslint'],
}

/**
 * Entries whose module graph only evaluates inside the Convex runtime:
 * `defineComponent()` requires a `componentDefinitionPath` the Convex bundler
 * injects, so importing `convex.config.ts` here throws. Their names are read
 * statically (oxc-parser) instead of observed through `import()`.
 */
const STATIC_ONLY = ['./convex.config']

describe('entry export names', () => {
  it('freezes one literal array per JavaScript entry', () => {
    expect(Object.keys(EXPORT_NAMES).sort()).toEqual(jsEntries.map(([key]) => key).sort())
  })

  // The first import of an entry transforms its module graph: seconds on a loaded machine.
  it.each(jsEntries.filter(([key]) => !STATIC_ONLY.includes(key)))('%s exports exactly the frozen names', async (key, entry) => {
    const namespace = await import(/* @vite-ignore */ resolve(root, entry.source)) as Record<string, unknown>
    expect(Object.keys(namespace).sort()).toEqual(EXPORT_NAMES[key])
  }, 30_000)

  it.each(STATIC_ONLY)('%s exports exactly the frozen names (static)', (key) => {
    expect(staticExportNames(join(root, ENTRIES[key]!.source))).toEqual(EXPORT_NAMES[key])
  })

  it('agrees with the static view of every entry', () => {
    // The runtime and static readings must never disagree — a mismatch means
    // a conditional export or a bundler-only name slipped into an entry.
    for (const [key, entry] of jsEntries) {
      expect(staticExportNames(join(root, entry.source)), key).toEqual(EXPORT_NAMES[key])
    }
  })
})

// ---------------------------------------------------------------------------
// @internal — stripped from every published declaration file (`stripInternal`
// in the component build and, via nuxt.config.ts, the module/runtime builds),
// so it must never sit on something an entry re-exports: the value would ship
// at runtime with no type behind it.

describe('@internal', () => {
  it('detects the tag on a known internal declaration', () => {
    // Positive control for the resolver: the doctor contract map is internal.
    const file = join(root, 'src/contract.ts')
    const declaration = declarationOf(file, 'REQUIRED_FUNCTION_EXPORTS')
    expect(declaration).toBeDefined()
    expect(hasLeadingTag(file, declaration!.start, /@internal\b/)).toBe(true)
  })

  // Both walks parse every entry's or runtime file: seconds on a loaded machine.
  it('never reaches an entry', () => {
    const leaked = Object.entries(ENTRIES)
      .filter(([, entry]) => entry.kind !== 'css')
      .flatMap(([key, entry]) => reachableExports(join(root, entry.source))
        .filter(candidate => candidate.internal)
        .map(candidate => `${key} → ${candidate.name} (${relative(root, candidate.origin)})`))
    expect(leaked).toEqual([])
  }, 30_000)

  // The module runtime reaches an app's type check as written: the website's
  // reads src/runtime itself (dist/runtime links to it after dev:prepare),
  // and a relative import into the Convex half resolves to dist/convex's
  // declarations, which the component build strips of every @internal one.
  it('never sits on what a runtime file takes from the Convex half', () => {
    const offenders = walk(join(root, 'src/runtime'), '.ts').filter(file => !file.endsWith('.d.ts')).flatMap(file => internalTakenBy(file))
    expect(offenders).toEqual([])
  }, 30_000)

  it('finds an internal declaration a runtime file takes in any form', () => {
    // Positive control: src/convex/log.ts is internal through and through,
    // and constants.ts has none. Each line is a module of its own, beside
    // the runtime files, so its relative requests resolve as theirs would.
    const fixture = (name: string, text: string) => internalTakenBy(join(root, `src/runtime/monitoring/${name}.fixture.ts`), text)
    expect(fixture('named', `import { logBackend } from '../../convex/log.js'`)).toEqual([expect.stringContaining('imports logBackend')])
    expect(fixture('type', `import type { LogCode } from '../../convex/log.js'`)).toEqual([expect.stringContaining('imports LogCode')])
    expect(fixture('namespace', `import * as log from '../../convex/log.js'\nexport const write = log.logBackend`)).toEqual([expect.stringContaining('imports all of src/convex/log.ts')])
    expect(fixture('re-export', `export { LOG_CODES as codes } from '../../convex/log.js'`)).toEqual([expect.stringContaining('re-exports LOG_CODES')])
    expect(fixture('star', `export * from '../../convex/log.js'`)).toEqual([expect.stringContaining('re-exports all of src/convex/log.ts')])
    expect(fixture('dynamic', `// — a wide character first, as comments here have\nexport const write = () => import('../../convex/log.js').then(log => log.logBackend)`)).toEqual([expect.stringContaining('imports all of src/convex/log.ts')])
    expect(fixture('clean', `export { LOCAL_LOG_ROUTE } from '../../convex/constants.js'\nexport const load = () => import('../../convex/constants.js')`)).toEqual([])
  })

  it('is spelled as a JSDoc tag only, everywhere under src/', () => {
    // TypeScript strips on the bare word in any leading comment; one spelling
    // (`/** … @internal */`) keeps the tag greppable and TypeDoc-visible.
    const offenders = walk(join(root, 'src'), '.ts').flatMap((file) => {
      const { comments } = parse(file)
      return comments
        .filter(comment => /@internal\b/.test(comment.value) && !(comment.type === 'Block' && comment.value.startsWith('*')))
        .map(comment => `${relative(root, file)}@${comment.start}`)
    })
    expect(offenders).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// The registry — the auto-import and component names `src/module.ts`
// installs through its `src/nuxt/` helpers (STABILITY.md surface 3), frozen
// the same way as the export names.

const REGISTRY = {
  composables: [
    'getBackendError',
    'useAccount',
    'useConsents',
    'useContactForm',
    'useOnboarding',
    'useActivation',
    'useAppShell',
    'useAdmin',
    'useFlag',
    'useFlagAdmin',
    'useAccessPhase',
    'useInvite',
    'useAccessAdmin',
    'useWaitlist',
    'useWaitlistAdmin',
    'useAiStream',
    'useAuditLog',
    'useAuth',
    'useBackendClient',
    'useBackendConfig',
    'useBackendPagePath',
    'useReturnPath',
    'useAiLabel',
    'useBilling',
    'useCampaign',
    'useConnectionState',
    'useCredits',
    'useEmailChange',
    'useEmailStatus',
    'useExperiment',
    'useFeatures',
    'useGifts',
    'useHumanCheck',
    'useInboxAdmin',
    'useJob',
    'useChat',
    'useLabels',
    'useLoginFlow',
    'useNotificationInbox',
    'useEmailPreferences',
    'usePushSubscription',
    'useAnnouncements',
    'useAnnouncementsAdmin',
    'useNotifications',
    'useOrders',
    'useReferrals',
    'useReferralAdmin',
    'useWorkspace',
    'usePasskeys',
    'usePricing',
    'useReauthentication',
    'useSandboxInbox',
    'useSearch',
    'useSessions',
    'useShareLink',
    'useUploadField',
    'useUsage',
    'useWorkflowStatus',
  ],
  // `StorageImage` aliases the base module's `ConvexImage`, and
  // `BillingCheckoutLink` and `BillingPortalLink` replace its `CheckoutLink`
  // and `CustomerPortalLink`; the module hides all three originals.
  components: [
    'AcceptInvitation',
    'WaitlistForm',
    'AppShell',
    'OnboardingFlow',
    'ActivationChecklist',
    'AccessDenied',
    'AccountData',
    'AdminUsers',
    'AdminWorkspaces',
    'AiLabel',
    'AuditLog',
    'AuthForm',
    'BackendNotices',
    'BillingCheckoutLink',
    'BillingHistory',
    'BillingPortalLink',
    'CancelFlow',
    'ConnectionStatus',
    'ConsentPrompt',
    'ContactForm',
    'Gate',
    'HowDidYouHear',
    'NotificationInbox',
    'NotificationInboxBell',
    'NotificationInboxItem',
    'PricingTable',
    'ProfileSettings',
    'ReauthenticateDialog',
    'ReferralCard',
    'SecuritySettings',
    'StorageImage',
    'UpgradePrompt',
    'UploadField',
    'UsageHistory',
    'WithdrawalButton',
    'WorkspaceSettings',
  ],
  // The parts of the components above (src/ui/registry.ts): an app component of
  // the same name replaces one everywhere.
  parts: [
    'AuthFormHeader', 'AuthFormChoose', 'AuthFormPasskey', 'AuthFormEmail', 'AuthFormCode', 'AuthFormRecover', 'AuthFormWaitlisted', 'AuthFormInviteCode', 'AuthFormAge', 'AuthFormUndeliverable', 'AuthFormPasskeyOffer', 'AuthFormAgreement', 'AuthFormError',
    'WaitlistJoin', 'WaitlistCode', 'WaitlistPlace', 'WaitlistShare',
    'ReauthenticatePasskey', 'ReauthenticateCode',
    'ProfileIdentity', 'ProfileNameSection', 'ProfileEmailSection', 'ProfileLanguageSection', 'ProfilePreferencesSection',
    'SecurityPasskeys', 'SecuritySessions', 'SecurityAlerts', 'AccountExport', 'AccountDeletion',
    'WorkspaceList', 'WorkspaceBilling', 'WorkspaceCredits', 'AcceptInvitationActions', 'AuditLogEvent',
    'PricingPeriodSwitch', 'PricingCurrencySelect', 'PricingPlanCard', 'PricingPackCard', 'PricingCancelConfirm', 'PricingEmailOptOut',
    'BillingHistoryOrder', 'UsageHistoryEvent',
    'CancelFlowQuestion', 'CancelFlowOffer', 'CancelFlowEnd',
    'AdminUsersTable', 'AdminUserDrawer', 'AdminWorkspacesTable', 'AdminWorkspaceDrawer',
    'AccountMenu', 'WorkspaceSwitcher',
    'OnboardingProfile', 'OnboardingWorkspace', 'OnboardingTeammates', 'OnboardingPlan',
  ],
  server: ['backendAuth'],
  // Route middleware: the global page guard behind `definePageMeta({ auth })`,
  // the one way a page says who may open it.
  middleware: ['backend-access'],
}

/** The experimental tier, by the names STABILITY.md lists. */
const EXPERIMENTAL = ['./ai', './monitoring', 'useAiStream', 'useJob', 'useInboxAdmin', 'useChat', 'useWorkflowStatus', 'useSandboxInbox', 'defineBackendTestApp', 'asUser', 'seedWorkspace', './test-utils', 'EmailPreview', 'forceColorScheme', 'CatalogQuota', 'QuotaUsage']

/**
 * The experimental members of a stable type, by where the source tags them
 * (`Interface.member`), each with the name STABILITY.md lists it by.
 */
const EXPERIMENTAL_MEMBERS: Record<string, string> = {
  'BillingCatalog.quotas': 'BillingCatalog.quotas',
  'CatalogPlan.quotas': 'CatalogPlan.quotas',
  'CatalogPlan.gift': 'CatalogPlan.gift',
  'BillingCatalogIds.quotas': 'BillingCatalogIds.quotas',
  'BillingComponents.shardedCounter': 'BillingComponents.shardedCounter',
  'PricedPlan.quotas': 'PricedPlan.quotas',
  'Billing.getQuota': 'billing.getQuota',
  'Billing.requireQuota': 'billing.requireQuota',
  'Billing.releaseQuota': 'billing.releaseQuota',
  'UseFeaturesReturn.quotas': 'useFeatures().quotas',
  'UseFeaturesReturn.quota': 'useFeatures().quota()',
  'UseFeaturesReturn.remaining': 'useFeatures().remaining()',
}

describe('the registry', () => {
  it('matches every name src/module.ts and src/nuxt/ register', () => {
    // Registrations are `{ name: 'x' }` / `{ name: 'x', as: 'y' }` literals,
    // the packaged UI's rows (src/ui/registry.ts) among them; the module
    // meta (`name: 'nuxt-backend'`) is the only other `name:`.
    const registered = [...readModuleSources().matchAll(/\bname: '(\w[\w-]*)'(?:, as: '(\w+)')?/g)]
      .map(([, name, alias]) => alias ?? name!)
      .filter(name => name !== packageJson.name)
    expect(registered.sort()).toEqual(Object.values(REGISTRY).flat().sort())
  })
})

// ---------------------------------------------------------------------------
// Brand-neutral names: the public surface speaks in backend terms. A provider
// may appear in prose — a doc comment explaining what runs underneath — but
// never as the name of something an app imports, registers or types against.

/** A name that says a provider: the billing or the email service this package wraps. */
const PROVIDER_NAME = /polar|resend/i

describe('brand-neutral names', () => {
  it('no export of any entry, value or type, names a provider', () => {
    const named = Object.entries(ENTRIES)
      .filter(([, entry]) => entry.kind !== 'css')
      .flatMap(([key, entry]) => reachableExports(join(root, entry.source))
        .filter(candidate => PROVIDER_NAME.test(candidate.name))
        .map(candidate => `${key} → ${candidate.name}`))
    expect(named).toEqual([])
  })

  it('no auto-import, component, Nitro import or middleware the module registers names a provider', () => {
    expect(Object.values(REGISTRY).flat().filter(name => PROVIDER_NAME.test(name))).toEqual([])
  })

  it('the generated reference names no provider type: no identifier in code says Polar or Resend', () => {
    // Every signature, table cell and code block TypeDoc writes is code: an
    // identifier there with a provider in it is a type an app would have to
    // name. Lower-case spellings are component keys (`components.polar`),
    // which the app's own `convex.config.ts` chooses.
    const pages = walk(GENERATED_REFERENCE, '.md')
    expect(pages.length).toBeGreaterThan(10)
    const named: string[] = []
    for (const page of pages) {
      const text = readFileSync(page, 'utf8')
      const code = [...text.matchAll(/```[\s\S]*?```|`[^`\n]+`/g)].map(([span]) => span)
      for (const span of code) {
        for (const [identifier] of span.matchAll(/\b\w*(?:Polar|Resend)\w*\b/g)) named.push(`${relative(root, page)}: ${identifier}`)
      }
    }
    expect([...new Set(named)]).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Docs, TypeDoc, scaffold contract — the surface as it is described elsewhere.

const GENERATED_REFERENCE = join(root, 'website/content/docs/10.reference/10.api')

/** `a/{b,c}` → `a/b`, `a/c`; `…` (prose ellipsis) is a wildcard. */
function expandSubpath(subpath: string): string[] {
  const group = subpath.match(/^([^{]*)\{([^}]*)\}(.*)$/)
  if (!group) return [subpath.replace('…', '*')]
  return group[2]!.split(',').flatMap(part => expandSubpath(`${group[1]}${part}${group[3]}`))
}

function globToRegExp(pattern: string): RegExp {
  const literal = pattern.replace(/[.+?^${}()|[\]\\/]/g, '\\$&')
  return new RegExp(`^${literal.replace(/\*/g, '.*')}$`)
}

/** Whether `nuxt-backend/<subpath>` resolves through `exports` (`*` on either side is a glob). */
function isPublished(subpath: string): boolean {
  const key = `./${subpath}`
  return Object.keys(packageExports).some(candidate => candidate === key
    || (candidate.includes('*') && globToRegExp(candidate).test(key))
    || (key.includes('*') && globToRegExp(key).test(candidate)))
}

describe('the surface as documented', () => {
  it('names only published subpaths in README.md and the docs', () => {
    const docs = walk(join(root, 'website/content'), '.md')
    // The Upgrade page and the changelog name removed subpaths on purpose, and
    // a planned or changing page one its unit has not published yet.
    const record = ['/docs/05.ship/6.releases/4.upgrade.md', '/docs/05.ship/6.releases/1.changelog.md']
    const files = [join(root, 'README.md'), ...docs.filter(file => !file.startsWith(GENERATED_REFERENCE) && !record.some(page => file.split(sep).join('/').endsWith(page)) && !aheadOfCode(file))]
    // The generated reference is TypeDoc's output, not prose written by hand —
    // it must actually be excluded, or a rename of the content tree silently
    // turns this into a scan of generated files that always passes.
    expect(docs.some(file => file.startsWith(GENERATED_REFERENCE))).toBe(true)
    expect(files.length).toBeGreaterThan(20)
    const unpublished: string[] = []
    let mentions = 0
    for (const file of files) {
      for (const [, raw] of readFileSync(file, 'utf8').matchAll(/['"`]nuxt-backend\/([^'"`\s]+)['"`]/g)) {
        // A placeholder (`nuxt-backend/<subpath>`) names no subpath.
        if (raw!.includes('<')) continue
        for (const subpath of expandSubpath(raw!)) {
          mentions++
          if (!isPublished(subpath)) unpublished.push(`${relative(root, file)}: nuxt-backend/${subpath}`)
        }
      }
    }
    expect(mentions).toBeGreaterThan(50)
    expect(unpublished).toEqual([])
  })

  it('names every frozen surface in STABILITY.md', () => {
    const stability = read('STABILITY.md')
    const mentioned = (text: string) => stability.includes(`\`${text}\``)
    const missing: string[] = []
    for (const key of Object.keys(ENTRIES)) {
      const subpath = key === '.' ? 'nuxt-backend' : `nuxt-backend/${key.slice('./'.length)}`
      if (!mentioned(subpath)) missing.push(subpath)
    }
    for (const name of [...Object.values(REGISTRY).flat(), ...Object.values(REQUIRED_FUNCTION_EXPORTS).flat()]) {
      if (!mentioned(name)) missing.push(name)
    }
    for (const name of EXPERIMENTAL) {
      if (!mentioned(name.startsWith('./') ? `nuxt-backend/${name.slice('./'.length)}` : name)) missing.push(`experimental ${name}`)
    }
    for (const name of Object.values(EXPERIMENTAL_MEMBERS)) {
      if (!mentioned(name)) missing.push(`experimental ${name}`)
    }
    // Surface 2's content layer: every dotted key of `appConfig.backend`.
    for (const key of BACKEND_APP_CONFIG_KEYS) {
      if (!mentioned(key)) missing.push(`appConfig.backend.${key}`)
    }
    expect(missing).toEqual([])
  })

  it('documents every appConfig.backend key on the labels page', () => {
    // The "full shape" field-group is the reference for surface 2's content
    // layer: one `::field{name="<key>"}` per frozen key, no more and no fewer.
    const page = read(contentFile('/docs/build/ui/customize/labels'))
    const documented = [...page.matchAll(/:::field\{name="([\w.]+)"/g)].map(([, name]) => name!)
    expect(documented.sort()).toEqual([...BACKEND_APP_CONFIG_KEYS].sort())
  })

  it('tags exactly the experimental tier', () => {
    // Module-level tags sit above the first import; composables carry theirs
    // on the function, and a member of a stable type on the member. Any
    // other `@experimental` in src/ is a tier change STABILITY.md must name.
    const tagged = walk(join(root, 'src'), '.ts').flatMap((file) => {
      const { comments, program } = parse(file)
      return comments.filter(comment => /@experimental\b/.test(comment.value)).map((comment) => {
        const container = program.body.find(node => node.start < comment.start && comment.end < node.end)
        if (container) return memberTagged(container, comment.end) ?? relative(root, file).split(sep).join('/')
        const statement = program.body.find(node => node.start >= comment.end)
        const declaration = statement?.type === 'ExportNamedDeclaration' ? statement.declaration : undefined
        // A function or a type by its name, a component (`export const X = defineComponent(…)`) by its constant's.
        const id = declaration?.type === 'VariableDeclaration' ? declaration.declarations[0]?.id : declaration && 'id' in declaration ? declaration.id : undefined
        return id && 'name' in id
          ? String(id.name)
          : relative(root, file).split(sep).join('/')
      })
    })
    const expected = [...EXPERIMENTAL.map(name => (name.startsWith('./') ? ENTRIES[name]!.source : name)), ...Object.keys(EXPERIMENTAL_MEMBERS)]
    expect(tagged.sort()).toEqual(expected.sort())
  })

  it('documents exactly the runtime, convex and unbuild entries with TypeDoc', () => {
    // One reference page per public module: every source behind a runtime or
    // convex subpath is an entry point, and the only entry points that carry no
    // subpath are the auto-imported composables — reached by name rather than
    // by import path, so they have a page but never an `exports` key.
    // `./_generated/component` is the one subpath left out: Convex
    // generates it and it ships types only, so it is not hand-documented.
    const typedoc = JSON.parse(stripJsonComments(read('typedoc.json'))) as { entryPoints: string[] }
    const COMPOSABLES = 'src/runtime/vue/composables/'
    const documented = Object.values(ENTRIES)
      .filter(entry => (entry.kind === 'runtime' || entry.kind === 'convex' || entry.kind === 'entry') && !entry.typesOnly)
      .map(entry => entry.source)
    expect({
      undocumentedEntries: documented.filter(source => !typedoc.entryPoints.includes(source)).sort(),
      entryPointsWithoutSubpath: typedoc.entryPoints
        .filter(source => !documented.includes(source) && !source.startsWith(COMPOSABLES))
        .sort(),
    }).toEqual({ undocumentedEntries: [], entryPointsWithoutSubpath: [] })
    // The composable exemption covers only composables that exist: a deleted or
    // renamed one must not sit in `entryPoints` unnoticed.
    for (const source of typedoc.entryPoints) expect(existsSync(join(root, source)), source).toBe(true)
  })

  it.each(Object.entries(REQUIRED_FUNCTION_EXPORTS))('scaffolds every contract name of %s.ts', (module, names) => {
    // The doctor contract (`src/contract.ts`) must be a subset of what the
    // scaffold writes, or a fresh project fails its own doctor.
    const template = BACKEND_FILE_TEMPLATES[`${module}.ts`]
    expect(template, `the scaffold has ${module}.ts`).toBeDefined()
    expect(staticExportNames(`${module}.ts`, template)).toEqual(expect.arrayContaining([...names]))
  })
})

/** The interface member a doc comment inside `statement` ending at `end` tags, as `Interface.member`; `undefined` for anything else. */
function memberTagged(statement: Statement, end: number): string | undefined {
  const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
  if (declaration?.type !== 'TSInterfaceDeclaration') return undefined
  const member = declaration.body.body.find(node => node.start >= end)
  const key = member && 'key' in member ? member.key : undefined
  return key && 'name' in key ? `${declaration.id.name}.${String(key.name)}` : undefined
}

/** typedoc.json is JSONC: drop line and block comments outside strings. */
function stripJsonComments(text: string): string {
  let out = ''
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (inString) {
      out += char
      if (char === '\\') out += text[++i]
      else if (char === '"') inString = false
    }
    else if (char === '"') {
      inString = true
      out += char
    }
    else if (char === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
    }
    else if (char === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end === -1 ? text.length : end + 1
    }
    else {
      out += char
    }
  }
  return out
}
