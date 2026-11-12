import { describe, expect, it } from 'vitest'
import { RENAMES, UPGRADE_PAGE, headingAnchor, sectionUrl } from '../../src/guidance/renames'

// The rename map's own shape. test/docs/agent-guidance.test.ts holds it to
// the Upgrade page; this holds every entry to the contract `Rename` states,
// in the project coverage measures.
describe('the rename map', () => {
  it.each(RENAMES.map(entry => [entry.from, entry] as const))('`%s` names its change and its section', (_from, entry) => {
    expect(entry.from.trim()).not.toBe('')
    expect(['renamed', 'reshaped', 'removed']).toContain(entry.change)
    expect(entry.section.trim()).not.toBe('')
    expect(entry.section.startsWith('#')).toBe(false)
    // Only a removal may leave nothing in its place.
    if (entry.change !== 'removed') expect(entry.to).not.toBeNull()
    if (entry.to !== null) expect(entry.to.trim()).not.toBe('')
  })

  it('keeps one entry per old name in a section', () => {
    const keys = RENAMES.map(entry => `${entry.section}\n${entry.from}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('gives every section an anchor of its own', () => {
    const sections = [...new Set(RENAMES.map(entry => entry.section))]
    const anchors = sections.map(headingAnchor)
    expect(anchors.every(anchor => /^[\p{Ll}\p{N}-]+$/u.test(anchor))).toBe(true)
    expect(new Set(anchors).size).toBe(sections.length)
  })

  it('links a section on the Upgrade page', () => {
    expect(sectionUrl('A composable falls back when the app lacks its backend file'))
      .toBe(`${UPGRADE_PAGE}#a-composable-falls-back-when-the-app-lacks-its-backend-file`)
    expect(sectionUrl('`billing sync` prices every product in the organization\'s currency'))
      .toBe(`${UPGRADE_PAGE}#billing-sync-prices-every-product-in-the-organizations-currency`)
  })
})
