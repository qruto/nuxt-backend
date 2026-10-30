/**
 * Start › Feature map: every docs page that names a `capability:` in its
 * frontmatter, as one row of its capability's section, with its title, its
 * description and its status (website/shared/docs-capabilities.ts). A planned or
 * changing page's status names the unit of the release plan that closes the
 * gap (website/shared/planned.ts). Nobody lists a feature by hand: a page
 * joins the map, moves between sections or changes status by its own
 * frontmatter, and `pnpm docs:lookups` rewrites the region.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DOCS_CAPABILITIES } from '../../website/shared/docs-capabilities.ts'
import { DOCS_SOURCES, REFERENCE_DIR } from '../../website/shared/docs-routes.ts'
import { journeyOrder } from '../../website/shared/agent-surfaces.ts'
import { docsFiles } from '../lib/docs-pages.mjs'
import { frontmatter } from '../lib/frontmatter.mjs'
import { blocks, link, table } from './markdown.mjs'
import { root } from './source.mjs'

/** The page the map is written into. */
export const FEATURE_MAP_FILE = 'website/content/docs/01.start/6.feature-map.md'

/** What each `status` reads as on the map: the legend's words. */
export const STATUS_LABELS = {
  stable: 'Available',
  experimental: 'Experimental',
  deprecated: 'Deprecated',
  changing: 'Changing',
  planned: 'Planned',
}

/** The unit field each release marker names its unit in. */
const UNIT_FIELD = { planned: 'plannedBy', changing: 'changedBy' }

/** Every hand-written docs page, with the frontmatter the map reads, in the sidebar's order. */
export function mapPages() {
  const content = join(root, 'website/content')
  return docsFiles(content, DOCS_SOURCES)
    .filter(({ file }) => !file.startsWith(`${REFERENCE_DIR}/`))
    .sort((a, b) => journeyOrder(a.stem, b.stem))
    .map(({ file, route }) => ({ file: `website/content/${file}`, route, meta: frontmatter(readFileSync(join(content, file), 'utf8')) }))
}

/** A page's status cell: the legend's word, and the unit a marker names. */
export function statusCell(meta) {
  const status = meta.status || 'stable'
  const label = STATUS_LABELS[status]
  if (!label) throw new Error(`feature-map: status "${status}" has no word on the map's legend`)
  const unit = meta[UNIT_FIELD[status]]
  return unit ? `${label} (${unit})` : label
}

/**
 * A description as a table cell renders it: frontmatter is plain text, but
 * the map is Markdown, where a bare `<AuthForm>` or `/d/<id>` would parse
 * as a tag. Each word holding an angle bracket becomes a code span.
 */
export function cellText(description) {
  return description.split(/(\s+)/).map((word) => {
    if (!word.includes('<') || !word.includes('>') || word.includes('`')) return word
    const [, body, tail] = word.match(/^(.*?)([,.;:)]?)$/)
    return `\`${body}\`${tail}`
  }).join('')
}

/** The map's sections: each capability's heading, its sentence and a row per page that names it. */
export function featureMap() {
  const pages = mapPages().filter(page => page.meta.capability)
  const known = new Set(DOCS_CAPABILITIES.map(capability => capability.id))
  const unknown = pages.filter(page => !known.has(page.meta.capability))
  if (unknown.length > 0) {
    throw new Error(`feature-map: ${unknown.map(page => `${page.file} names capability "${page.meta.capability}"`).join(', ')}: use one of ${[...known].join(', ')} (website/shared/docs-capabilities.ts)`)
  }
  return blocks(DOCS_CAPABILITIES.map((capability) => {
    const rows = pages.filter(page => page.meta.capability === capability.id)
    return blocks(
      `## ${capability.title}`,
      capability.intro,
      rows.length > 0
        ? table(['Feature', 'What it gives you', 'Status'], rows.map(page => [link(page.meta.title, page.route), cellText(page.meta.description), statusCell(page.meta)]))
        : 'No page names this section yet.',
    )
  }))
}
