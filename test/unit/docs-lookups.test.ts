import { describe, expect, it } from 'vitest'
import { code, table } from '../../scripts/docs-lookups/markdown.mjs'
import { readRegion, regionNames, writeRegion } from '../../scripts/docs-lookups/regions.mjs'

// The two primitives every docs lookup writes through: the marked regions a
// page keeps its generated tables in, and the Markdown a table cell holds.

const page = (eol: string) => ['# Page', '', 'Prose.', '', '<!-- generated:t (pnpm docs:lookups, from x) -->', '', 'old', '', '<!-- /generated:t -->', '', 'More prose.', ''].join(eol)

describe('regions', () => {
  it('replaces only what sits between a region\'s markers', () => {
    const written = writeRegion('a.md', page('\n'), 't', 'new', 'src/y.ts')
    expect(written).toBe(page('\n').replace('old', 'new').replace('from x', 'from src/y.ts'))
    expect(readRegion('a.md', written, 't')).toBe('new')
    expect(regionNames('a.md', written)).toEqual(['t'])
  })

  it('keeps a file\'s CRLF line ends, and reads its region without them', () => {
    const written = writeRegion('a.md', page('\r\n'), 't', 'one\ntwo', 'x')
    expect(written).not.toMatch(/[^\r]\n/)
    expect(readRegion('a.md', written, 't')).toBe('one\ntwo')
  })

  it('refuses a region without its closing marker, or marked twice', () => {
    const unpaired = page('\n').replace('<!-- /generated:t -->', '')
    expect(readRegion('a.md', unpaired, 't')).toBeUndefined()
    expect(() => writeRegion('a.md', unpaired, 't', 'new', 'x')).toThrow(/marks no region "t"/)
    expect(() => writeRegion('a.md', `${page('\n')}${page('\n')}`, 't', 'new', 'x')).toThrow(/twice/)
  })

  it('reads a closing marker before its opening one as no region', () => {
    const swapped = '<!-- /generated:t -->\n\n<!-- generated:t (x) -->\n'
    expect(readRegion('a.md', swapped, 't')).toBeUndefined()
  })

  it('takes line comments in a TypeScript file', () => {
    const text = 'a\n// generated:ids (x)\nold\n// /generated:ids\nb\n'
    expect(writeRegion('a.ts', text, 'ids', 'new', 'y')).toBe('a\n// generated:ids (pnpm docs:lookups, from y)\nnew\n// /generated:ids\nb\n')
  })
})

describe('markdown', () => {
  it('escapes a pipe in a cell, and keeps one already escaped', () => {
    expect(table(['A'], [['a | b'], ['c \\| d']])).toBe('| A |\n|---|\n| a \\| b |\n| c \\| d |')
  })

  it('puts a multi-line value on one line', () => {
    expect(table(['A'], [['one\n  two']])).toBe('| A |\n|---|\n| one two |')
  })

  it('widens a code span around backticks', () => {
    expect(code('a`b')).toBe('``a`b``')
    expect(code('`a')).toBe('`` `a ``')
  })
})
