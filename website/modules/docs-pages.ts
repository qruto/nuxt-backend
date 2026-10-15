import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { defineNuxtModule, useLogger } from '@nuxt/kit'
import { appendPageKeys, expandForAgents } from '../shared/agent-markdown'
import { EXPERIMENTAL_BADGE } from '../utils/nav-badges'

// What the build adds to every docs page as it parses it (Nuxt Content's
// `content:file:afterParse`). Parsed pages are cached by content, not by
// hook: after changing this, `rm -rf .data/content` before checking locally.
//
// - The agent text (shared/agent-markdown.ts): the blocks a component draws
//   get the text they stand for, and the header's keys close the page.
// - The navigation's Experimental badge, from `status: experimental`, so
//   the page contract's one field drives both the chip and the badge (the
//   chrome hoists it to where the surface starts, utils/nav-badges.ts).
// - The last-updated date: the committer date of the last commit that
//   touched the file. It fills `modifiedAt`, which the aside shows, the
//   TechArticle JSON-LD carries as `dateModified` and the sitemap as
//   `lastmod`.
//
// A shallow clone (CI's checkout, a Vercel build without VERCEL_DEEP_CLONE)
// ends its history at a boundary commit that looks as if it added every
// file. A page whose newest commit is that boundary gets no date, never a
// wrong one; without git at all, no page gets one.

/** Every file under `dir` with the date of its last commit, by absolute path. */
export function lastCommitDates(dir: string): Map<string, string> {
  const dates = new Map<string, string>()
  let log: string
  let gitDir: string
  // The repository that holds `dir`, whatever GIT_DIR a hook has exported.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')))
  try {
    log = execFileSync('git', ['log', '--format=@%H %cI', '--name-only', '--relative', '--', '.'], { cwd: dir, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: dir, env, encoding: 'utf8' }).trim()
  }
  catch {
    return dates
  }
  const shallow = join(gitDir, 'shallow')
  const boundaries = new Set(existsSync(shallow) ? readFileSync(shallow, 'utf8').split('\n').filter(Boolean) : [])
  let date: string | undefined
  for (const line of log.split('\n')) {
    if (line.startsWith('@')) {
      const [hash, committed] = line.slice(1).split(' ')
      date = boundaries.has(hash!) ? undefined : committed
      continue
    }
    const file = resolve(dir, line)
    // Newest first: a file's first entry is its last change.
    if (line && !dates.has(file)) dates.set(file, date ?? '')
  }
  for (const [file, value] of dates) if (!value) dates.delete(file)
  return dates
}

/** Badge a page's navigation entry when it documents the experimental tier. */
export function badgeExperimental(page: Record<string, unknown>): void {
  if (page.status !== 'experimental' || page.navigation === false) return
  const navigation = typeof page.navigation === 'object' && page.navigation ? page.navigation : {}
  page.navigation = { ...navigation, badge: EXPERIMENTAL_BADGE }
}

export default defineNuxtModule({
  meta: { name: 'docs-pages' },
  setup(_options, nuxt) {
    const dates = lastCommitDates(join(nuxt.options.rootDir, 'content'))
    if (dates.size === 0) useLogger('docs-pages').info('No git history under content/: the docs show no last-updated dates.')
    nuxt.hook('content:file:afterParse', ({ file, content: page }) => {
      expandForAgents(page.body)
      appendPageKeys(page.body, page)
      badgeExperimental(page)
      const date = dates.get(resolve(file.path))
      if (date) page.modifiedAt = date
    })
  },
})
