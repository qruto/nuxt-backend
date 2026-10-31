import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { ogMark, ogMarkSrc } from '../../website/utils/og-plate'
import { at, read } from './helpers'

// The plates and marks: the social cards the site draws for its pages, the
// README's hero, and the icon the Nuxt modules registry shows. Each wears the
// house mark (public/logo-dark.svg) and the site's own type, engraved the
// site's way: offset copies of the text under the ink, never a filter or a
// text-shadow, and never a signal.

/** The three tritium bars of a mark, as `x y width height` and the core colour, in the order drawn. */
function bars(svg: string): string[] {
  return [...svg.matchAll(/<rect x="12" y="([\d.]+)" width="20" height="3" rx="1.5" fill="(#[0-9a-f]{6})"\/>/g)].map(([, y, fill]) => `${y} ${fill}`)
}

const HOUSE_BARS = bars(read('website/public/logo-dark.svg'))

describe('the house mark', () => {
  it('has its three signals, go, attention and danger', () => {
    expect(HOUSE_BARS).toEqual(['13 #c4ffd6', '20.5 #ffeaa0', '28 #ffb8b0'])
  })

  it('is what the social cards draw', () => {
    expect(bars(ogMark(64))).toEqual(HOUSE_BARS)
    // Two marks on one page keep their gradients apart.
    expect(ogMark(64, 'a')).toContain('id="a-face"')
    // A card draws it as an image of its own, with no HTML set.
    expect(atob(ogMarkSrc(64).replace('data:image/svg+xml;base64,', ''))).toBe(ogMark(64))
  })
})

describe('the social cards', () => {
  const cards = ['Plate', 'Landing'].map(name => [name, read(`website/components/OgImage/${name}.takumi.vue`)] as const)

  it.each(cards)('%s engraves with stacked text layers, never a text-shadow', (_, card) => {
    expect(card).not.toMatch(/text-shadow|textShadow|v-html/)
    expect(card).toMatch(/v-for="layer in OG_RELIEF(?:_SM)?"/)
  })

  it.each(cards)('%s names its faces in static styles, so nuxt-og-image loads them', (_, card) => {
    // nuxt-og-image reads a card's static `style` attributes for the families and weights it loads.
    const styles = [...card.matchAll(/ style="([^"]+)"/g)].map(([, style]) => style!)
    expect(styles.some(style => style.includes('font-family: \'Anybody\'') && style.includes('font-weight: 700'))).toBe(true)
    expect(styles.some(style => style.includes('font-family: \'Martian Mono\'') && style.includes('font-weight: 500'))).toBe(true)
    expect(card).not.toMatch(/coin|og-edge/)
  })

  it('draws every docs page on the plate, and the homepage on the landing plate', () => {
    expect(read('website/pages/[[lang]]/[...slug].vue')).toMatch(/defineOgImage\('Plate', \{/)
    // A route rule picks the card over the page's own call, so the homepage has one of its own.
    const config = read('website/nuxt.config.ts')
    expect(config).toContain(`'/**': { ogImage: { component: 'Plate' } },`)
    expect(config).toContain(`'/': { ogImage: { component: 'Landing' } },`)
    // Docus's landing template asks for `Landing`; the site's own card of that name answers.
    expect(read('node_modules/docus/app/templates/landing.vue')).toMatch(/defineOgImage\('Landing',/)
    expect(read('website/server/plugins/og-image-page-description.ts')).toContain('new Set([\'OgImagePlateTakumi\', \'OgImageLandingTakumi\'])')
  })
})

describe('the README hero', () => {
  const readme = read('README.md')
  const heroes = (['dark', 'light'] as const).map(scheme => [scheme, read(`.github/assets/hero-${scheme}.svg`)] as const)

  it('shows the dark plate in a dark scheme and the light one otherwise', () => {
    expect(readme).toMatch(/<source media="\(prefers-color-scheme: dark\)" srcset="https:\/\/raw\.githubusercontent\.com\/qruto\/nuxt-backend\/main\/\.github\/assets\/hero-dark\.svg">/)
    expect(readme).toMatch(/<img src="https:\/\/raw\.githubusercontent\.com\/qruto\/nuxt-backend\/main\/\.github\/assets\/hero-light\.svg"/)
  })

  it.each(heroes)('%s carries its type as outlines of the site\'s faces', (_, svg) => {
    // No <text>, so no font to fetch: it renders the same in every viewer.
    expect(svg).not.toMatch(/<text\b|font-family|@import|<image\b|href="http/)
    expect(svg).toMatch(/<path id="wm" d="M[^"]+"\/>/)
    expect(svg).toMatch(/<path id="eb" d="M[^"]+"\/>/)
    expect(svg).toContain('Anybody 700 at wdth 118 and Martian Mono 500')
  })

  it.each(heroes)('%s wears the house mark, and engraves only the metal', (_, svg) => {
    expect(bars(svg)).toEqual(HOUSE_BARS)
    // Two relief layers (or four, for display type) under each ink, all copies of the outlined text.
    expect(svg.match(/<use href="#wm"/g)).toHaveLength(5)
    expect(svg.match(/<use href="#eb"/g)).toHaveLength(3)
    expect(svg).toContain('role="img" aria-label="nuxt-backend — the all-in-one SaaS backend for Nuxt, built on Convex"')
  })
})

describe('the registry icon', () => {
  const entry = parse(read('.github/registry/backend.yml')) as { icon: string }

  it('is the file the registry entry names, beside it', () => {
    expect(existsSync(at(`.github/registry/${entry.icon}`))).toBe(true)
  })

  it('is the house mark, square', () => {
    const icon = read(`.github/registry/${entry.icon}`)
    const [, width, height] = icon.match(/viewBox="0 0 (\d+) (\d+)"/) ?? []
    expect(width).toBe(height)
    expect(bars(icon)).toEqual(HOUSE_BARS)
    expect(icon).not.toMatch(/<text\b|prefers-color-scheme/)
  })
})
