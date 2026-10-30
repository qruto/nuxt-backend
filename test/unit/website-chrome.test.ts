import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pageScripts, staticImports } from '../../scripts/check-website-bundle.mjs'
import { CLIENT_PLUGIN } from '../../website/modules/deferred-backend-client'
import { needsBackendClient } from '../../website/modules/deferred-backend-client/runtime/routes'
import { badgeStatus, lastCommitDates } from '../../website/modules/docs-pages'
import { EXPERIMENTAL_BADGE, hoistBadges } from '../../website/utils/nav-badges'
import { pageTrail } from '../../website/utils/page-trail'

/** A navigation entry, as the site's helpers take it. */
type ContentNavigationItem = Parameters<typeof pageTrail>[0] extends (infer Item)[] | undefined ? Item : never

// The docs chrome's build-time and routing logic: when the backend client
// loads, where an Experimental badge sits, a page's trail and its
// last-updated date from git.

describe('the deferred backend client', () => {
  const pages = ['/login', '/oauth/consent', '/playground/pricing']

  it.each(['/playground', '/playground/strips', '/login', '/oauth/consent'])('loads before %s renders', (path) => {
    expect(needsBackendClient(path, pages)).toBe(true)
  })

  it.each(['/', '/docs/start', '/docs/build/data/read-write', '/playgrounds', '/login/extra'])('waits on %s', (path) => {
    expect(needsBackendClient(path, pages)).toBe(false)
  })

  it('finds nuxt-convex-module\'s client plugin where the installed package keeps it', () => {
    const root = dirname(createRequire(import.meta.url).resolve('nuxt-convex-module/package.json'))
    const plugin = join(root, 'dist/runtime/better-auth/vue/plugin.client.js')
    expect(existsSync(plugin)).toBe(true)
    expect(CLIENT_PLUGIN.test(plugin.replaceAll('\\', '/'))).toBe(true)
    expect(CLIENT_PLUGIN.test(plugin.replaceAll('\\', '/').replace(/\.js$/, ''))).toBe(true)
  })
})

describe('the bundle check', () => {
  it('follows static imports and leaves dynamic ones to load later', () => {
    expect(staticImports('import{a as b}from"./A.js";import"./B.js";export{c}from"./C.js";const d=()=>import("./D.js")')).toEqual(['A.js', 'B.js', 'C.js'])
  })

  it('starts from the module entry and the modulepreloads of a page, never a prefetch', () => {
    const html = '<link rel="modulepreload" as="script" crossorigin href="/_nuxt/P.js"><link rel="prefetch" href="/_nuxt/Q.js"><script type="module" src="/_nuxt/E.js" crossorigin></script><script src="/other.js"></script>'
    expect(pageScripts(html)).toEqual(['P.js', 'E.js'])
  })
})

describe('Experimental badges', () => {
  const page = (path: string, experimental = false): ContentNavigationItem => ({ title: path, path, ...(experimental ? { badge: EXPERIMENTAL_BADGE } : {}) })

  it('go on a page that documents the experimental tier, beside its icon', () => {
    const entry: Record<string, unknown> = { status: 'experimental', navigation: { icon: 'i-lucide-brain' } }
    badgeStatus(entry)
    expect(entry.navigation).toEqual({ icon: 'i-lucide-brain', badge: EXPERIMENTAL_BADGE })
  })

  it('skip stable pages and pages out of the navigation', () => {
    const stable: Record<string, unknown> = { navigation: { icon: 'x' } }
    const hidden: Record<string, unknown> = { status: 'experimental', navigation: false }
    badgeStatus(stable)
    badgeStatus(hidden)
    expect(stable.navigation).toEqual({ icon: 'x' })
    expect(hidden.navigation).toBe(false)
  })

  it('sit where the surface starts: a whole tab, a whole group, or one page', () => {
    const [ai, agents, email] = hoistBadges([
      { title: 'AI', path: '/docs/build/ai', children: [page('/docs/build/ai', true), page('/docs/build/ai/streaming', true)] },
      { title: 'Agents', path: '/docs/develop/agents', children: [page('/docs/develop/agents'), { title: 'MCP', path: '/docs/develop/agents/mcp', children: [page('/docs/develop/agents/mcp', true), page('/docs/agents/mcp/tools', true)] }] },
      { title: 'Email', path: '/docs/build/email', children: [page('/docs/build/email'), page('/docs/develop/dev-inbox', true)] },
    ])
    expect(ai!.badge).toEqual(EXPERIMENTAL_BADGE)
    expect(ai!.children!.some(child => child.badge)).toBe(false)
    expect(agents!.badge).toBeUndefined()
    expect(agents!.children![1]!.badge).toEqual(EXPERIMENTAL_BADGE)
    expect(agents!.children![1]!.children!.some(child => child.badge)).toBe(false)
    expect(email!.badge).toBeUndefined()
    expect(email!.children![1]!.badge).toEqual(EXPERIMENTAL_BADGE)
  })
})

describe('a page\'s trail', () => {
  const navigation: ContentNavigationItem[] = [
    { title: 'Billing', path: '/docs/build/billing', children: [
      { title: 'Overview', path: '/docs/build/billing' },
      { title: 'Growth', path: '/docs/build/growth#offers', page: false, children: [{ title: 'Gifts', path: '/docs/build/growth/offers/gifts' }] },
    ] },
  ]

  it('runs from the tab to the page, and knows which steps are pages', () => {
    expect(pageTrail(navigation, '/docs/build/growth/offers/gifts')).toEqual([
      { title: 'Billing', path: '/docs/build/billing', page: true },
      { title: 'Growth', path: '/docs/build/growth#offers', page: false },
      { title: 'Gifts', path: '/docs/build/growth/offers/gifts', page: true },
    ])
  })

  it('is empty for a page out of the navigation', () => {
    expect(pageTrail(navigation, '/docs/nowhere')).toEqual([])
  })
})

describe('last-updated dates', () => {
  let repo: string
  // A git hook (pre-push runs the tests) exports GIT_DIR and GIT_INDEX_FILE
  // for the repository being pushed: left in, every command below would
  // write to it instead of the throwaway one.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')))
  const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], { cwd, env, encoding: 'utf8' })
  const commit = (file: string, date: string) => {
    writeFileSync(join(repo, 'content', file), `${file} ${date}\n`)
    git(repo, 'add', '.')
    execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', file], { cwd: repo, env: { ...env, GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date } })
  }

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'docs-dates-'))
    mkdirSync(join(repo, 'content'))
    git(repo, 'init', '-q')
    commit('a.md', '2026-01-02T03:04:05+00:00')
    commit('b.md', '2026-02-03T04:05:06+00:00')
    commit('a.md', '2026-03-04T05:06:07+00:00')
  })

  afterAll(() => rmSync(repo, { recursive: true, force: true }))

  it('are each file\'s last commit', () => {
    const dates = lastCommitDates(join(repo, 'content'))
    expect(dates.get(join(repo, 'content/a.md'))).toBe('2026-03-04T05:06:07Z')
    expect(dates.get(join(repo, 'content/b.md'))).toBe('2026-02-03T04:05:06Z')
  })

  it('are left out where a shallow clone\'s boundary hides the real one', () => {
    const shallow = mkdtempSync(join(tmpdir(), 'docs-dates-shallow-'))
    try {
      git(shallow, 'clone', '-q', '--depth', '2', `file://${repo}`, 'clone')
      const dates = lastCommitDates(join(shallow, 'clone/content'))
      expect(dates.get(join(shallow, 'clone/content/a.md'))).toBe('2026-03-04T05:06:07Z')
      expect(dates.has(join(shallow, 'clone/content/b.md'))).toBe(false)
    }
    finally {
      rmSync(shallow, { recursive: true, force: true })
    }
  })

  it('are none outside a repository', () => {
    const plain = mkdtempSync(join(tmpdir(), 'docs-dates-plain-'))
    try {
      expect(lastCommitDates(plain).size).toBe(0)
    }
    finally {
      rmSync(plain, { recursive: true, force: true })
    }
  })
})
