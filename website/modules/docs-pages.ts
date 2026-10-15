import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { defineNuxtModule, useLogger } from '@nuxt/kit'
import { expandForAgents } from '../shared/agent-markdown'
import { EXPERIMENTAL_BADGE } from '../utils/nav-badges'

// What the build adds to every docs page as it parses it (Nuxt Content's
// `content:file:afterParse`). Parsed pages are cached by content, not by
// hook: after changing this, `rm -rf .data/content` before checking locally.
//
// - The agent text (shared/agent-markdown.ts): the blocks a component draws
//   get the text they stand for. The header's keys go into the Markdown
//   agents read, not into the stored page, which search indexes
//   (server/plugins/agent-page-keys.ts).
// - The navigation's Experimental badge, from `status: experimental`, so
//   the page contract's one field drives both the chip and the badge (the
//   chrome hoists it to where the surface starts, utils/nav-badges.ts).
// - The last-updated date: the committer date of the last commit that
//   touched the file. It fills `modifiedAt`, which the aside shows and the
//   TechArticle JSON-LD carries as `dateModified`, and `meta.modifiedAt`,
//   which Docus's sitemap source reads for `lastmod`.
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

/** Badge a page's navigation entry when it documents the experimental tier. */
export function badgeExperimental(page: Record<string, unknown>): void {
  if (page.status !== 'experimental' || page.navigation === false) return
  const navigation = typeof page.navigation === 'object' && page.navigation ? page.navigation : {}
  page.navigation = { ...navigation, badge: EXPERIMENTAL_BADGE }
}

/** What the build adds to a parsed page, in place (see the top of this file). */
export function enrichPage(page: Record<string, unknown> & { body?: unknown }, date: string | undefined): void {
  expandForAgents(page.body)
  badgeExperimental(page)
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
