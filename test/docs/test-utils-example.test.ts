import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { at, contentFile, read } from './helpers'

// The Testing page's setup and worked example are what CI's `pack` job runs
// in a starter app installed from the packed package (test/fixtures/
// test-utils): each fixture file is its code block, word for word, so the
// page shows nothing that run has not passed.

const page = read(contentFile('/docs/develop/testing/pages'))

/** The body of the page's code block titled `title`. */
function block(title: string): string {
  const fence = `\`\`\`ts [${title}]\n`
  const start = page.indexOf(fence)
  expect(start, `the Testing page has a \`${title}\` block`).toBeGreaterThan(-1)
  return page.slice(start + fence.length, page.indexOf('```\n', start + fence.length))
}

/** A fixture file without its leading comment. */
const code = (path: string) => readFileSync(at(path), 'utf8').replace(/^(?:\/\/.*\n)+/, '')

describe('the Testing page\'s example', () => {
  it.each([
    ['vitest.config.ts', 'test/fixtures/test-utils/vitest.config.ts'],
    ['test/app/pricing.test.ts', 'test/fixtures/test-utils/test/app/pricing.test.ts'],
  ])('`%s` is the fixture CI runs, word for word', (title, fixture) => {
    expect(code(fixture)).toBe(block(title))
  })
})
