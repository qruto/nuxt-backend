import { runInThisContext } from 'node:vm'
import ts from 'typescript'
import * as vue from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'
import { renderToString } from 'vue/server-renderer'
import * as shared from '../../website/shared/console'
import { read } from './helpers'

/** The Vue functions Nuxt auto-imports that the site's components call. */
const AUTO_IMPORTS = ['computed', 'nextTick', 'onBeforeUnmount', 'onMounted', 'ref', 'useId', 'useTemplateRef', 'watch'] as const

/**
 * A website component compiled as Nuxt compiles it, its template inlined,
 * with Nuxt's auto-imported Vue functions in scope. `modules` stands in for
 * what it imports besides `vue` (`~~/shared/console`), and `globals` for
 * the site's own auto-imports (`useCopy`). Components it uses are resolved
 * by name from the app that renders it.
 */
export function component(file: string, modules: Record<string, unknown> = {}, globals: Record<string, unknown> = {}): vue.Component {
  const { descriptor } = parse(read(file), { filename: file })
  const { content } = compileScript(descriptor, { id: file, inlineTemplate: true })
  const { outputText } = ts.transpileModule(content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const module = { exports: {} as { default?: vue.Component } }
  const load = (id: string) => {
    if (id === 'vue') return vue
    if (id in modules) return modules[id]
    throw new Error(`${file} imports ${id}`)
  }
  const scope = { ...Object.fromEntries(AUTO_IMPORTS.map(name => [name, vue[name]])), ...globals }
  runInThisContext(`(function (require, module, exports, ${Object.keys(scope).join(', ')}) {\n${outputText}\n})`)(load, module, module.exports, ...Object.values(scope))
  return module.exports.default!
}

/** NuxtLink as an anchor; the attributes a key passes fall through onto it. */
export const NuxtLink = vue.defineComponent({
  props: { to: { type: null, required: true } },
  setup: (props, { slots }) => () => vue.h('a', { href: String(props.to) }, slots.default?.()),
})

/** A Nuxt UI icon as the name it draws. */
export const UIcon = vue.defineComponent({
  props: { name: { type: String, required: true } },
  setup: props => () => vue.h('span', { 'data-icon': props.name }),
})

/**
 * The dial as a plain radio group: one button per detent that sets the
 * model, so a test can turn it without the knob's geometry.
 */
export const Dial = vue.defineComponent({
  props: { options: { type: Array as vue.PropType<Array<{ value: string, label: string }>>, required: true }, modelValue: { type: String, required: true } },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () => vue.h('div', { role: 'radiogroup' }, props.options.map(option => vue.h('button', { 'type': 'button', 'data-detent': option.value, 'onClick': () => emit('update:modelValue', option.value) }, option.label))),
})

/** The site's part components, compiled from website/components, by the names Nuxt registers them under. */
export function parts(): Record<string, vue.Component> {
  return Object.fromEntries(['Console', 'EngravedTitle', 'Key', 'Lcd', 'Led', 'Strip'].map(name => [name, component(`website/components/${name}.vue`)]))
}

/** The rows the home console's LCD draws for a service: the command, each finding and its fix, the summary. */
export function lcdRowCount(service: string): number {
  const { lines } = shared.CONSOLE_DETENTS.find(entry => entry.service === service)!
  return 2 + lines.length + lines.filter(line => line.fixHint).length
}

/**
 * The homepage console (home/Console.vue) with `service` on the dial's
 * first detent, the one the page renders, and the parts it is built from.
 */
export function homeConsole(service: string): { root: vue.Component, components: Record<string, vue.Component> } {
  const detents = [...shared.CONSOLE_DETENTS].sort((a, b) => Number(b.service === service) - Number(a.service === service))
  const root = component('website/components/home/Console.vue', { '~~/shared/console': { ...shared, CONSOLE_DETENTS: detents } })
  return { root, components: { ...parts(), Dial } }
}

/** `root` rendered on the server, with `components` registered by name. */
export async function renderComponent(root: vue.Component, props: Record<string, unknown> = {}, components: Record<string, vue.Component> = {}, text?: string): Promise<string> {
  const app = vue.createSSRApp({ render: () => vue.h(root, props, text === undefined ? undefined : { default: () => text }) })
  for (const [name, part] of Object.entries({ NuxtLink, UIcon, ...components })) app.component(name, part)
  return renderToString(app)
}
