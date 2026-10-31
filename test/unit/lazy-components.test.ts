// @vitest-environment happy-dom
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h, type Component } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { lazyComponentModule } from '../../src/nuxt/registry'

// The module a heavy component is registered from (src/nuxt/registry.ts,
// `lazily`): an async component over the component's own file. It
// must fetch that file only when one renders, and render and hydrate exactly
// like the component itself — Nuxt server-renders it, and the browser
// hydrates the server's markup. test/e2e/lazy-component.test.ts builds a
// fixture app on it and checks the same through Nuxt's build: a chunk of
// its own, outside the client entry.

// `import.meta.url` is not a file URL under happy-dom.
const fixture = join(import.meta.dirname, '../fixtures/lazy-component')
// Under the fixture, so `vue` resolves as it does for the test; `.tmp` is gitignored.
const generated = join(fixture, '.tmp')
const loads = globalThis as { __probeLoads?: number }

/**
 * The lazy module for a fresh copy of the probe (so no other test has loaded
 * it), written where the bundler can import it, over the probe's `exported`
 * export.
 */
async function lazyProbe(exported = 'Probe'): Promise<Component> {
  mkdirSync(generated, { recursive: true })
  const stem = join(generated, `probe-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  copyFileSync(join(fixture, 'probe.ts'), `${stem}.ts`)
  writeFileSync(`${stem}.lazy.mjs`, lazyComponentModule('Probe', exported, `${stem}.ts`))
  return ((await import(/* @vite-ignore */ `${stem}.lazy.mjs`)) as { Probe: Component }).Probe
}

const app = (component: Component) => createSSRApp({ render: () => h(component, { label: 'Ada' }, () => ' signed in') })
// The probe's own server markup, its slot between Vue's fragment anchors.
const MARKUP = '<p data-probe><strong>Ada</strong><!--[--> signed in<!--]--></p>'

afterEach(() => vi.restoreAllMocks())
afterAll(() => rmSync(generated, { recursive: true, force: true }))

describe('a lazy component', () => {
  it('fetches its file when it first renders, not when it is imported', async () => {
    const before = loads.__probeLoads ?? 0
    const Probe = await lazyProbe()
    expect(loads.__probeLoads ?? 0).toBe(before)
    await renderToString(app(Probe))
    expect(loads.__probeLoads).toBe(before + 1)
  })

  it('wraps a default export under the component\'s name', async () => {
    expect(await renderToString(app(await lazyProbe('default')))).toBe(MARKUP)
  })

  it('refuses a name a module cannot export', () => {
    expect(() => lazyComponentModule('chat-thread', 'default', '/x.ts')).toThrow(/not a component name/)
  })

  it('writes the path and the export as literals no script element or line ends inside', () => {
    const code = lazyComponentModule('Probe', 'de\u2028fault', '/a</script>.ts')
    expect(code).not.toContain('</script>')
    expect(code).not.toMatch(/[\u2028\u2029]/)
    expect(code).toContain('import("/a\\u003c/script\\u003e.ts")')
    expect(code).toContain('module["de\\u2028fault"]')
  })

  it('renders on the server what the component renders', async () => {
    expect(await renderToString(app(await lazyProbe()))).toBe(MARKUP)
  })

  it('hydrates the server\'s markup in place, with no mismatch', async () => {
    const Probe = await lazyProbe()
    const container = document.createElement('div')
    container.innerHTML = await renderToString(app(Probe))
    const markup = container.innerHTML
    const rendered = container.firstElementChild
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    app(Probe).mount(container)
    await vi.waitFor(() => expect((container as { _vnode?: { component?: { subTree?: { el?: unknown } } } })._vnode?.component?.subTree?.el).toBe(rendered))
    expect(container.innerHTML).toBe(markup)
    expect([...warn.mock.calls, ...error.mock.calls].flat().join(' ')).not.toMatch(/hydrat|mismatch/i)
  })
})
