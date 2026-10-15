import { describe, expect, it } from 'vitest'
import { contrast, designDoc, measure, readTokens, resolve, withTable } from '../../scripts/design-contrast.mjs'
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
