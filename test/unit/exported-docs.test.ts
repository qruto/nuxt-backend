import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Every function the package's modules export carries its own doc comment,
// right above it. TypeDoc and an editor's hover read the comment that
// directly precedes a declaration: a helper slipped in between leaves the
// export undocumented, and the generated reference silently loses its
// description and examples.

const root = fileURLToPath(new URL('../..', import.meta.url))
const DIRS = ['src/convex', 'src/convex/integrations', 'src/convex/client', 'src/runtime/vue/composables']

const sources = DIRS.flatMap(dir => readdirSync(join(root, dir))
  .filter(name => name.endsWith('.ts') && !name.endsWith('.d.ts'))
  .map(name => join(root, dir, name)))

/** Exported functions with anything but a doc comment right above them. */
function undocumented(source: string): string[] {
  return [...source.matchAll(/^export (?:async )?function (\w+)/gm)]
    .filter(match => !source.slice(0, match.index).trimEnd().endsWith('*/'))
    .map(match => match[1]!)
}

describe('exported functions', () => {
  it('reads the package\'s modules', () => {
    expect(sources.length).toBeGreaterThan(40)
  })

  it('each carry a doc comment directly above them', () => {
    const missing = sources.flatMap(file => undocumented(readFileSync(file, 'utf8')).map(name => `${relative(root, file)}: ${name}`))
    expect(missing).toEqual([])
  })

  it('a helper between a doc comment and its export counts as missing', () => {
    expect(undocumented('/** Docs. */\nexport function a() {}\n')).toEqual([])
    expect(undocumented('/** Docs. */\nfunction helper() {}\n\nexport function b() {}\n')).toEqual(['b'])
  })
})
