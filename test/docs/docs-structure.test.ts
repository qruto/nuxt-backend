import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import {
  DOCS_ALIASES,
  DOCS_FRAGMENT_MOVES,
  DOCS_REDIRECTS,
  DOCS_SHORT_LINKS,
  DOCS_TABS,
  docsRedirectRules,
} from '../../website/shared/docs-routes'
import { contentRoute, read, walk } from './helpers'
import snapshot from './routes-0.1.json'

// The docs' structure against its route table (website/shared/docs-routes.ts):
// pages that parse and describe themselves, a redirect for every route the
// site ever published, and targets that exist — with no redirect leading to
// another, so a reader lands in one hop.

const pages = new Map(walk('website/content', ['.md']).map(file => [contentRoute(file), file.slice(file.indexOf('website/content/'))]))

/** A page's frontmatter, parsed as YAML: a stray `#` or `:` shows up here, not in production. */
function frontmatterOf(file: string): Record<string, unknown> {
  const block = read(file).match(/^---\n([\s\S]*?)\n---\n/)?.[1]
  return block === undefined ? {} : parse(block) as Record<string, unknown>
}

/**
 * The anchors a page's headings get: lower-cased text, markup and punctuation
 * dropped, spaces as `-`, and a `_` before an id that would start with a digit.
 */
function anchorsOf(file: string): Set<string> {
  const headings = [...read(file).matchAll(/^#{1,6} (.+)$/gm)].map(([, text]) => text!)
  return new Set(headings.map(text => text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/^(\d)/, '_$1')))
}

/** Whether `target` (a route with an optional `#anchor`) is a page, and the anchor one of its headings. */
function resolves(target: string): boolean {
  const [route, anchor] = target.split('#') as [string, string | undefined]
  const file = pages.get(route)
  return Boolean(file) && (!anchor || anchorsOf(file!).has(anchor))
}

const redirectSources = new Set([
  ...DOCS_REDIRECTS.map(redirect => redirect.from),
  ...Object.keys(DOCS_ALIASES),
])

describe('pages', () => {
  it.each([...pages])('%s has a title and a description of at least 40 characters', (route, file) => {
    const meta = frontmatterOf(file)
    // The landing page speaks through `seo`, which Docus reads first.
    const { title, description } = route === '/' ? meta.seo as Record<string, unknown> : meta
    expect(typeof title === 'string' && title.length > 0, `${file}: title`).toBe(true)
    expect(typeof description === 'string' && description.length >= 40, `${file}: description ${JSON.stringify(description)}`).toBe(true)
  })
})

describe('the route table', () => {
  it('answers every route the site served in 0.1, as a page or a redirect', () => {
    const served = [...snapshot.handWritten, ...snapshot.generated, ...snapshot.legacy, ...snapshot.sectionRoots]
    expect(served.length).toBeGreaterThan(120)
    expect(served.filter(route => !pages.has(route) && !redirectSources.has(route))).toEqual([])
  })

  it('points every redirect, alias and short link at a page and a heading that exist', () => {
    const targets = [
      ...DOCS_REDIRECTS.map(({ from, to }) => [from, to]),
      ...Object.entries(DOCS_ALIASES),
      ...DOCS_SHORT_LINKS.map(({ from, to }) => [from, to]),
    ]
    expect(targets.filter(([, to]) => !resolves(to!)).map(([from, to]) => `${from} → ${to}`)).toEqual([])
  })

  it('lands in one hop: no target is redirected again, no redirect shadows a page', () => {
    const targets = [...DOCS_REDIRECTS.map(({ to }) => to), ...Object.values(DOCS_ALIASES)]
    expect(targets.filter(to => redirectSources.has(to.split('#')[0]!))).toEqual([])
    expect([...redirectSources].filter(from => pages.has(from))).toEqual([])
  })

  it('sends each moved anchor to a heading that exists, from one that no longer does', () => {
    const entries = Object.entries(DOCS_FRAGMENT_MOVES)
    // The plugin redirects only anchors a page has lost: a live heading must win.
    expect(entries.filter(([from]) => resolves(from)).map(([from]) => from)).toEqual([])
    expect(entries.filter(([from]) => !pages.has(from.split('#')[0]!)).map(([from]) => from)).toEqual([])
    expect(entries.filter(([, to]) => !resolves(to)).map(([from, to]) => `${from} → ${to}`)).toEqual([])
  })

  it('redirects both Markdown twins of every route it redirects', () => {
    const rules = docsRedirectRules()
    for (const from of redirectSources) {
      expect(rules[from], from).toBeDefined()
      expect(rules[`${from}.md`], `${from}.md`).toBeDefined()
      expect(rules[`/raw${from}.md`], `/raw${from}.md`).toBeDefined()
    }
  })

  it('keeps temporary redirects temporary, and the pending list only shrinks', () => {
    const rules = docsRedirectRules()
    const pending = [...DOCS_REDIRECTS.filter(redirect => redirect.pending), ...DOCS_SHORT_LINKS.filter(link => link.pending)]
    // Short links stay temporary whether or not their home has landed: the page they name can move.
    for (const { from } of [...pending, ...DOCS_SHORT_LINKS]) expect(rules[from]?.redirect.statusCode, from).toBe(302)
    // A ratchet: lower it as each pending home lands — the group landings,
    // split pages (D3c), the Diagnostics page (D6); the 0.2.0 docs pass (D11)
    // brings it to zero.
    expect(pending.length).toBeLessThanOrEqual(10)
  })
})

describe('links', () => {
  it('answers every folder route under /docs, as a page or a redirect', () => {
    const folders = new Set<string>()
    for (const route of pages.keys()) {
      const parts = route.split('/')
      for (let i = 2; i < parts.length; i++) folders.add(parts.slice(0, i).join('/'))
    }
    expect([...folders].filter(folder => !pages.has(folder) && !redirectSources.has(folder))).toEqual([])
  })

  it('lands every docs link and card in the content on a page, never on a redirect', () => {
    const broken: string[] = []
    for (const [route, file] of pages) {
      if (file.includes('/10.reference/10.api/')) continue
      // Markdown links, and the `to="…"` of MDC components (cards, playground links).
      for (const [, target] of read(file).matchAll(/\]\((\/[^)\s]*)\)|\bto="(\/[^"]*)"/g).map(([, md, to]) => [undefined, md ?? to])) {
        const path = target!.split('#')[0]!
        // A route the table redirects is a stale link, wherever it points.
        if (redirectSources.has(path)) broken.push(`${route} → ${target} (redirected)`)
        // Docs pages only below: the app's own pages (/login, /playground) and files are not in this collection.
        else if (pages.has(path) && !resolves(target!)) broken.push(`${route} → ${target} (no such heading)`)
        else if (path.startsWith('/docs') && !pages.has(path) && !/\.\w+$/.test(path)) broken.push(`${route} → ${target}`)
      }
    }
    expect(broken).toEqual([])
  })
})

describe('links from the apps', () => {
  it('points the templates and examples at docs pages, never at a redirect', () => {
    const files = ['templates', 'examples'].flatMap(dir => walk(dir, ['.md', '.vue', '.ts'], path =>
      /\/(?:node_modules|_generated|\.nuxt|\.output)(?:\/|$)/.test(path)))
    expect(files.length).toBeGreaterThan(20)
    const broken: string[] = []
    for (const file of files) {
      for (const [, target] of read(file).matchAll(/https:\/\/nuxt-backend\.dev(\/[\w/#-]*)/g)) {
        const path = target!.split('#')[0]!.replace(/\/$/, '')
        if (!path || (!path.startsWith('/docs') && !redirectSources.has(path))) continue
        if (redirectSources.has(path) || !resolves(target!.replace(/\/(?=#|$)/, ''))) broken.push(`${file.slice(file.indexOf('/', file.indexOf('nuxt-backend')) + 1)} → ${target}`)
      }
    }
    expect(broken).toEqual([])
  })
})

describe('repository config', () => {
  it('names no folder of the 0.1 content tree', () => {
    // Config that globs or links content by path (review instructions, CI
    // filters, spelling exclusions, contributor docs) follows the tree.
    const files = ['.coderabbit.yaml', 'package.json', 'typedoc.json', '_typos.toml', 'lychee.toml', 'CONTRIBUTING.md', 'AGENTS.md', 'RELEASE.md', 'README.md', 'STABILITY.md', 'SECURITY.md', 'vitest.config.ts', '.fallowrc.jsonc', ...walk('.github', ['.yml', '.yaml', '.md'])]
    const stale = files.filter(file => /website\/content\/[1-7]\.|9\.reference/.test(read(file)))
    expect(stale).toEqual([])
  })
})

describe('the tabs', () => {
  it('place every page in exactly one tab, and nothing else under a tab\'s prefix', () => {
    const owners = (route: string) => DOCS_TABS.filter(tab => route === tab.path || route.startsWith(`${tab.path}/`))
    const strays = [...pages.keys()].filter(route => route !== '/' && owners(route).length !== 1)
    expect(strays).toEqual([])
    // llms.txt filters a tab with `LIKE '/tab%'`: a route that starts with a
    // tab's path without being under it would land in the wrong section.
    const ambiguous = [...pages.keys()].filter(route => DOCS_TABS.some(tab =>
      route.startsWith(tab.path) && route !== tab.path && !route.startsWith(`${tab.path}/`)))
    expect(ambiguous).toEqual([])
  })
})
