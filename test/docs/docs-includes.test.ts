import { describe, expect, it } from 'vitest'
import { INCLUDES, render } from '../../scripts/docs-includes.mjs'
import { read } from './helpers'

// STABILITY.md and CHANGELOG.md are also docs pages. The pages are generated
// (pnpm docs:includes), so a change to either file has to reach its page.
describe('docs pages rendered from repository files', () => {
  it.each(INCLUDES)('$page is $source as it is now', (include) => {
    expect(read(include.page), `run pnpm docs:includes after changing ${include.source}`).toBe(render(include))
  })
})
