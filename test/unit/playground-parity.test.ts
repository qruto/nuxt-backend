import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { drift, OWNED, SOURCE, TARGET } from '../../scripts/sync-playground.mjs'

// examples/playground is the website's playground as a standalone app. The
// sync script copies what it can byte for byte; these tests pin the rest: the
// routes, the nav, the links out, the catalog and the dependencies.

const rootDir = fileURLToPath(new URL('../..', import.meta.url))
const read = (path: string) => readFileSync(join(rootDir, path), 'utf8')

/** Every file under `dir`, as posix paths relative to it. */
function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.name === 'node_modules' || entry.name.startsWith('.nuxt')) return []
      const path = join(dir, entry.name)
      return entry.isDirectory() ? listFiles(path).map(file => `${entry.name}/${file}`) : [entry.name]
    })
    .sort()
}

/** A page file → the route it serves (`playground/client/queries.vue` → `/playground/client/queries`). */
const routeOf = (page: string) => `/${page.replace(/\.vue$/, '').replace(/(?:^|\/)index$/, '')}`

/**
 * The `backend` block of an app.config.ts, evaluated. Read as text: importing
 * the example's file would load its tsconfig, which needs a `.nuxt` folder.
 */
function backendBlock(path: string): unknown {
  const text = read(path)
  const open = text.indexOf('{', text.indexOf('\n  backend: {'))
  let depth = 0
  let close = open
  for (; close < text.length; close++) {
    if (text[close] === '{') depth++
    else if (text[close] === '}' && --depth === 0) break
  }
  const literal = text.slice(open, close + 1).replace(/^\s*\/\/.*$/gm, '')
  return new Function(`return (${literal})`)()
}

const examplePages = listFiles(join(TARGET, 'pages'))
const exampleRoutes = new Set(examplePages.map(routeOf))
const exampleVue = listFiles(TARGET).filter(file => file.endsWith('.vue'))

describe('the sync', () => {
  it('leaves nothing missing, changed or stale', () => {
    expect(drift()).toEqual({ missing: [], changed: [], stale: [] })
  })

  it('has every owned file in place', () => {
    for (const file of OWNED) expect(existsSync(join(TARGET, file)), file).toBe(true)
  })

  it('points at the website and the example', () => {
    expect(relative(rootDir, SOURCE)).toBe('website')
    expect(relative(rootDir, TARGET)).toBe(join('examples', 'playground'))
  })
})

describe('routes', () => {
  it('serves every playground page the website serves, and no other', () => {
    expect(listFiles(join(TARGET, 'pages/playground'))).toEqual(listFiles(join(SOURCE, 'pages/playground')))
  })

  it('has its own login page', () => {
    expect(examplePages).toContain('login.vue')
  })

  it('lists every playground page in the nav, and every nav entry has a page', () => {
    const layout = read('examples/playground/layouts/playground.vue')
    const nav = new Set([...layout.matchAll(/\bto: '([^']+)'/g)].map(([, to]) => to!))
    expect(nav.size).toBeGreaterThan(30)
    for (const to of nav) expect(exampleRoutes.has(to), `nav entry ${to} has no page`).toBe(true)
    const pages = [...exampleRoutes].filter(route => route.startsWith('/playground') && route !== '/playground/offline')
    for (const route of pages) expect(nav.has(route), `${route} is not in the nav`).toBe(true)
  })

  it('sends every other link to a page here or to the docs site', () => {
    const config = read('examples/playground/nuxt.config.ts')
    const sections = [...config.match(/const DOCS_SECTIONS = \[([^\]]+)\]/)![1]!.matchAll(/'([^']+)'/g)].map(([, section]) => section!)
    expect(sections.length).toBeGreaterThan(3)
    const unresolved: string[] = []
    for (const file of exampleVue) {
      const text = readFileSync(join(TARGET, file), 'utf8')
      for (const [, target] of text.matchAll(/(?:\bto|\bhref)="(\/[^"#?]*)|navigateTo\('(\/[^'#?]*)/g)) {
        if (!target) continue
        const path = target.replace(/\/$/, '') || '/'
        const docs = sections.some(section => path === `/${section}` || path.startsWith(`/${section}/`))
        if (!docs && !exampleRoutes.has(path) && path !== '/') unresolved.push(`${file}: ${target}`)
      }
    }
    expect(unresolved).toEqual([])
  })
})

describe('components', () => {
  it('has a stand-in for every Nuxt UI component it uses', () => {
    // The example has no Nuxt UI: a `<UThing>` the website's playground starts
    // using needs components/UThing.vue here.
    const missing = exampleVue.flatMap((file) => {
      const text = readFileSync(join(TARGET, file), 'utf8')
      return [...text.matchAll(/<(U[A-Z][A-Za-z0-9]+)[\s/>]/g)]
        .map(([, tag]) => tag!)
        .filter(tag => !existsSync(join(TARGET, 'components', `${tag}.vue`)))
        .map(tag => `${file}: <${tag}>`)
    })
    expect(missing).toEqual([])
  })
})

describe('configuration', () => {
  it('renders the same catalog as the site', () => {
    expect(backendBlock('examples/playground/app.config.ts')).toEqual(backendBlock('website/app.config.ts'))
  })

  it('declares every package the synced code imports, at the package\'s own ranges', () => {
    const example = JSON.parse(read('examples/playground/package.json')) as { dependencies: Record<string, string> }
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> }
    const imported = new Set<string>()
    for (const file of listFiles(TARGET).filter(file => /\.(?:vue|ts)$/.test(file) && !file.includes('_generated/'))) {
      for (const [, specifier] of readFileSync(join(TARGET, file), 'utf8').matchAll(/\bfrom '((?:@[^/']+\/)?[^./#~'][^/']*)/g)) {
        imported.add(specifier!)
      }
    }
    for (const name of ['nuxt-backend', 'convex', 'vue']) expect(imported, name).toContain(name)
    for (const name of imported) {
      expect(example.dependencies, `${name} is imported but not declared`).toHaveProperty(name)
      // A range of its own would install a second copy beside the package's.
      if (name in pkg.dependencies) expect(example.dependencies[name], name).toBe(pkg.dependencies[name])
    }
  })

  it('carries the starter\'s pnpm hook', () => {
    expect(read('examples/playground/.pnpmfile.mjs')).toBe(read('templates/starter/.pnpmfile.mjs'))
  })

  it('commits its codegen, like the site', () => {
    const ignored = read('examples/playground/.gitignore').split('\n')
    expect(ignored).not.toContain('backend/_generated')
    expect(statSync(join(TARGET, 'backend/_generated/api.d.ts')).isFile()).toBe(true)
  })
})
