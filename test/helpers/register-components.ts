import { config } from '@vue/test-utils'
import type { Component } from 'vue'
import { REGISTERED_UI, UI_ENTRIES, UI_INTERNALS, uiPath } from '../../src/ui/registry'

// The package's components and parts, registered by name for the mounts of
// the test file that asks. In an app, Nuxt resolves a tag such as
// `<AuthFormCode>` in a packaged `.vue` file to the registered component
// (the app's own when it has one of that name); the test app installs no
// module, so the names are registered here instead. Call it from the test
// file, after its `vi.mock` calls, so the components it loads see the mocks;
// it loads only what the named files render, so a test of one component
// never loads another's dependencies.

const ROOT = '../../src/runtime/vue'
const loaders = import.meta.glob<{ default: Component }>('../../src/runtime/vue/{components,pages}/**/*.vue')
const sources = import.meta.glob<string>('../../src/runtime/vue/{components,pages}/**/*.vue', { query: '?raw', import: 'default', eager: true })

/** A packaged file by its name (an internal one included), or a page's (`page:login`), relative to this helper. */
function fileOf(name: string): string {
  if (name.startsWith('page:')) return `${ROOT}/pages/${name.slice('page:'.length)}.vue`
  const entry = [...UI_ENTRIES, ...UI_INTERNALS].find(candidate => candidate.name === name)
  if (!entry) throw new Error(`register-components: ${name} is no packaged component`)
  return `${ROOT}/components/${uiPath(entry)}.vue`
}

/**
 * The registered names the named files render by tag, followed through the
 * `.vue` files they import (a page's frame) and the registered ones they
 * render, and so on.
 */
function rendered(names: readonly string[]): Set<string> {
  const found = new Set<string>()
  const seen = new Set<string>()
  const queue = names.map(fileOf)
  while (queue.length) {
    const file = queue.shift()!
    if (seen.has(file)) continue
    seen.add(file)
    const source = sources[file]
    if (source === undefined) throw new Error(`register-components: no source at ${file}`)
    for (const [, imported] of source.matchAll(/from '(\.{1,2}\/[^']+\.vue)'/g)) {
      const parts = file.split('/').slice(0, -1)
      for (const segment of imported!.split('/')) {
        if (segment === '..') parts.pop()
        else if (segment !== '.') parts.push(segment)
      }
      queue.push(parts.join('/'))
    }
    for (const entry of REGISTERED_UI) {
      if (found.has(entry.name) || !new RegExp(`<${entry.name}[\\s/>]|resolveComponent\\('${entry.name}'\\)`).test(source)) continue
      found.add(entry.name)
      queue.push(fileOf(entry.name))
    }
  }
  return found
}

/**
 * Register, by name, the components the named ones render (their parts, and
 * the components those render), and the named ones too when registered; an
 * internal file by its name, a page as `page:<file>`.
 * Resolves with every registered name and its component.
 */
export async function registerComponents(...names: string[]): Promise<Record<string, Component>> {
  const registered = new Set(REGISTERED_UI.map(entry => entry.name))
  const wanted = new Set([...names.filter(name => registered.has(name)), ...rendered(names)])
  const loaded = Object.fromEntries(await Promise.all([...wanted].map(async name => [name, (await loaders[fileOf(name)]!()).default] as const)))
  config.global.components = { ...config.global.components, ...loaded }
  return loaded
}
