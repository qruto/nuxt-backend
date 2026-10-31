/**
 * The package surface an app imports or gets auto-imported: the exports map
 * (package.json, with each entry's value exports read from its source), the
 * composables the module registers (src/nuxt/registry.ts) and the ones the
 * base module passes through, and the README's inventory of both.
 */
import { baseModuleSurface, entrypoints, typeMembers } from '../lib/surface.mjs'
import { COMPONENT_AREAS, COMPOSABLE_AREAS, tagOf } from './areas.mjs'
import { code, codes, link, list, table } from './markdown.mjs'
import { apiPageOf, basename, experimentalNames, pathSlug, registered, registeredComponents, registeredComposables, summaryOf, areaTitle, tierOf } from './registry.mjs'
import { valueExports } from './source.mjs'

// --- Entrypoints -------------------------------------------------------------

/**
 * What each subpath is for, in one line. A subpath added to the exports map
 * needs its line here: the lookup throws without one.
 */
export const USE_FOR = {
  '.': 'The Nuxt module: `modules: [\'nuxt-backend\']`, configured under the `backend` key',
  './auth': '`setupAuth`, the app\'s auth from one call, and `APIError` for hooks that refuse',
  './http': '`registerBackendRoutes`: the auth routes, both webhooks, `/ai/stream`, the agent token exchange and the health route in one call',
  './functions': '`createFunctions` (every access tier from one call: `authed`, `workspace`, `admin`, `withRole`, `withFeature` and `setUserRole`), the error catalog, `verifyHuman`, the sensitive-action table, `defineRetention` (rows that age out, deleted in batches) and the token helpers `randomToken`, `sha256Hex` and `normalizeEmail`',
  './app': '`backendEnv`: the typed deployment env contract `convex.config.ts` passes to `defineApp`',
  './billing': '`setupBilling` and `defineBillingCatalog`: subscriptions, credits, gifts and the catalog',
  './email': '`setupEmail`: transactional and marketing email, and every template the package sends',
  './rate-limit': '`setupRateLimiter` and `DEFAULT_LIMITS`, with the time units',
  './search': '`defineSearch` and `search`: typed full-text search over a search index',
  './workflows': '`setupWorkflows` and `defineEmailSequence`: durable multi-step functions',
  './audit': '`setupAudit` for `audit.ts`: the activity trail, `recordBackendEvent` for events of your own, and the event catalog',
  './access': '`setupAccess` for `access.ts`: launch phases (early access, invite only, public), invite codes, access links and invitations by address, checked in the sign-in hooks, and `setupWaitlist` for `waitlist.ts`: the verified waitlist for early access',
  './account': '`setupAccount` for `account.ts`: an account\'s data export, its complete erasure with your own tables as sources, and the registry of what the package keeps of a person',
  './admin': '`setupAdmin` for `admin.ts`: the admin console\'s reads of every account and workspace, for administrators',
  './storage': '`setupStorage` for `storage.ts`: checked uploads stored with their owner records, expiring private URLs, share links and the orphan sweep',
  './notifications': '`setupNotifications` for `notifications.ts`: the in-app inbox, its reads and writes, and `notify`, which turns events of your own into notifications',
  './flags': '`defineFlags` and `setupFlags` for `flags.ts`: feature flags read inside queries and mutations, and the kill switches',
  './ai': '`setupAi`: metered actions and persisted streams, reserved and settled in credits',
  './monitoring': '`reportError`, `reportingErrors` and `checkIn`: error reports and cron check-ins from your own actions',
  './convex.config': 'The all-in-one `backend` component, which `convex.config.ts` mounts',
  './_generated/component': 'The `ComponentApi` type of the `backend` component (types only)',
  './auth.config': '`defineBackendAuthConfig`: the default export of `auth.config.ts`',
  './test': '`defineBackendTestApp`, `asUser`, `seedWorkspace` and `register` for `convex-test`',
  './test-utils': '`createBackendMock` and `backendTestAliases`: a fake backend under the composables in component and page tests',
  './eslint': '`backendEslint`: the platform\'s lint rules for the functions directory',
}

/** Where code that imports a subpath runs. */
function runsIn(source, typesOnly) {
  if (typesOnly) return 'types only'
  if (source === 'src/module.ts') return '`nuxt.config` (build time)'
  if (source === 'src/eslint.ts') return '`eslint.config` (lint time)'
  if (source === 'src/convex/test.ts') return 'Vitest (`convex-test`)'
  if (source.startsWith('src/runtime/test-utils/')) return 'Vitest (`nuxt` environment)'
  if (source.startsWith('src/runtime/server/')) return 'Nitro (`server/`)'
  return 'Convex functions (`backend/`)'
}

/** One entry of the exports map, read from the code. */
function entryOf({ subpath, path, source, typesOnly }) {
  const useFor = USE_FOR[subpath]
  if (!useFor) throw new Error(`the exports map's ${subpath} has no line in USE_FOR (scripts/docs-lookups/nuxt.mjs)`)
  return { subpath, path, source, useFor, runs: runsIn(source, typesOnly), values: typesOnly ? [] : valueExports(source), api: apiPageOf(pathSlug(path)) }
}

/** The exports map, one row per subpath. */
export function entrypointsTable() {
  return table(['Import', 'Runs in', 'Tier', 'Exports', 'For'], entrypoints().map(entryOf).map(entry => [
    entry.api ? link(code(entry.path), entry.api) : code(entry.path),
    entry.runs,
    tierOf(entry.path),
    codes(entry.values),
    entry.useFor,
  ]))
}

/** `name ....... a · b · c`, wrapped under its first value past `width` characters. */
function treeLine(prefix, name, values, width = 96) {
  const head = `${prefix}${name} `.padEnd(40, '.')
  const lines = []
  let line = `${head} `
  for (const [index, value] of values.entries()) {
    const piece = `${index ? ' · ' : ''}${value}`
    if (line.length + piece.length > width && index > 0) {
      lines.push(line.trimEnd())
      line = `${' '.repeat(head.length + 1)}${value}`
    }
    else line += piece
  }
  lines.push(line.trimEnd())
  return lines.join('\n')
}

/** Lines of a tree, each kind's branch drawn, the last one closed. */
const branches = rows => rows.map(([name, values], index) => treeLine(index === rows.length - 1 ? '└─ ' : '├─ ', name, values))

/**
 * The import tree: every subpath with its value exports, then what the
 * module and the base module auto-import, the injection, and the aliases.
 */
export function importTree() {
  const entries = entrypoints().map(entryOf)
  const { components, aliases, server, middleware, appAliases } = registered()
  const base = baseModuleSurface()
  const imports = branches(entries.map(entry => [entry.path, entry.values.length ? entry.values : ['(types)']]))
  const auto = branches([
    ['composables', registeredComposables().map(({ name }) => name)],
    ['base composables', base.composables],
    ['components', [...components, ...aliases].map(({ name }) => `<${name}>`)],
    ['base components', base.components.map(name => `<${name}>`)],
    ['route middleware', middleware],
    ['injection', ['useNuxtApp().$convex']],
    ['Nitro', [...server, ...base.server]],
  ])
  return `\`\`\`text\nexplicit imports\n${imports.join('\n')}\n\nauto-imports (no import statement)\n${auto.join('\n')}\n\naliases (Vite and Nitro)\n${branches([['functions directory', appAliases]]).join('\n')}\n\`\`\``
}

// --- Composables -------------------------------------------------------------

/** A composable's generated API page, by the file that exports it. */
export const composableApi = file => file.includes('/composables/') && !file.endsWith('/base-aliases.ts') ? apiPageOf(basename(file)) : undefined

/** What the base module's aliases are, which carry no doc comment of their own. */
const ALIAS_SUMMARY = {
  useConnectionState: 'The live connection to the deployment, under a neutral name for the base module\'s.',
  useBackendClient: 'The imperative client, under a neutral name for the base module\'s.',
}

/**
 * One registered composable or helper as the composables table states it:
 * its tab, tier, summary and generated API page. The docs MCP's
 * `get-composable` answers with the same record (docs-mcp.mjs).
 */
export function composableFacts({ name, file }) {
  const api = composableApi(file)
  return {
    tab: areaTitle(tagOf(COMPOSABLE_AREAS, name, 'the composable')),
    tier: tierOf(name),
    summary: ALIAS_SUMMARY[name] ?? summaryOf(file, name),
    ...(api ? { api } : {}),
  }
}

/** One row per registered composable or helper: its tab, tier, summary and API page. */
export function composablesTable() {
  return table(['Name', 'Tab', 'Tier', 'What it is', 'API'], registeredComposables().map((composable) => {
    const facts = composableFacts(composable)
    return [code(composable.name), facts.tab, facts.tier, facts.summary, facts.api ? link('API', facts.api) : 'none']
  }))
}

/** The base module's composables, listed apart. */
export function baseComposablesList() {
  return `${codes(baseModuleSurface().composables)}.`
}

/** The member names of a composable's `Use<Name>Return` type, what it extends included, when its file names one. */
export function returnShape(name, file) {
  return typeMembers(file, `${name[0].toUpperCase()}${name.slice(1)}Return`)
}

/** The fields Composable conventions names, which a composable returns when it reads or acts. */
const CONVENTION_FIELDS = ['isLoading', 'isPending', 'error']

/** One row per composable whose `Use<Name>Return` has any of the convention's fields: which ones it returns. */
export function conventionsTable() {
  const rows = registeredComposables().flatMap(({ name, file }) => {
    const shape = returnShape(name, file)
    return shape?.some(field => CONVENTION_FIELDS.includes(field)) ? [[code(name), ...CONVENTION_FIELDS.map(field => shape.includes(field) ? 'yes' : '')]] : []
  })
  return table(['Composable', ...CONVENTION_FIELDS.map(code)], rows)
}

// --- README inventory --------------------------------------------------------

/** A summary as the tail of a list item: lower-cased first word, no closing period. */
const asTail = summary => summary.replace(/\.$/, '').replace(/^([A-Z])(?=[a-z-]*[\s,:;])/, first => first.toLowerCase())

/** The README's composables list: every composable of the package's own, one per line, sorted. The base module's aliases are in the paragraph after it. */
export function readmeComposables() {
  return list(registeredComposables()
    .filter(({ name }) => name.startsWith('use') && !ALIAS_SUMMARY[name])
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .map(({ name, file }) => `\`${name}\` — ${asTail(summaryOf(file, name))}${experimentalNames().has(name) ? ' (experimental)' : ''}`))
}

/** The README's components list: every registered component, one per line, sorted. */
export function readmeComponents() {
  return list(registeredComponents()
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .map(({ name, file }) => {
      tagOf(COMPONENT_AREAS, name, 'the component')
      return `\`<${name}>\` — ${asTail(summaryOf(file, name))}`
    }))
}
