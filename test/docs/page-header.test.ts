import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { BACKEND_PAGE_DEFS } from '../../src/pages'
import { ROOT_PAGES } from '../../website/shared/module-pages'
import { expected } from '../../scripts/sync-panels.mjs'
import { playgroundRoutes } from '../helpers/playground-routes'
import { REPOSITORY } from '../../website/shared/page-keys'
import { BACKEND_CALL, namedComponents, needsBackend, pascalCase, siteComponents } from './components'
import { at, contentFile, contentRoute, GENERATED_REFERENCE, read, walk } from './helpers'

// What a docs page's header and aside promise, from its frontmatter: the
// Try live, API and Source keys lead somewhere real, the live demos sit
// only on pages that load the backend client for them, and only inside
// <DeferredBackend>, and the last-updated date comes from git, never from a
// hand.

const DOCS = 'website/content/docs'
const pages = walk(DOCS, ['.md']).map(file => file.slice(file.indexOf(DOCS)))
const handWritten = pages.filter(file => !`${file}/`.includes(GENERATED_REFERENCE))

/** A page's frontmatter, read as YAML: any list style, nested keys, real booleans. */
function fields(file: string): Record<string, unknown> {
  const block = read(file).match(/^---\n([\s\S]*?)\n---\n/)?.[1]
  return (block ? parse(block) as Record<string, unknown> | null : null) ?? {}
}
const withField = (name: string) => handWritten.flatMap((file) => {
  const value = fields(file)[name]
  return typeof value === 'string' && value ? [[contentRoute(file), value] as const] : []
})

/**
 * Where the site serves the playground: Panels' pages and the module's, under
 * /playground (website/shared/panels.ts, website/shared/module-pages.ts), and
 * the module pages left at their default path (/login).
 */
const MOUNTED = new Set([
  ...playgroundRoutes(),
  ...BACKEND_PAGE_DEFS.filter(def => ROOT_PAGES.has(def.key)).map(def => def.defaultPath),
])

/** The page files Panels' sync writes, which serve under /playground, not where they sit. */
const SYNCED = new Set([...expected().keys()].map(file => `website/${file}`))

/** A site route the site serves: a page file of the site's own, or a playground route. */
function servedBySite(route: string): boolean {
  const file = `website/pages${route}`
  if ([`${file}.vue`, `${file}/index.vue`].some(page => existsSync(at(page)) && !SYNCED.has(page))) return true
  return MOUNTED.has(route)
}

describe('the routes the site serves', () => {
  it('are Panels\' and the module\'s pages where the site mounts them, and no copy of a root page in the playground', () => {
    expect(servedBySite('/playground')).toBe(true)
    expect(servedBySite('/playground/strips')).toBe(true)
    expect(servedBySite('/playground/pricing')).toBe(true)
    expect(servedBySite('/login')).toBe(true)
    for (const route of ['/playground/login', '/strips', '/pricing', '/playground/platform/billing']) {
      expect(servedBySite(route), route).toBe(false)
    }
  })
})

describe('the header keys', () => {
  it.each(withField('playground'))('%s: Try live opens a playground page (%s)', (_route, target) => {
    expect(servedBySite(target), `no page at ${target}`).toBe(true)
  })

  it.each(withField('api'))('%s: API opens a generated reference page (%s)', (_route, target) => {
    expect(contentFile(target)).toContain(GENERATED_REFERENCE)
  })

  it.each(withField('source'))('%s: Source opens a path in the repository (%s)', (_route, target) => {
    expect(existsSync(at(target)), target).toBe(true)
  })

  it('lead into the repository the site names everywhere else', () => {
    const config = read('website/app.config.ts')
    expect(config).toContain(`url: '${REPOSITORY.url}'`)
    expect(config).toContain(`branch: '${REPOSITORY.branch}'`)
  })

  it('replaced every ::playground-link block', () => {
    for (const file of pages) expect(read(file), file).not.toContain('::playground-link')
    expect(existsSync(at('website/components/PlaygroundLink.vue'))).toBe(false)
  })
})

describe('the aside', () => {
  it.each(handWritten.map(file => [contentRoute(file), file] as const))('%s lists only related pages that exist', (_route, file) => {
    const related = fields(file).related
    if (related === undefined) return
    expect(Array.isArray(related) && related.every(route => typeof route === 'string'), '`related` is a list of routes').toBe(true)
    for (const route of related as string[]) expect(() => contentFile(route), route).not.toThrow()
  })

  it('takes every last-updated date from git: no page writes its own', () => {
    for (const file of pages) expect(fields(file).modifiedAt, file).toBeUndefined()
  })

  // Docus draws the block (related pages, "Was this helpful?", the date)
  // under the table of contents, which a page without headings has none of.
  it('shows its block on a page without headings too, beside the page and in the phone drawer', () => {
    expect(handWritten.filter(file => !/^#{2,3} /m.test(read(file))).length).toBeGreaterThan(0)
    for (const file of ['DocsAsideRight', 'DocsAsideMobileBar']) {
      expect(read(`website/components/docs/${file}.vue`), file).toMatch(/<UContentToc\s+v-if="links\??\.length"[\s\S]*<\/UContentToc>\s*<div\s+v-else[^>]*>\s*<DocsAsideRightBottom standalone \/>/)
    }
  })

  // On a phone the drawer holds a second copy beside the hidden one.
  it('asks "Was this helpful?" under a label of its own, with keys that stay where focus is', () => {
    const feedback = read('website/components/docs/DocsPageFeedback.vue')
    expect(feedback).toMatch(/const labelId = useId\(\)/)
    expect(feedback).toMatch(/:aria-labelledby="labelId"/)
    expect(feedback).not.toMatch(/id="page-feedback"|v-if="!answer"/)
    expect(feedback.match(/:pressed="answer === '(?:yes|no)'"/g)).toHaveLength(2)
    expect(feedback).toMatch(/role="status"/)
  })
})

describe('live demos', () => {
  // `::demo-x`, and `:::demo-x` nested in another block.
  const DEMO_BLOCK = /^\s*:{2,}(demo-[\w-]+)/gm
  const blocks = (file: string) => [...read(file).matchAll(DEMO_BLOCK)].map(match => match[1]!)
  const components = siteComponents()
  const demos = [...new Set(handWritten.flatMap(blocks))].map(block => pascalCase(block))

  it('sit exactly on the pages marked `demo: true`, where the backend client may load', () => {
    const marked = handWritten.filter(file => fields(file).demo === true).map(contentRoute).sort()
    const used = handWritten.filter(file => blocks(file).length > 0).map(contentRoute).sort()
    expect(used.length).toBeGreaterThan(0)
    expect(marked).toEqual(used)
  })

  /**
   * A block's own markup and what it hands each named slot: `<template
   * #name>` blocks, nested templates counted, so a `v-if` template inside
   * one does not end it early.
   */
  function slotTemplates(block: string): string[] {
    const found: string[] = []
    const tags = /<template\b[^>]*>|<\/template>/g
    let depth = 0
    let start = -1
    for (const match of block.matchAll(tags)) {
      if (match[0].startsWith('</')) {
        depth--
        if (depth === 0 && start >= 0) {
          found.push(block.slice(start, match.index + match[0].length))
          start = -1
        }
        continue
      }
      if (depth === 0 && /^<template\s+#[\w-]+/.test(match[0])) start = match.index
      if (start >= 0) depth++
    }
    return found
  }

  /** The demo's boundary, <DemoBlock> or <DeferredBackend>, split into its default slot and what renders before the client. */
  function boundary(template: string) {
    const block = template.match(/<(DemoBlock|DeferredBackend)[\s>][\s\S]*?<\/\1>/)?.[0]
    if (!block) return undefined
    const named = slotTemplates(block)
    const inner = block.slice(block.indexOf('>') + 1, block.lastIndexOf('</'))
    return {
      live: named.reduce((rest, part) => rest.replace(part, ''), inner),
      early: template.replace(block, '') + named.join(''),
    }
  }

  // The client loads when the block scrolls into view or the reader starts
  // it, and only then may a part that needs it render: in the default slot
  // of <DemoBlock>, which renders it in <DeferredBackend>'s, or of a bare
  // <DeferredBackend>. The fallback, `#about` and the rest of the demo
  // render before it.
  it.each(demos)('%s keeps what needs the client in the deferred default slot', (name) => {
    const file = components.get(name)
    expect(file, `no component for ::${name}`).toBeDefined()
    const source = read(file!)
    const parts = boundary(source.slice(source.indexOf('<template>')))
    expect(parts, `${name} holds no <DemoBlock> or <DeferredBackend>`).toBeDefined()
    const live = namedComponents(parts!.live).filter(child => needsBackend(child, components))
    expect(live.length, `${name}'s live part`).toBeGreaterThan(0)
    expect(namedComponents(parts!.early).filter(child => needsBackend(child, components)), 'needs the client before it has loaded').toEqual([])
    expect(source.slice(0, source.indexOf('<template>')), `${name} calls the backend itself`).not.toMatch(BACKEND_CALL)
  })

  // A lazy component's code is its own chunk, fetched when it first renders:
  // with the client, not with the page.
  it.each(demos)('%s loads its live part lazily', (name) => {
    const source = read(components.get(name)!)
    const { live } = boundary(source.slice(source.indexOf('<template>')))!
    const tags = [...live.matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)].map(match => match[1]!)
    const needing = tags.filter(tag => needsBackend(tag.replace(/^Lazy(?=[A-Z])/, ''), components))
    expect(needing.length).toBeGreaterThan(0)
    for (const tag of needing) expect(tag, `${name} renders ${tag} eagerly`).toMatch(/^Lazy[A-Z]/)
  })

  it('<DemoBlock> renders its default slot only inside <DeferredBackend>\'s, never in the fallback', () => {
    const source = read('website/components/DemoBlock.vue')
    const template = source.slice(source.indexOf('<template>'))
    const parts = boundary(template.replace(/<DemoBlock\b/g, '<Frame'))
    expect(parts).toBeDefined()
    const isDefault = /<slot\s*\/>|<slot>/
    expect(parts!.live).toMatch(isDefault)
    expect(parts!.early).not.toMatch(isDefault)
    expect(parts!.early).toMatch(/<slot\s+name="about"/)
  })

  it('reads a slot\'s template whole, nested templates and all', () => {
    expect(slotTemplates('<X><template #fallback="{ a }"><template v-if="a">1</template><b /></template><Live /></X>'))
      .toEqual(['<template #fallback="{ a }"><template v-if="a">1</template><b /></template>'])
  })
})
