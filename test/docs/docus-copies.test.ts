import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { componentsIn, nuxtComponentName } from './components'
import { at } from './helpers'

// The docs chrome shadows Docus: a component or page of the same name in
// website/ replaces the layer's. Each one here was written against the
// Docus source it replaces, many as a changed copy, and the site leans on a
// few Docus sources it does not replace. When Docus changes one of them,
// its hash stops matching: read the upstream change, carry it into the
// site's file (or decide it does not apply), and record the new hash.

/** Each shadowing file, the Docus source it replaces, and that source's sha256 (first 16 hex digits). */
const SHADOWS: Record<string, [upstream: string, sha256: string]> = {
  'website/components/IconMenuToggle.vue': ['app/components/IconMenuToggle.vue', 'afd3c575d543d5ec'],
  'website/components/app/AppFooter.vue': ['app/components/app/AppFooter.vue', '803f3a044f7ca533'],
  'website/components/app/AppHeader.vue': ['app/components/app/AppHeader.vue', '34c4def5643765d0'],
  'website/components/app/AppHeaderBody.vue': ['app/components/app/AppHeaderBody.vue', '58af51854f28f7ef'],
  'website/components/app/AppHeaderBottom.vue': ['app/components/app/AppHeaderBottom.vue', '740c40e029b39e51'],
  'website/components/app/AppHeaderCTA.vue': ['app/components/app/AppHeaderCTA.vue', 'acc43dd168ab619a'],
  'website/components/app/AppHeaderLogo.vue': ['app/components/app/AppHeaderLogo.vue', '3cf724a235c0c06f'],
  'website/components/docs/DocsAsideLeftBody.vue': ['app/components/docs/DocsAsideLeftBody.vue', '189feeb74c322543'],
  'website/components/docs/DocsAsideMobileBar.vue': ['app/components/docs/DocsAsideMobileBar.vue', 'e26af93a988dd853'],
  'website/components/docs/DocsAsideRight.vue': ['app/components/docs/DocsAsideRight.vue', 'da1a11cbaedb007a'],
  'website/components/docs/DocsAsideRightBottom.vue': ['app/components/docs/DocsAsideRightBottom.vue', 'ecb58b4e25ee5c51'],
  'website/components/docs/DocsPageHeaderLinks.vue': ['app/components/docs/DocsPageHeaderLinks.vue', '0bed2558a9f79220'],
  'website/pages/[[lang]]/[...slug].vue': ['app/pages/[[lang]]/[...slug].vue', '88bdb6f09f9b2606'],
}

/** Docus sources the site keeps but is written against: what it relies on there, and the source's sha256. */
const DEPENDS: Record<string, [reliedOn: string, sha256: string]> = {
  'app/composables/useSeo.ts': ['the BreadcrumbList and TechArticle that [...slug].vue feeds it, `dateModified` from `modifiedAt`, and the homepage JSON-LD without `seo.schema`', '07fdd050eb991782'],
  'app/components/app/AppHeaderLeft.vue': ['the logo link\'s only accessible name, `header.title`: AppHeaderLogo\'s mark is hidden from assistive technology and its wordmark drops out below 420px', '02b3f61019af6548'],
  'app/templates/landing.vue': ['the homepage\'s <title> and social card, both from `seo.title` (SITE.seoTitle)', '722a1fe5604e8a80'],
  'server/api/__sitemap__/urls.ts': ['the sitemap\'s `lastmod`, read from `meta.modifiedAt`, which modules/docs-pages.ts stamps', '52eb23417d3584e6'],
}

const DOCUS = 'node_modules/docus'
const sha256 = (file: string) => createHash('sha256').update(readFileSync(at(file))).digest('hex').slice(0, 16)

describe('the Docus sources the site shadows', () => {
  it.each(Object.entries(SHADOWS))('%s still matches %s', (_site, [upstream, hash]) => {
    expect(sha256(`${DOCUS}/${upstream}`), `Docus changed ${upstream}: carry the change over, then record the new hash`).toBe(hash)
  })

  // Nuxt matches a component by the name it registers, which a folder makes
  // up as much as a file name: docs/PageHeaderLinks.vue would shadow
  // DocsPageHeaderLinks as surely as docs/DocsPageHeaderLinks.vue does.
  it('lists every site component that shadows one of Docus\'s, by the name Nuxt registers', () => {
    const docus = componentsIn(`${DOCUS}/app/components`)
    const shadowing = [...componentsIn('website/components')]
      .filter(([name]) => docus.has(name))
      .map(([, file]) => file.slice(file.indexOf('website/')))
    expect(shadowing.sort()).toEqual(Object.keys(SHADOWS).filter(file => file.startsWith('website/components/')).sort())
  })

  it('names a component the way Nuxt does', () => {
    expect(nuxtComponentName('/x/components/docs/PageHeaderLinks.vue', '/x/components')).toBe('DocsPageHeaderLinks')
    expect(nuxtComponentName('/x/components/docs/DocsPageHeaderLinks.vue', '/x/components')).toBe('DocsPageHeaderLinks')
    expect(nuxtComponentName('/x/components/app/AppHeader.vue', '/x/components')).toBe('AppHeader')
    expect(nuxtComponentName('/x/components/home/Hero.vue', '/x/components')).toBe('HomeHero')
    expect(nuxtComponentName('/x/components/home/index.vue', '/x/components')).toBe('Home')
    expect(nuxtComponentName('/x/components/Key.vue', '/x/components')).toBe('Key')
  })
})

describe('the Docus sources the site relies on', () => {
  it.each(Object.entries(DEPENDS))('%s still matches (%s)', (upstream, [_reliedOn, hash]) => {
    expect(sha256(`${DOCUS}/${upstream}`), `Docus changed ${upstream}: check that what the site relies on there still holds, then record the new hash`).toBe(hash)
  })
})
