import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { defineNuxtModule, useLogger } from '@nuxt/kit'
import { docsFiles } from '../../scripts/lib/docs-pages.mjs'
import { frontmatter } from '../../scripts/lib/frontmatter.mjs'
import { expandForAgents } from '../shared/agent-markdown'
import type { AgentPage } from '../shared/agent-surfaces'
import { DOCS_SOURCES } from '../shared/docs-routes'
import { changingNote, FEATURE_MAP, isChanging, isPlanned, PLANNED_NOTE } from '../shared/planned'
import { statusBadge } from '../utils/nav-badges'
import { wrapPmBlocks } from '../shared/pm-blocks'

// What the build adds to every docs page as it parses it (Nuxt Content's
// `content:file:afterParse`). Parsed pages are cached by content, not by
// hook: after changing this, `rm -rf .data/content` before checking locally.
//
// - The agent text (shared/agent-markdown.ts): the blocks a component draws
//   get the text they stand for. The page's header (version, tab, kind,
//   status and keys) opens the Markdown agents read, not the stored page,
//   which search indexes (`openTwin`, server/plugins/agent-surfaces.ts).
// - The navigation's badge, from `status: experimental`, `planned` or
//   `changing`, so the page contract's one field drives both the chip and
//   the badge (the chrome hoists it to where the surface starts,
//   utils/nav-badges.ts).
// - A planned or changing page's callout, first in its body
//   (shared/planned.ts): the page shows it, the site's search indexes it and
//   the twin prints it, so a reader who lands from any of them knows the
//   feature is not built yet, or that the code still has the previous API.
// - The last-updated date: the committer date of the last commit that
//   touched the file. It fills `modifiedAt`, which the aside shows and the
//   TechArticle JSON-LD carries as `dateModified`, and `meta.modifiedAt`,
//   which Docus's sitemap source reads for `lastmod`.
// - The package-manager variants of each bash block whose commands all
//   convert (shared/pm-blocks.ts): the page's text stays npm, the variants
//   ride in a prop of the block that wraps it.
//
// A shallow clone (CI's checkout; Vercel's, until website/vercel-build.sh
// fetches the rest) ends its history at a boundary commit that looks as if
// it added every file. A page whose newest commit is that boundary gets no
// date, never a wrong one; without git at all, no page gets one. The build
// logs how many pages went without.

/** Every file under `dir` with the date of its last commit, by absolute path. */
export function lastCommitDates(dir: string): Map<string, string> {
  const dates = new Map<string, string>()
  let log: string
  let shallow: string
  // The repository that holds `dir`, whatever GIT_DIR a hook has exported.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')))
  try {
    // NUL-separated and unquoted, so any file name reads back as written. A
    // header starts with a NUL of its own, so it follows an empty field,
    // which no file name can be.
    log = execFileSync('git', ['-c', 'core.quotePath=false', 'log', '-z', '--format=%x00%H %cI', '--name-only', '--relative', '--', '.'], { cwd: dir, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    // Where the clone records its boundary: the common git dir, which a
    // linked worktree shares, not the worktree's own.
    shallow = resolve(dir, execFileSync('git', ['rev-parse', '--git-path', 'shallow'], { cwd: dir, env, encoding: 'utf8' }).trim())
  }
  catch {
    return dates
  }
  const boundaries = new Set(existsSync(shallow) ? readFileSync(shallow, 'utf8').split('\n').filter(Boolean) : [])
  const fields = log.split('\0')
  let date: string | undefined
  let first = false
  for (let i = 0; i < fields.length; i++) {
    if (fields[i] === '') {
      const header = fields[++i]
      if (!header) continue
      const [hash, committed] = header.split(' ')
      date = boundaries.has(hash!) ? undefined : committed
      first = true
      continue
    }
    // The first name after a header comes after the newline that ends it.
    const name = first ? fields[i]!.replace(/^\n/, '') : fields[i]!
    first = false
    const file = resolve(dir, name)
    // Newest first: a file's first entry is its last change.
    if (name && !dates.has(file)) dates.set(file, date ?? '')
  }
  for (const [file, value] of dates) if (!value) dates.delete(file)
  return dates
}

/** Date a parsed page: the column the page reads, and the meta Docus's sitemap reads. */
export function stampModifiedAt(page: Record<string, unknown>, date: string): void {
  page.modifiedAt = date
  page.meta = { ...(page.meta as Record<string, unknown> | undefined), modifiedAt: date }
}

/** Badge a page's navigation entry when it documents the experimental tier, or what is planned. */
export function badgeStatus(page: Record<string, unknown>): void {
  const badge = statusBadge(page.status)
  if (!badge || page.navigation === false) return
  const navigation = typeof page.navigation === 'object' && page.navigation ? page.navigation : {}
  page.navigation = { ...navigation, badge }
}

/** The callout a planned page opens with, as a parsed node. */
export const PLANNED_CALLOUT = ['callout', { icon: 'i-lucide-hammer', color: 'neutral' }, ['p', {}, ['strong', {}, 'Planned.'], ` ${PLANNED_NOTE} The `, ['a', { href: FEATURE_MAP }, 'Feature map'], ' shows what is built.']] as const

/** The callout a changing page opens with, as a parsed node, naming the unit that brings the code to it. */
export const changingCallout = (unit: string) => ['callout', { icon: 'i-lucide-git-compare-arrows', color: 'warning' }, ['p', {}, ['strong', {}, 'Changing.'], ` ${changingNote(unit)} The `, ['a', { href: FEATURE_MAP }, 'Feature map'], ' shows what each unit changes.']] as const

/** The callout a page's release marker opens it with, if it has one. */
export function markerCallout(page: { status?: unknown, changedBy?: unknown }): readonly unknown[] | undefined {
  if (isPlanned(page)) return PLANNED_CALLOUT
  if (isChanging(page)) return changingCallout(typeof page.changedBy === 'string' ? page.changedBy : 'its unit')
  return undefined
}

/** Open a planned or changing page's body with its callout, in place. Safe to run twice. */
export function noteMarker(page: Record<string, unknown> & { body?: unknown }): void {
  const callout = markerCallout({ status: page.status, changedBy: page.changedBy })
  if (!callout) return
  const body = page.body as { type?: unknown, value?: unknown } | undefined
  if (body?.type !== 'minimark' || !Array.isArray(body.value)) return
  if (JSON.stringify(body.value[0]) === JSON.stringify(callout)) return
  body.value.unshift(structuredClone(callout))
}

/**
 * Every page of the `docs` collection, read from the files under `content`
 * as the collection sources in shared/docs-routes.ts serve them: its route,
 * its stem (the sidebar's order) and the frontmatter the agent surfaces
 * print. nuxt.config.ts builds the llms.txt sections from it, before Nuxt
 * Content has parsed anything.
 */
export function readDocsPages(content: string): AgentPage[] {
  return docsFiles(content, DOCS_SOURCES).map(({ file, stem, route }): AgentPage => {
    const { title, description, kind, status, changedBy } = frontmatter(readFileSync(join(content, file), 'utf8'))
    return {
      route,
      stem,
      title: title || route.split('/').at(-1)!,
      ...(description ? { description } : {}),
      ...(kind ? { kind } : {}),
      ...(status ? { status } : {}),
      ...(changedBy ? { changedBy } : {}),
    }
  })
}

/** Wrap the bash blocks of a parsed page body that convert to every package manager, in place. */
export function wrapCommands(body: unknown): void {
  const { type, value } = (body ?? {}) as { type?: unknown, value?: unknown }
  if (type === 'minimark' && Array.isArray(value)) wrapPmBlocks(value)
}

/** What the build adds to a parsed page, in place (see the top of this file). */
export function enrichPage(page: Record<string, unknown> & { body?: unknown }, date: string | undefined): void {
  expandForAgents(page.body)
  wrapCommands(page.body)
  noteMarker(page)
  badgeStatus(page)
  if (date) stampModifiedAt(page, date)
}

export default defineNuxtModule({
  meta: { name: 'docs-pages' },
  setup(_options, nuxt) {
    const content = join(nuxt.options.rootDir, 'content')
    const dates = lastCommitDates(content)
    const pages = readdirSync(content, { recursive: true, encoding: 'utf8' }).filter(file => file.endsWith('.md'))
    const undated = pages.filter(file => !dates.has(resolve(content, file))).length
    if (undated > 0) {
      useLogger('docs-pages').info(`${undated} of ${pages.length} pages under content/ show no last-updated date: no git history here reaches their last change (a shallow clone, or not committed yet).`)
    }
    nuxt.hook('content:file:afterParse', ({ file, content: page }) => enrichPage(page, dates.get(resolve(file.path))))
  },
})
