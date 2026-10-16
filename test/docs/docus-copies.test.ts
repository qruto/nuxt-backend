import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { describe, expect, it } from 'vitest'
import { at, walk } from './helpers'

// The docs chrome shadows Docus: a component or page of the same name in
// website/ replaces the layer's. Each one here was written against the
// Docus source it replaces, many as a changed copy. When Docus changes that
// source, its hash stops matching: read the upstream change, carry it into
// the site's file (or decide it does not apply), and record the new hash.

/** Each shadowing file, the Docus source it replaces, and that source's sha256 (first 16 hex digits). */
const SHADOWS: Record<string, [upstream: string, sha256: string]> = {
  'website/components/IconMenuToggle.vue': ['app/components/IconMenuToggle.vue', 'dfc00c75625ab25b'],
  'website/components/app/AppFooter.vue': ['app/components/app/AppFooter.vue', '803f3a044f7ca533'],
  'website/components/app/AppHeader.vue': ['app/components/app/AppHeader.vue', '591a7c8d4383c219'],
  'website/components/app/AppHeaderBody.vue': ['app/components/app/AppHeaderBody.vue', '58af51854f28f7ef'],
  'website/components/app/AppHeaderBottom.vue': ['app/components/app/AppHeaderBottom.vue', '740c40e029b39e51'],
  'website/components/app/AppHeaderCTA.vue': ['app/components/app/AppHeaderCTA.vue', 'acc43dd168ab619a'],
  'website/components/app/AppHeaderLogo.vue': ['app/components/app/AppHeaderLogo.vue', '3cf724a235c0c06f'],
  'website/components/docs/DocsAsideLeftBody.vue': ['app/components/docs/DocsAsideLeftBody.vue', '189feeb74c322543'],
  'website/components/docs/DocsAsideRightBottom.vue': ['app/components/docs/DocsAsideRightBottom.vue', 'ecb58b4e25ee5c51'],
  'website/components/docs/DocsPageHeaderLinks.vue': ['app/components/docs/DocsPageHeaderLinks.vue', '58dc7609435936be'],
  'website/pages/[[lang]]/[...slug].vue': ['app/pages/[[lang]]/[...slug].vue', '53f13dc4ec6e4dcd'],
}

const DOCUS = 'node_modules/docus'
const sha256 = (file: string) => createHash('sha256').update(readFileSync(at(file))).digest('hex').slice(0, 16)
const name = (file: string) => basename(file).replace(/\.(?:vue|ts)$/, '')

describe('the Docus sources the site shadows', () => {
  it.each(Object.entries(SHADOWS))('%s still matches %s', (_site, [upstream, hash]) => {
    expect(sha256(`${DOCUS}/${upstream}`), `Docus changed ${upstream}: carry the change over, then record the new hash`).toBe(hash)
  })

  it('lists every site component that shadows one of Docus\'s', () => {
    const docus = new Set(walk(`${DOCUS}/app/components`, ['.vue']).map(name))
    const shadowing = walk('website/components', ['.vue', '.ts'])
      .filter(file => docus.has(name(file)))
      .map(file => file.slice(file.indexOf('website/')))
    expect(shadowing.sort()).toEqual(Object.keys(SHADOWS).filter(file => file.startsWith('website/components/')).sort())
  })
})
