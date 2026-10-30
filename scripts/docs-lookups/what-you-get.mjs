/**
 * Each landing's "What you get" (`::what-you-get{area="billing"}`):
 * the pages, components, composables, Nitro auto-imports, routes, setup
 * helpers, env names and findings that carry the area's tag
 * (areas.mjs), each linked to its own reference entry. Written as
 * website/shared/what-you-get.json, which the component and the agent
 * Markdown both read.
 *
 * Beside the tabs, `first-run` is Start › What you just got: everything the
 * first `nuxt-backend dev` gives an app, read from the same registries plus
 * the scaffold (src/templates.ts), the env a new local deployment is given
 * (planEnvPush) and the component's maintenance
 * tasks, so a file, page, route or task added later appears there unedited.
 */
import { BACKEND_ENV } from '../../src/env-registry.ts'
import { planEnvPush } from '../../src/env-push.ts'
import { FINDINGS } from '../../src/findings/index.ts'
import { BACKEND_PAGE_DEFS } from '../../src/pages/registry.ts'
import { BACKEND_FILE_TEMPLATES } from '../../src/templates.ts'
import { setupHelpers } from './backend.mjs'
import { COMPONENT_AREAS, COMPOSABLE_AREAS, deadTags, envArea, HELPER_AREAS, PAGE_AREAS, ROUTE_AREAS, SERVER_AREAS, FINDING_GROUP_AREAS, tagOf } from './areas.mjs'
import { findingIds } from './cli.mjs'
import { REGENERATED } from './configuration.mjs'
import { familyPageOf } from './components.mjs'
import { composableApi } from './nuxt.mjs'
import { PAGES } from './paths.mjs'
import { readText } from './source.mjs'
import { apiPageOf, AREAS, pathSlug, registered } from './registry.mjs'

/** Each kind as a landing lists it, and the page that lists all of them. */
const KINDS = {
  'Pages': `${PAGES.httpRoutes}#in-the-nuxt-app`,
  'Components': PAGES.components,
  'Composables': PAGES.composables,
  'Nitro auto-imports': '/docs/reference/nuxt/server-utilities',
  'Routes': PAGES.httpRoutes,
  'Setup helpers': PAGES.setupHelpers,
  'Environment variables': `${PAGES.envVars}#every-variable`,
  'Findings': PAGES.diagnostics,
}

/** Fails on a tag map key the code no longer has: a dead tag. */
function assertLive(map, names, what) {
  const dead = deadTags(map, names)
  if (dead.length) throw new Error(`areas.mjs tags ${what} the code does not have: ${dead.join(', ')}`)
}

/** Every item the package ships, with its kind, its tags and its own reference entry. */
function items() {
  const { composables, components, server } = registered()
  const helpers = setupHelpers()
  assertLive(COMPOSABLE_AREAS, composables.map(item => item.name), 'composables')
  assertLive(COMPONENT_AREAS, components.map(item => item.name), 'components')
  assertLive(PAGE_AREAS, BACKEND_PAGE_DEFS.map(def => def.key), 'pages')
  assertLive(HELPER_AREAS, helpers.map(item => item.name), 'setup helpers')
  assertLive(SERVER_AREAS, server, 'Nitro auto-imports')
  return [
    ...BACKEND_PAGE_DEFS.map(def => ({ kind: 'Pages', name: def.defaultPath, to: KINDS.Pages, tabs: [tagOf(PAGE_AREAS, def.key, 'the page'), 'ui'] })),
    ...components.map(({ name }) => ({ kind: 'Components', name: `<${name}>`, to: `${PAGES.components}/${familyPageOf(name)}#${name.toLowerCase()}`, tabs: [tagOf(COMPONENT_AREAS, name, 'the component'), 'ui'] })),
    ...composables.map(({ name, file }) => ({ kind: 'Composables', name, to: composableApi(file) ?? `${PAGES.composables}#at-a-glance`, tabs: [tagOf(COMPOSABLE_AREAS, name, 'the composable')] })),
    ...server.map(name => ({ kind: 'Nitro auto-imports', name, to: KINDS['Nitro auto-imports'], tabs: [tagOf(SERVER_AREAS, name, 'the Nitro auto-import')] })),
    ...Object.entries(ROUTE_AREAS).map(([route, tab]) => ({ kind: 'Routes', name: route, to: PAGES.httpRoutes, tabs: [tab] })),
    ...helpers.map(({ name, path }) => ({ kind: 'Setup helpers', name, to: apiPageOf(pathSlug(path)) ?? PAGES.setupHelpers, tabs: [tagOf(HELPER_AREAS, name, 'the helper')] })),
    ...Object.keys(BACKEND_ENV).map(name => ({ kind: 'Environment variables', name, to: KINDS['Environment variables'], tabs: [envArea(name)] })),
    ...findingIds().map(id => ({ kind: 'Findings', name: id, to: `${PAGES.diagnostics}#${id}`, tabs: [FINDING_GROUP_AREAS[FINDINGS[id].group]] })),
  ]
}

/** Where the first run's own kinds are documented. */
const FIRST_RUN = {
  files: '/docs/reference/configuration/project-files#every-file',
  maintenance: '/docs/build/data/jobs/scheduled#the-maintenance-the-component-runs',
}

/**
 * The component's maintenance tasks, by name: the keys of the object that
 * runs them, then the email records' prune, which the email provider
 * component batches itself.
 */
function maintenanceTasks() {
  const source = readText('src/convex/components/backend/maintenance.ts')
  const start = source.indexOf('export const MAINTENANCE_TASKS = {')
  const tasks = [...source.slice(start, source.indexOf('\n}', start)).matchAll(/^ {2}(\w+): async/gm)].map(([, name]) => name)
  const email = source.match(/^const EMAIL_RECORDS_TASK = '(\w+)'$/m)?.[1]
  if (start === -1 || tasks.length === 0 || !email) throw new Error('what-you-get: read no maintenance task from src/convex/components/backend/maintenance.ts')
  return [...tasks, email]
}

/**
 * Everything the first run gives an app, by kind: the scaffold's files
 * (yours, then the regenerated ones), every page, route, composable and
 * component, the env a new local deployment is given, and the maintenance
 * the component starts running.
 */
function firstRun(all) {
  const files = Object.keys(BACKEND_FILE_TEMPLATES)
  const file = name => ({ name: `backend/${name}`, to: FIRST_RUN.files })
  const ofKind = kind => all.filter(item => item.kind === kind).map(({ name, to }) => ({ name, to }))
  const provisioned = planEnvPush({ deployedNames: [], localEnv: {}, dev: true })
    .filter(action => action.action === 'provision')
    .map(action => action.name)
  const env = [...new Set(provisioned)].map(name => ({ name, to: KINDS['Environment variables'] }))
  return [
    { kind: 'Your files', items: files.filter(name => !REGENERATED[name]).map(file) },
    { kind: 'Regenerated files', items: [...files.filter(name => REGENERATED[name]), '_generated/'].map(file) },
    { kind: 'Pages', items: ofKind('Pages') },
    { kind: 'Routes', items: ofKind('Routes') },
    { kind: 'Composables', items: ofKind('Composables') },
    { kind: 'Components', items: ofKind('Components') },
    { kind: 'Env it sets', items: env },
    { kind: 'Maintenance', items: maintenanceTasks().map(name => ({ name, to: FIRST_RUN.maintenance })) },
  ]
}

/** What each tab gets, by kind; and for the Reference tab, how many of each kind there are in all. */
export function whatYouGet() {
  const all = items()
  const kinds = Object.keys(KINDS)
  for (const kind of kinds) {
    if (!all.some(item => item.kind === kind)) throw new Error(`what-you-get: read no ${kind.toLowerCase()} from the code; a reader in scripts/docs-lookups/ lost its source`)
  }
  const byTab = Object.fromEntries(Object.keys(AREAS).map(tab => [tab, kinds
    .map(kind => ({ kind, items: all.filter(item => item.kind === kind && item.tabs.includes(tab)).map(({ name, to }) => ({ name, to })) }))
    .filter(group => group.items.length > 0)]))
  const reference = kinds.map((kind) => {
    const count = all.filter(item => item.kind === kind).length
    return { kind, items: [{ name: `${count} in all`, to: KINDS[kind], label: `${count} ${kind.toLowerCase()} in all` }] }
  })
  return `${JSON.stringify({ ...byTab, reference, 'first-run': firstRun(all) }, null, 2)}\n`
}
