import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BACKEND_PAGE_DEFS } from '../../src/pages'
import { REPOSITORY } from '../../website/shared/page-keys'
import { at, contentFile, contentRoute, frontmatter, GENERATED_REFERENCE, read, walk } from './helpers'

// What a docs page's header and aside promise, from its frontmatter: the
// Try live, API and Source keys lead somewhere real, the live demos sit
// only on pages that load the backend client for them, and the
// last-updated date comes from git, never from a hand.

const DOCS = 'website/content/docs'
const pages = walk(DOCS, ['.md']).map(file => file.slice(file.indexOf(DOCS)))
const handWritten = pages.filter(file => !`${file}/`.includes(GENERATED_REFERENCE))
const fields = (file: string) => frontmatter(read(file))
const withField = (name: string) => handWritten.filter(file => fields(file)[name]).map(file => [contentRoute(file), fields(file)[name]!] as const)

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
    const related = [...read(file).matchAll(/^related:\n((?: {2}- .+\n)+)/gm)].flatMap(m => m[1]!.split('\n').filter(Boolean).map(line => line.replace(/^ {2}- /, '')))
    for (const route of related) expect(() => contentFile(route), route).not.toThrow()
  })

  it('takes every last-updated date from git: no page writes its own', () => {
    for (const file of pages) expect(fields(file).modifiedAt, file).toBeUndefined()
  })
})

describe('live demos', () => {
  const DEMO_BLOCK = /^::demo-[\w-]+/m

  it('sit exactly on the pages marked `demo: true`, where the backend client may load', () => {
    const marked = handWritten.filter(file => fields(file).demo === 'true').map(contentRoute).sort()
    const used = handWritten.filter(file => DEMO_BLOCK.test(read(file))).map(contentRoute).sort()
    expect(marked).toEqual(used)
  })

  it.each(['DemoCounter', 'DemoConnection'])('%s waits for the client inside <DeferredBackend>', (name) => {
    expect(read(`website/components/${name}.vue`)).toContain('<DeferredBackend')
  })
})
