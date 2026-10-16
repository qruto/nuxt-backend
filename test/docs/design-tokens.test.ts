import { describe, expect, it } from 'vitest'
import { contrast, designDoc, FLOOR, inkColor, measure, readTokens, resolve, unscopedBridges, withTable } from '../../scripts/design-contrast.mjs'
import { CODE_GROUND, codeInk } from '../../website/shiki-themes'
import { THEME_COLOR } from '../../website/shared/theme-color'

// The site's text contrast, measured on the values its stylesheets declare
// (scripts/design-contrast.mjs). A token edit that drops a pair below its
// WCAG bar fails here, and design.md's table follows the tokens.

const tokens = readTokens()
const rows = measure(tokens)

describe('text contrast', () => {
  it.each(rows.map(row => [`${row.ink} on ${row.on}`, row] as const))('%s clears its bar in both themes', (_label, row) => {
    expect(row.light, 'light').toBeGreaterThanOrEqual(row.min)
    expect(row.dark, 'dark').toBeGreaterThanOrEqual(row.min)
  })

  it('is what design.md says (node scripts/design-contrast.mjs --write)', () => {
    const doc = designDoc()
    expect(withTable(doc, rows)).toBe(doc)
  })
})

describe('the per-ground inks', () => {
  // A property declared on :root resolves its var()s there, so one that
  // reads an ink a plaque or a well re-derives (Nuxt UI's --ui-text-muted
  // reads --ink-dim) would carry :root's ink into them unless each scope
  // re-declares it.
  it('reach every :root property that reads them', () => {
    expect(unscopedBridges(tokens)).toEqual([])
  })
})

describe('the cut floor', () => {
  // A cut catches light at its bottom, on a light page as on a dark one.
  const lightness = (colour: ReturnType<typeof inkColor>) => contrast(colour, '#000000')

  it.each(['light', 'dark'] as const)('is lighter than the engraved ink in %s, on every ground', (theme) => {
    for (const scope of ['ground', 'raised', 'well']) {
      expect(lightness(inkColor(tokens, FLOOR, theme, scope)), scope).toBeGreaterThan(lightness(inkColor(tokens, '--engrave-ink', theme, scope)))
    }
  })
})

describe('the browser chrome', () => {
  it('takes the page ground as its theme-color in both schemes', () => {
    expect(THEME_COLOR.light).toBe(resolve(tokens, '--bg', 'light'))
    expect(THEME_COLOR.dark).toBe(resolve(tokens, '--bg', 'dark'))
  })
})

describe('code', () => {
  it('sits on the well the stylesheet gives it', () => {
    expect(CODE_GROUND.light).toBe(resolve(tokens, '--sink', 'light'))
    expect(CODE_GROUND.dark).toBe(resolve(tokens, '--sink', 'dark'))
  })

  it.each(['light', 'dark'] as const)('paints every token in a %s ink that clears 4.5:1', (theme) => {
    for (const [role, ink] of Object.entries(codeInk[theme])) {
      expect(contrast(ink, CODE_GROUND[theme]), role).toBeGreaterThanOrEqual(4.5)
    }
  })
})
