import { runInThisContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import * as vue from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'
import { renderToString } from 'vue/server-renderer'
import { read } from './helpers'

// The part components as a page renders them (website/components): what a
// key says about itself when it is a link, disabled or pressed, and what an
// LED says when it has a name.

/**
 * A website component compiled as Nuxt compiles it, its template inlined,
 * with Nuxt's auto-imported `computed` in scope.
 */
function component(file: string): vue.Component {
  const { descriptor } = parse(read(file), { filename: file })
  const { content } = compileScript(descriptor, { id: file, inlineTemplate: true })
  const { outputText } = ts.transpileModule(content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const module = { exports: {} as { default?: vue.Component } }
  const load = (id: string) => {
    if (id === 'vue') return vue
    throw new Error(`${file} imports ${id}`)
  }
  runInThisContext(`(function (require, module, exports, computed) {\n${outputText}\n})`)(load, module, module.exports, vue.computed)
  return module.exports.default!
}

/** NuxtLink as an anchor; the attributes a key passes fall through onto it. */
const NuxtLink = vue.defineComponent({
  props: { to: { type: null, required: true } },
  setup: (props, { slots }) => () => vue.h('a', { href: String(props.to) }, slots.default?.()),
})

async function render(file: string, props: Record<string, unknown>, text = 'Key'): Promise<string> {
  const app = vue.createSSRApp({ render: () => vue.h(component(file), props, { default: () => text }) })
  app.component('NuxtLink', NuxtLink)
  return renderToString(app)
}

describe('<Key>', () => {
  it('is a link to its page', async () => {
    const html = await render('website/components/Key.vue', { to: '/docs' })
    expect(html).toMatch(/^<a href="\/docs" class="k">/)
    expect(html).not.toContain('aria-disabled')
  })

  it('has no href when it is a disabled link, and says it is disabled', async () => {
    const html = await render('website/components/Key.vue', { to: '/docs', disabled: true })
    expect(html).toMatch(/^<a /)
    expect(html).not.toContain('href=')
    expect(html).toContain('role="link"')
    expect(html).toContain('aria-disabled="true"')
  })

  it('is current anywhere in its section when it is a pressed link', async () => {
    expect(await render('website/components/Key.vue', { to: '/docs', pressed: true })).toContain('aria-current="true"')
    expect(await render('website/components/Key.vue', { to: '/docs', pressed: false })).not.toContain('aria-current')
  })

  it('is a toggle button when it is pressed without a link', async () => {
    const html = await render('website/components/Key.vue', { pressed: true, signal: 'go' })
    expect(html).toMatch(/^<button type="button" aria-pressed="true" class="k k-go">/)
  })

  it('is a disabled button when it is disabled without a link', async () => {
    expect(await render('website/components/Key.vue', { disabled: true })).toMatch(/^<button type="button" disabled class="k">/)
  })
})

describe('<Led>', () => {
  it('is hidden from assistive technology without a label', async () => {
    const html = await render('website/components/Led.vue', { tone: 'warn' }, '')
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('role=')
  })

  it('is an image named by its label', async () => {
    const html = await render('website/components/Led.vue', { tone: 'warn', label: 'Experimental' }, '')
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="Experimental"')
    expect(html).not.toContain('aria-hidden')
  })
})
