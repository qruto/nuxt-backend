/**
 * The registries the lookups share, read from the code: what the module
 * registers in an app (scripts/lib/surface.mjs reads src/nuxt/), the
 * experimental tier, the docs areas, and where each name's generated API page
 * is.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { REFERENCE_DIR, REFERENCE_ROUTE } from '../../website/shared/docs-routes.ts'
import { moduleRegistry } from '../lib/surface.mjs'
import { docOf, firstSentence, readText, root } from './source.mjs'

let registry

/** What the module registers, read once. */
export const registered = () => (registry ??= moduleRegistry())

/** Every auto-imported composable and helper the module registers, in registration order, with its file. */
export const registeredComposables = () => registered().composables

/** Every component the module registers from its own runtime, in registration order, with its file. */
export const registeredComponents = () => registered().components

/** The names STABILITY.md lists in its experimental tier, subpaths included (`nuxt-backend/ai`). */
export function experimentalNames() {
  const stability = readText('STABILITY.md')
  const start = stability.indexOf('## The experimental tier')
  const end = stability.indexOf('## Deprecation')
  if (start === -1 || end < start) throw new Error('STABILITY.md has no "## The experimental tier" section before "## Deprecation"')
  const names = stability.slice(start, end).split('\n')
    .filter(line => line.startsWith('- '))
    .flatMap(line => [...line.split(' — ')[0].matchAll(/`([^`]+)`/g)].map(([, name]) => name))
  if (names.length === 0) throw new Error('STABILITY.md\'s experimental tier lists no name')
  return new Set(names)
}

/** The tier of a name: experimental when STABILITY.md says so, stable otherwise. */
export function tierOf(name) {
  return experimentalNames().has(name) ? 'experimental' : 'stable'
}

/**
 * The areas an area tag can name (areas.mjs), with the title each is shown
 * under: Start, the Build groups, Develop's agents and Ship. A landing's
 * "What you get" (`::what-you-get{area="billing"}`) lists one area.
 */
export const AREAS = {
  start: 'Start',
  auth: 'Auth',
  billing: 'Billing',
  email: 'Email',
  ai: 'AI',
  agents: 'Agents',
  data: 'Data',
  ui: 'UI',
  ship: 'Ship',
}

/** An area's title. */
export function areaTitle(area) {
  const title = AREAS[area]
  if (!title) throw new Error(`no area ${area} (scripts/docs-lookups/registry.mjs AREAS)`)
  return title
}

/** The generated API page of a source file, when TypeDoc wrote one: `/docs/reference/api/use-billing`. */
export function apiPageOf(slug) {
  return existsSync(join(root, 'website/content', REFERENCE_DIR, `${slug}.md`)) ? `${REFERENCE_ROUTE}/${slug}` : undefined
}

/** A file's basename, which names its generated API page: `src/runtime/vue/composables/use-auth.ts` → `use-auth`. */
export const basename = file => file.slice(file.lastIndexOf('/') + 1).replace(/\.ts$/, '')

/** The first sentence of an export's doc comment. */
export const summaryOf = (file, name) => firstSentence(docOf(file, name))

/** The generated API page's slug for an import path: `nuxt-backend/auth.config` → `auth-config`, `nuxt-backend` → `module`. */
export const pathSlug = path => path === 'nuxt-backend' ? 'module' : path.slice('nuxt-backend/'.length).replace(/[./]/g, '-').replace(/^_generated-component$/, 'convex-config')
