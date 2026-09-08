import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { parseSync } from 'oxc-parser'
import { describe, expect, it, vi } from 'vitest'
import { REQUIRED_FUNCTION_EXPORTS } from '../../src/contract'
import { BACKEND_FILE_TEMPLATES, LOCAL_BACKEND_FILE_TEMPLATES } from '../../src/templates'

// The public surface, frozen. STABILITY.md promises the 0.1 line keeps every
// `nuxt-backend/<subpath>` and every value/type reachable from one; this file
// makes the promise mechanical. The ENTRY table below is the surface — package
// `exports`, `typesVersions`, the per-entry export names, the docs, and the
// TypeDoc entry points are all checked against it, so a subpath or an export
// cannot appear, move, or vanish without a deliberate edit here.
//
// `nuxt-backend/mcp` runs inside Nitro: `nitropack/runtime` reads its storage
// through a virtual module only a Nitro build provides, and the toolkit's
// server entry sits on top of it. Both are mocked so the entry's own module
// graph evaluates in this environment — the mocks never reach the exported
// names being observed.
vi.mock('nitropack/runtime', () => ({
  useEvent: () => undefined,
  useRuntimeConfig: () => ({}),
}))
vi.mock('@nuxtjs/mcp-toolkit/server', () => ({
  defineMcpTool: (definition: unknown) => definition,
}))

// The nuxt environment gives modules an http `import.meta.url`, so the repo
// root comes from the working directory vitest was started in (its config
// root) — verified against the package name below.
const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

type ExportCondition = string | { types?: string, import?: string, default?: string }
const packageJson = JSON.parse(read('package.json')) as {
  name: string
  exports: Record<string, ExportCondition>
  typesVersions: Record<string, Record<string, string[]>>
}
const { exports: packageExports } = packageJson

/**
 * How an entry is built and shipped:
 * - `runtime` — nuxt-module-build (the module bundle and the mkdist runtime tree)
 * - `convex` — the component tsc build (`tsconfig.convex-component.build.json`)
 * - `css` — copied verbatim by mkdist
 * - `raw` — shipped as source (`files` includes `src/convex`)
 */
type EntryKind = 'runtime' | 'convex' | 'css' | 'raw'

interface Entry {
  source: string
  kind: EntryKind
  /** Declaration-only subpath: `types` condition, no JavaScript. */
  typesOnly?: true
}

/** Every `exports` subpath → its source file. Literal on purpose: this is the freeze. */
const ENTRIES: Record<string, Entry> = {
  '.': { source: 'src/module.ts', kind: 'runtime' },
  './auth.css': { source: 'src/runtime/vue/components/auth.css', kind: 'css' },
  './ui.css': { source: 'src/runtime/vue/components/ui.css', kind: 'css' },
  './*.css': { source: 'src/runtime/vue/components/*.css', kind: 'css' },
  './auth': { source: 'src/convex/client/index.ts', kind: 'convex' },
  './authorization': { source: 'src/convex/integrations/authorization.ts', kind: 'convex' },
  './http': { source: 'src/convex/integrations/http.ts', kind: 'convex' },
  './functions': { source: 'src/convex/integrations/functions.ts', kind: 'convex' },
  './app': { source: 'src/convex/app.ts', kind: 'convex' },
  './billing': { source: 'src/convex/integrations/billing.ts', kind: 'convex' },
  './email': { source: 'src/convex/integrations/email.ts', kind: 'convex' },
  './rate-limit': { source: 'src/convex/integrations/rate-limit.ts', kind: 'convex' },
  './migrations': { source: 'src/convex/integrations/migrations.ts', kind: 'convex' },
  './aggregate': { source: 'src/convex/integrations/aggregate.ts', kind: 'convex' },
  './search': { source: 'src/convex/integrations/search.ts', kind: 'convex' },
  './workflows': { source: 'src/convex/integrations/workflows.ts', kind: 'convex' },
  './ai': { source: 'src/convex/integrations/ai.ts', kind: 'convex' },
  './mcp': { source: 'src/runtime/server/mcp/index.ts', kind: 'runtime' },
  './component/convex.config': { source: 'src/convex/components/backend/convex.config.ts', kind: 'convex' },
  './component/_generated/component': { source: 'src/convex/components/backend/_generated/component.ts', kind: 'convex', typesOnly: true },
  './component/schema': { source: 'src/convex/components/backend/schema.ts', kind: 'convex' },
  './component/email': { source: 'src/convex/components/backend/email.ts', kind: 'convex' },
  './component/billing': { source: 'src/convex/components/backend/billing.ts', kind: 'convex' },
  './component/gifts': { source: 'src/convex/components/backend/gifts.ts', kind: 'convex' },
  './component/ai': { source: 'src/convex/components/backend/ai.ts', kind: 'convex' },
  './component/webhooks': { source: 'src/convex/components/backend/webhooks.ts', kind: 'convex' },
  './auth.config': { source: 'src/convex/auth.config.ts', kind: 'convex' },
  './test': { source: 'src/convex/test.ts', kind: 'raw' },
}

/**
 * The two component entries Convex itself imports (`convex.config`, the
 * generated `ComponentApi`) are also published under their `.js`-suffixed
 * spelling — the historically documented Convex import style — as exact
 * duplicates of the extensionless entry. Nothing else gets a dual.
 */
const COMPONENT_DUALS = ['./component/convex.config', './component/_generated/component']

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

  it('mirrors exports in typesVersions, key for key', () => {
    const typesVersions = packageJson.typesVersions['*']!
    // CSS entries have no declarations; the duals are covered by their twins.
    const expected = Object.entries(ENTRIES)
      .filter(([, entry]) => entry.kind !== 'css')
      .map(([key]) => (key === '.' ? '.' : key.slice('./'.length)))
    expect(Object.keys(typesVersions).sort()).toEqual(expected.sort())
    for (const [subpath, paths] of Object.entries(typesVersions)) {
      const key = subpath === '.' ? '.' : `./${subpath}`
      const condition = packageExports[key]!
      expect(paths, subpath).toEqual([typeof condition === 'string' ? condition : condition.types])
    }
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

// ---------------------------------------------------------------------------
// Export names — observed at runtime, written down here as literals.

/**
 * `Object.keys(await import(source)).sort()` per JavaScript entry. A changed
 * array is a surface change: a removal needs the deprecation cycle in
 * STABILITY.md, an addition needs docs.
 */
const EXPORT_NAMES: Record<string, string[]> = {
  '.': ['default'],
  './auth': ['createAuth', 'createAuthOptions', 'createBetterAuth', 'createBetterAuthOptions', 'defaultEmailTemplates', 'makeAuthApi', 'setupAuth'],
  './authorization': ['adminAc', 'createAccessControl', 'defaultStatements', 'setupAuthorization', 'userAc'],
  './http': ['registerBackendRoutes', 'setupMcp'],
  './functions': ['createFunctions'],
  './app': ['backendEnv'],
  './billing': ['ALL_BILLING_EVENTS', 'BILLING_REFRESH_EVENTS', 'BILLING_WEBHOOK_PROVISION_EVENTS', 'defaultGiftEmail', 'defineBillingCatalog', 'setupBilling'],
  './email': ['ALL_EMAIL_EVENTS', 'sendArgs', 'setupEmail'],
  './rate-limit': ['DEFAULT_LIMITS', 'HOUR', 'MINUTE', 'SECOND', 'setupRateLimiter'],
  './migrations': ['setupMigrations'],
  './aggregate': ['TableAggregate', 'Triggers', 'customCtx', 'customMutation', 'withTriggers'],
  './search': ['defineSearch', 'search'],
  './workflows': ['defineEmailSequence', 'setupWorkflows'],
  './ai': ['setupAi'],
  './mcp': ['BACKEND_MCP_FUNCTION_DEFAULTS', 'EXCHANGE_CACHE_MARGIN_MS', 'backendMcpFunction', 'builtinToolEnabled', 'createExchangeCache', 'defineBackendMcpTool', 'useBackendMcp'],
  './component/convex.config': ['default'],
  './component/schema': ['aiTables', 'authSchema', 'billingTables', 'default', 'tables', 'vEntitlementBenefit', 'vEntitlementMeter', 'vGift', 'vPendingSpend', 'webhookTables'],
  './component/email': ['cancel', 'get', 'handleWebhook', 'send', 'status'],
  './component/billing': ['clear', 'credit', 'debit', 'getBenefitMetadata', 'getByUser', 'release', 'settle', 'upsert', 'upsertBenefitMetadata', 'userByCustomer'],
  './component/gifts': ['create', 'get', 'listByEmail', 'markClaimed', 'markNotified', 'markPaid', 'resolveRecipient'],
  './component/ai': ['clear', 'createRequest', 'getByStream', 'markReleased', 'markSettled'],
  './component/webhooks': ['find', 'listRecent', 'record', 'vDeliveryOutcome'],
  './auth.config': ['default', 'defineBackendAuthConfig'],
  './test': ['default', 'register'],
}

/**
 * Entries whose module graph only evaluates inside the Convex runtime:
 * `defineComponent()` requires a `componentDefinitionPath` the Convex bundler
 * injects, so importing `convex.config.ts` here throws. Their names are read
 * statically (oxc-parser) instead of observed through `import()`.
 */
const STATIC_ONLY = ['./component/convex.config']

describe('entry export names', () => {
  it('freezes one literal array per JavaScript entry', () => {
    expect(Object.keys(EXPORT_NAMES).sort()).toEqual(jsEntries.map(([key]) => key).sort())
  })

  it.each(jsEntries.filter(([key]) => !STATIC_ONLY.includes(key)))('%s exports exactly the frozen names', async (key, entry) => {
    const namespace = await import(/* @vite-ignore */ resolve(root, entry.source)) as Record<string, unknown>
    expect(Object.keys(namespace).sort()).toEqual(EXPORT_NAMES[key])
  })

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

  it('never reaches an entry', () => {
    const leaked = Object.entries(ENTRIES)
      .filter(([, entry]) => entry.kind !== 'css')
      .flatMap(([key, entry]) => reachableExports(join(root, entry.source))
        .filter(candidate => candidate.internal)
        .map(candidate => `${key} → ${candidate.name} (${relative(root, candidate.origin)})`))
    expect(leaked).toEqual([])
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
// installs (STABILITY.md surface 3), frozen the same way as the export names.

const REGISTRY = {
  composables: ['useAuth', 'useAuthState', 'useConnectionState', 'useLoginFlow', 'useOrganization', 'useSearch', 'useAggregate', 'useCount', 'useBilling', 'useFeatures', 'useCredits', 'useGifts', 'usePasskeys', 'useSessions', 'describeUserAgent', 'unwrapAuth', 'useBackendConfig', 'useEmailStatus', 'useWorkflowStatus', 'useAiStream'],
  components: ['AuthForm', 'RoleBoundary', 'OrganizationBoundary', 'FeatureBoundary', 'AcceptInvitation', 'GiftClaimBanner', 'PricingTable', 'WorkspaceSettings', 'ProfileSettings', 'SecuritySettings'],
  server: ['backendAuth', 'useBackendMcp', 'defineBackendMcpTool'],
}

/** The experimental tier, by the names STABILITY.md lists. */
const EXPERIMENTAL = ['./mcp', './ai', 'useAiStream', 'useWorkflowStatus']

describe('the registry', () => {
  it('matches every name src/module.ts registers', () => {
    // Registrations are `{ name: 'x' }` / `{ name: 'x', as: 'y' }` literals;
    // the module meta (`name: 'nuxt-backend'`) is the only other `name:`.
    const registered = [...read('src/module.ts').matchAll(/\bname: '(\w[\w-]*)'(?:, as: '(\w+)')?/g)]
      .map(([, name, alias]) => alias ?? name!)
      .filter(name => name !== packageJson.name)
    expect(registered.sort()).toEqual(Object.values(REGISTRY).flat().sort())
  })
})

// ---------------------------------------------------------------------------
// Docs, TypeDoc, scaffold contract — the surface as it is described elsewhere.

const GENERATED_REFERENCE = join(root, 'website/content/7.api-reference/9.reference')

/** `a/{b,c}` → `a/b`, `a/c`; `…` (prose ellipsis) is a wildcard. */
function expandSubpath(subpath: string): string[] {
  const group = subpath.match(/^([^{]*)\{([^}]*)\}(.*)$/)
  if (!group) return [subpath.replace('…', '*')]
  return group[2]!.split(',').flatMap(part => expandSubpath(`${group[1]}${part}${group[3]}`))
}

function globToRegExp(pattern: string): RegExp {
  return new RegExp(`^${pattern.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`)
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
    const files = [join(root, 'README.md'), ...docs.filter(file => !file.startsWith(GENERATED_REFERENCE))]
    // The generated reference is TypeDoc's output, not prose written by hand —
    // it must actually be excluded, or a rename of the content tree silently
    // turns this into a scan of generated files that always passes.
    expect(docs.some(file => file.startsWith(GENERATED_REFERENCE))).toBe(true)
    expect(files.length).toBeGreaterThan(20)
    const unpublished: string[] = []
    let mentions = 0
    for (const file of files) {
      for (const [, raw] of readFileSync(file, 'utf8').matchAll(/['"`]nuxt-backend\/([^'"`\s]+)['"`]/g)) {
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
    expect(missing).toEqual([])
  })

  it('tags exactly the experimental tier', () => {
    // Module-level tags sit above the first import; composables carry theirs
    // on the function. Any other `@experimental` in src/ is a tier change
    // STABILITY.md must name.
    const tagged = walk(join(root, 'src'), '.ts').flatMap((file) => {
      const { comments, program } = parse(file)
      return comments.filter(comment => /@experimental\b/.test(comment.value)).map((comment) => {
        const statement = program.body.find(node => node.start >= comment.end)
        const declaration = statement?.type === 'ExportNamedDeclaration' ? statement.declaration : undefined
        return declaration && 'id' in declaration && declaration.id && 'name' in declaration.id
          ? String(declaration.id.name)
          : relative(root, file)
      })
    })
    const expected = EXPERIMENTAL.map(name => (name.startsWith('./') ? ENTRIES[name]!.source : name))
    expect(tagged.sort()).toEqual(expected.sort())
  })

  it('documents exactly the runtime and convex entries with TypeDoc', () => {
    // One reference page per public module: every source behind a runtime or
    // convex subpath is an entry point, and the only entry points that carry no
    // subpath are the auto-imported composables — reached by name rather than
    // by import path, so they have a page but never an `exports` key.
    // `./component/_generated/component` is the one subpath left out: Convex
    // generates it and it ships types only, so it is not hand-documented.
    const typedoc = JSON.parse(stripJsonComments(read('typedoc.json'))) as { entryPoints: string[] }
    const COMPOSABLES = 'src/runtime/vue/composables/'
    const documented = Object.values(ENTRIES)
      .filter(entry => (entry.kind === 'runtime' || entry.kind === 'convex') && !entry.typesOnly)
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

  it.each(Object.entries(REQUIRED_FUNCTION_EXPORTS))('scaffolds every contract name of %s.ts, in both installations', (module, names) => {
    // The doctor contract (`src/contract.ts`) must be a subset of what the
    // scaffold writes, or a fresh project fails its own doctor.
    for (const [installation, templates] of [['default', BACKEND_FILE_TEMPLATES], ['local', LOCAL_BACKEND_FILE_TEMPLATES]] as const) {
      const template = templates[`${module}.ts`]
      expect(template, `${installation} scaffold has ${module}.ts`).toBeDefined()
      const exported = staticExportNames(`${installation}/${module}.ts`, template)
      expect(exported, `${installation} ${module}.ts`).toEqual(expect.arrayContaining([...names]))
    }
  })
})

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
