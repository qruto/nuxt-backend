import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { $fetch, createPage, setup, useTestContext } from '@nuxt/test-utils/e2e'

// `lazily` (src/nuxt/registry.ts), in a real production build: a component
// registered through it is server-rendered (the server waits for it), its
// code sits in a chunk of its own outside the client entry, fetched when it
// first renders, and the browser hydrates the server's markup once that
// chunk arrived. test/unit/lazy-components.test.ts holds the generated
// module to the same in Vue alone; this proves Nuxt's build keeps it apart.

const rootDir = fileURLToPath(new URL('../fixtures/lazy-build', import.meta.url))
const MARKER = 'lazy-chunk-marker-7f3a'

process.env.NUXT_TELEMETRY_DISABLED ||= '1'

await setup({
  rootDir,
  server: true,
  browser: true,
  // A cold production build; the margin is for slower CI runners.
  setupTimeout: 600_000,
})

/** The built app's client chunks, by file name. */
function clientChunks(): Map<string, string> {
  const publicDir = join(useTestContext().nuxt!.options.nitro.output!.dir!, 'public')
  const dir = join(publicDir, useTestContext().nuxt!.options.app.buildAssetsDir.replace(/^\/|\/$/g, ''))
  return new Map(readdirSync(dir).filter(file => file.endsWith('.js')).map(file => [file, readFileSync(join(dir, file), 'utf8')]))
}

describe('a component registered through lazily(), built', { timeout: 120_000 }, () => {
  it('is server-rendered: the server waits for its chunk', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain(`data-heavy-probe="${MARKER}"`)
    expect(html).toContain('Ada: 0')
  })

  it('keeps its code out of the client entry, in a chunk of its own', async () => {
    const html = await $fetch<string>('/')
    const entries = [...html.matchAll(/<script[^>]+type="module"[^>]+src="[^"]*\/([^"/]+\.js)"/g)].map(([, file]) => file!)
    expect(entries.length, 'the page loads a client entry').toBeGreaterThan(0)
    const chunks = clientChunks()
    for (const entry of entries) expect(chunks.get(entry), `${entry} is built`).toBeDefined()
    expect(entries.filter(entry => chunks.get(entry)!.includes(MARKER)), 'the entry carries the component').toEqual([])
    const own = [...chunks].filter(([, code]) => code.includes(MARKER)).map(([file]) => file)
    expect(own, 'exactly one chunk carries the component').toHaveLength(1)
    // The entry reaches it through a dynamic import, never a static one.
    const file = own[0]!.replace(/[.$-]/g, character => `\\${character}`)
    const others = [...chunks].filter(([name]) => name !== own[0]).map(([, code]) => code)
    // Minified, a specifier may be written in any quotes: import(`./C1ow-6S0.js`).
    expect(others.some(code => new RegExp(`import\\(\\s*['"\`]\\./${file}['"\`]`).test(code)), 'a dynamic import of it').toBe(true)
    expect(entries.some(entry => new RegExp(`from\\s*['"\`]\\./${file}['"\`]`).test(chunks.get(entry)!)), 'a static import of it in the entry').toBe(false)
  })

  it('hydrates the server\'s markup once its chunk arrived', async () => {
    const errors: string[] = []
    const page = await createPage()
    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type())) errors.push(message.text())
    })
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(new URL('/', useTestContext().url!).href, { waitUntil: 'networkidle' })
    const probe = page.locator(`[data-heavy-probe="${MARKER}"]`)
    await probe.click()
    await expect.poll(() => probe.textContent()).toBe('Ada: 1')
    expect(errors.filter(text => /hydrat|mismatch/i.test(text))).toEqual([])
    await page.close()
  })
})
