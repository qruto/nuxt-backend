/**
 * Every lookup the docs generate from the code: the file it writes, the
 * region of that file it owns (or the whole file), the registry it reads,
 * and how it renders. scripts/docs-lookups.mjs writes them;
 * test/docs/docs-lookups.test.ts fails while a file and its lookups have
 * drifted apart.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { appRoutesTable, backendEventsTable, billingEventsTable, componentFunctionsTable, componentTablesTable, browserStorageTable, dataInventoryTable, dataMapTable, deploymentRoutesTable, emailEventsTable, limitsTable, noPersonalDataTable, retentionTable, setupHelpersTable, subprocessorsTable } from './backend.mjs'
import { cheatSheet } from './cheat-sheet.mjs'
import { commandPaths, contractLine, contractRegion, diagnostics, findingIdsSource, reportSchema } from './cli.mjs'
import { contractTable, FAMILY_PAGES, familiesTable, familySections, familyTable, tokensTable } from './components.mjs'
import { DOCS_MCP_LOOKUPS_FILE, DOCS_MCP_PAGE_FILE, docsMcpLookups, docsMcpToolsTable } from './docs-mcp.mjs'
import { agentSkillsTable, appConfigTable, catalogIds, catalogTypes, envExample, envTable, labelGroups, projectFilesTable, projectTree } from './configuration.mjs'
import { errorCodes } from './errors.mjs'
import { FEATURE_MAP_FILE, featureMap } from './feature-map.mjs'
import { hooksSections } from './hooks.mjs'
import { capabilitiesPage } from './capabilities.mjs'
import { baseComposablesList, composablesTable, conventionsTable, entrypointsTable, importTree, readmeComponents, readmeComposables } from './nuxt.mjs'
import { writeRegion } from './regions.mjs'
import { sectionsOf } from './sections.mjs'
import { sensitiveActionsTable } from './sensitive-actions.mjs'
import { root } from './source.mjs'
import { whatYouGet } from './what-you-get.mjs'

const REFERENCE = 'website/content/docs/10.reference'
const CONFIGURATION = `${REFERENCE}/05.configuration`
const COMPONENTS = `${REFERENCE}/07.components`
const BACKEND = `${REFERENCE}/08.backend`
const CLI = `${REFERENCE}/09.cli`

/** The data `::what-you-get` renders on every tab landing. */
export const WHAT_YOU_GET_FILE = 'website/shared/what-you-get.json'

/**
 * `{ file, region, source, render }`: `render()` returns the region's body
 * (or, with no `region`, the whole file).
 */
export const LOOKUPS = [
  // Configuration
  { file: `${CONFIGURATION}/3.environment-variables.md`, region: 'env', source: 'src/env-registry.ts', render: envTable },
  { file: `${CONFIGURATION}/3.environment-variables.md`, region: 'env-example', source: 'src/capabilities/env-example.ts', render: envExample },
  { file: `${CONFIGURATION}/4.app-config.md`, region: 'app-config', source: 'src/runtime/config.ts', render: appConfigTable },
  { file: `${CONFIGURATION}/5.labels.md`, region: 'labels', source: 'src/convex/labels.ts', render: labelGroups },
  { file: `${CONFIGURATION}/6.project-files.md`, region: 'project-tree', source: 'src/templates.ts', render: projectTree },
  { file: `${CONFIGURATION}/6.project-files.md`, region: 'project-files', source: 'src/templates.ts and src/contract.ts', render: projectFilesTable },
  { file: `${CONFIGURATION}/7.catalogs.md`, region: 'catalog-types', source: 'src/convex/catalog.ts', render: catalogTypes },
  { file: `${CONFIGURATION}/7.catalogs.md`, region: 'catalog-ids', source: 'src/convex/integrations/billing/types/records.ts', render: catalogIds },
  // Start
  { file: FEATURE_MAP_FILE, region: 'feature-map', source: 'each page\'s capability, status and unit', render: featureMap },
  // The package and the Nuxt app
  { file: `${REFERENCE}/01.capabilities.md`, region: 'capabilities', source: 'src/capabilities/registry.ts', render: capabilitiesPage },
  { file: `${REFERENCE}/02.cheat-sheet.md`, region: 'cheat-sheet', source: 'the registries', render: cheatSheet },
  { file: `${REFERENCE}/04.entrypoints.md`, region: 'import-tree', source: 'package.json and src/nuxt/registry.ts', render: importTree },
  { file: `${REFERENCE}/04.entrypoints.md`, region: 'entrypoints', source: 'package.json', render: entrypointsTable },
  { file: `${REFERENCE}/06.nuxt/1.composables.md`, region: 'composables', source: 'src/nuxt/registry.ts', render: composablesTable },
  { file: `${REFERENCE}/06.nuxt/1.composables.md`, region: 'base-composables', source: 'nuxt-convex-module', render: baseComposablesList },
  { file: `${REFERENCE}/06.nuxt/2.conventions.md`, region: 'conventions', source: 'the composables\' return types', render: conventionsTable },
  // Auth
  { file: 'website/content/docs/04.build/1.auth/3.access/4.step-up.md', region: 'sensitive-actions', source: 'src/convex/sensitive-actions.ts', render: sensitiveActionsTable },
  // Components
  { file: `${COMPONENTS}/index.md`, region: 'contract', source: 'test/nuxt/component-contract.ts', render: contractTable },
  { file: `${COMPONENTS}/index.md`, region: 'families', source: 'src/nuxt/registry.ts', render: familyTable },
  ...Object.keys(FAMILY_PAGES).map((family, index) => ({ file: `${COMPONENTS}/${index + 1}.${family}.md`, region: `family-${family}`, source: 'src/runtime/vue/components', render: () => familySections(family) })),
  { file: `${COMPONENTS}/5.theme-tokens.md`, region: 'tokens', source: 'src/runtime/vue/components/tokens.css', render: tokensTable },
  { file: `${COMPONENTS}/5.theme-tokens.md`, region: 'families', source: 'test/nuxt/component-contract.ts', render: familiesTable },
  // Backend
  { file: `${BACKEND}/index.md`, region: 'setup-helpers', source: 'package.json and src/templates.ts', render: setupHelpersTable },
  { file: `${BACKEND}/1.component.md`, region: 'component-functions', source: 'src/convex/components/backend/_generated/component.ts', render: componentFunctionsTable },
  { file: `${BACKEND}/1.component.md`, region: 'component-tables', source: 'src/convex/components/backend/schema.ts', render: componentTablesTable },
  { file: `${BACKEND}/2.http-routes.md`, region: 'deployment-routes', source: 'src/convex/integrations/http.ts', render: deploymentRoutesTable },
  { file: `${BACKEND}/2.http-routes.md`, region: 'app-routes', source: 'src/pages/', render: appRoutesTable },
  { file: `${BACKEND}/3.events.md`, region: 'backend-events', source: 'src/convex/events.ts', render: backendEventsTable },
  { file: `${BACKEND}/3.events.md`, region: 'billing-events', source: 'src/convex/integrations/billing/events.ts', render: billingEventsTable },
  { file: `${BACKEND}/3.events.md`, region: 'email-events', source: 'src/convex/integrations/email.ts', render: emailEventsTable },
  { file: `${BACKEND}/5.errors.md`, region: 'error-codes', source: 'src/convex/errors.ts', render: errorCodes },
  { file: `${BACKEND}/6.hooks.md`, region: 'hooks', source: 'the setup helpers\' option types', render: hooksSections },
  { file: `${BACKEND}/7.limits.md`, region: 'rate-limits', source: 'src/convex/integrations/rate-limit.ts', render: limitsTable },
  { file: `${BACKEND}/7.limits.md`, region: 'retention', source: 'the constants it names', render: retentionTable },
  // Ship
  { file: 'website/content/docs/05.ship/4.compliance/1.privacy.md', region: 'data-inventory', source: 'src/convex/account-data.ts', render: dataInventoryTable },
  { file: 'website/content/docs/05.ship/4.compliance/1.privacy.md', region: 'no-personal-data', source: 'src/convex/account-data.ts', render: noPersonalDataTable },
  { file: 'website/content/docs/05.ship/4.compliance/1.privacy.md', region: 'subprocessors', source: 'src/convex/legal.ts', render: subprocessorsTable },
  { file: 'website/content/docs/05.ship/4.compliance/1.privacy.md', region: 'data-map', source: 'src/convex/account-data.ts and src/convex/legal.ts', render: dataMapTable },
  { file: 'website/content/docs/05.ship/4.compliance/1.privacy.md', region: 'browser-storage', source: 'src/convex/legal.ts', render: browserStorageTable },
  // CLI
  ...commandPaths().map(path => ({ file: `${CLI}/index.md`, region: contractRegion(path), source: 'src/cli/contract.ts', render: () => contractLine(path) })),
  { file: `${CLI}/1.diagnostics.md`, region: 'diagnostics', source: 'src/findings/', render: diagnostics },
  { file: `${CLI}/1.diagnostics.md`, region: 'doctor-report', source: 'website/public/schemas/doctor.json', render: reportSchema },
  { file: 'website/shared/docs-routes.ts', region: 'finding-ids', source: 'src/findings/index.ts', render: findingIdsSource },
  { file: 'website/shared/docs-routes.ts', region: 'generated-sections', source: 'scripts/docs-lookups/sections.mjs', render: () => generatedSectionsSource() },
  // Agents
  { file: 'website/content/docs/03.develop/8.agents/1.skills.md', region: 'agent-skills', source: 'src/guidance/skills.ts', render: agentSkillsTable },
  { file: DOCS_MCP_PAGE_FILE, region: 'docs-mcp-tools', source: 'website/shared/docs-mcp.ts', render: docsMcpToolsTable },
  { file: DOCS_MCP_LOOKUPS_FILE, source: 'the registries', render: docsMcpLookups },
  // Every tab landing, and the README
  { file: WHAT_YOU_GET_FILE, source: 'scripts/docs-lookups/areas.mjs', render: whatYouGet },
  { file: 'README.md', region: 'readme-composables', source: 'src/nuxt/registry.ts', render: readmeComposables },
  { file: 'README.md', region: 'readme-components', source: 'src/nuxt/registry.ts', render: readmeComponents },
]

/** The site route of a content file: numeric prefixes and `.md` dropped, `index` folded into its folder. */
const routeOf = file => `/${file.slice('website/content/'.length).replace(/\.md$/, '').split('/').map(segment => segment.replace(/^\d+\./, '')).filter(segment => segment !== 'index').join('/')}`

/**
 * The search sections the lookups generate (most of their lines inside a
 * region), as the route table spells them for search to rank below the
 * sections written by hand.
 */
function generatedSectionsSource() {
  const files = [...new Set(LOOKUPS.filter(lookup => lookup.file.startsWith('website/content/')).map(lookup => lookup.file))]
  const ids = files.flatMap(file => sectionsOf(routeOf(file), expectedText(file)).filter(section => section.generated).map(section => section.id)).sort()
  return [
    '/**',
    ' * The search sections the docs lookups generate from the code, which search',
    ' * ranks below the sections written by hand (shared/search-ranking.ts),',
    ' * written here by `pnpm docs:lookups`.',
    ' */',
    'export const GENERATED_SECTIONS: readonly string[] = [',
    ...ids.map(id => `  '${id}',`),
    ']',
  ].join('\n')
}

/** The files the lookups write. */
export const lookupFiles = () => [...new Set(LOOKUPS.map(lookup => lookup.file))]

/** A file's current text, or `''` before a whole-file lookup first writes it. */
export function currentText(file) {
  const path = join(root, file)
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

/** A file's text as its lookups would write it, from its current text. */
export function expectedText(file, current = currentText(file)) {
  return LOOKUPS.filter(lookup => lookup.file === file).reduce((text, lookup) => lookup.region
    ? writeRegion(file, text, lookup.region, lookup.render(), lookup.source)
    : lookup.render(), current)
}

export { readRegion, regionNames } from './regions.mjs'
export { APP_CALLABLE, BILLING_BUILT_IN, DEPLOYMENT_ROUTES } from './backend.mjs'
export { ROUTE_AREAS } from './areas.mjs'
export { FINDING_DOCS } from './cli.mjs'
export { USE_FOR } from './nuxt.mjs'
