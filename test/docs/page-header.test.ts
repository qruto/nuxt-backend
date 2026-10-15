import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { BACKEND_PAGE_DEFS } from '../../src/pages'
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

/** A site route the playground serves: a page file, or a module page the site mounts there. */
function servedBySite(route: string): boolean {
  const file = `website/pages${route}`
  if (existsSync(at(`${file}.vue`)) || existsSync(at(`${file}/index.vue`))) return true
  return BACKEND_PAGE_DEFS.some(def => route === `/playground/vanilla${def.defaultPath}`)
}

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

  // The client loads when the block scrolls into view, and only then may a
  // part that needs it render: in <DeferredBackend>'s default slot. Its
  // fallback, and the rest of the demo, render before it.
  it.each(demos)('%s keeps what needs the client in <DeferredBackend>\'s default slot', (name) => {
    const file = components.get(name)
    expect(file, `no component for ::${name}`).toBeDefined()
    const source = read(file!)
    const template = source.slice(source.indexOf('<template>'))
    const block = template.match(/<DeferredBackend[\s>][\s\S]*?<\/DeferredBackend>/)?.[0]
    expect(block, `${name} holds no <DeferredBackend>`).toBeDefined()
    const fallback = block!.match(/<template #fallback[\s\S]*?<\/template>/)?.[0] ?? ''
    const early = template.replace(block!, '') + fallback
    const live = namedComponents(block!.replace(fallback, '')).filter(child => child !== 'DeferredBackend' && needsBackend(child, components))
    expect(live.length, `${name}'s live part`).toBeGreaterThan(0)
    expect(namedComponents(early).filter(child => needsBackend(child, components)), 'needs the client before it has loaded').toEqual([])
    expect(source.slice(0, source.indexOf('<template>')), `${name} calls the backend itself`).not.toMatch(BACKEND_CALL)
  })
})
