import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'
import { describe, expect, it } from 'vitest'
import { backendTestAliases } from '../../src/runtime/test-utils/aliases'
// The production redirect check, by path: what the login page calls under the aliases too.
import { resolveAuthRedirect } from '../../node_modules/nuxt-convex-module/dist/runtime/better-auth/vue/redirect.js'

// backendTestAliases() swaps modules for every importer in a test project:
// the package's runtime and an app's own code alike. Each stand-in must
// therefore export every name of the module it replaces, and the runtime
// may import nothing from an aliased specifier that its stand-in lacks, in
// whatever form it imports it.

const root = fileURLToPath(new URL('../..', import.meta.url))
const runtime = join(root, 'src/runtime')
const aliases = backendTestAliases()

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : /\.[cm]?ts$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [join(dir, entry.name)] : [])
}

/** The stand-ins and the real modules they replace, by the specifier an importer writes. */
const SWAPPED: Record<string, { stand: string, real: () => Promise<Record<string, unknown>> }> = {
  'nuxt-convex-module/client': { stand: 'client.ts', real: () => import(/* @vite-ignore */ aliases['#backend-test-utils/base-client']!) },
  'nuxt-convex-module/vue': { stand: 'client.ts', real: () => import(/* @vite-ignore */ aliases['#backend-test-utils/base-client']!) },
  '#convex/auth-client': { stand: 'auth-client.ts', real: () => import('../../src/runtime/vue/auth-client') },
}

/** A stand-in's export names: its own, and every name of the module an `export *` passes through. */
function standInExports(file: string, realExports: string[]): Set<string> {
  const names = new Set<string>()
  for (const statement of parseSync(file, readFileSync(file, 'utf8')).module.staticExports) {
    for (const entry of statement.entries) {
      if (String(entry.exportName.kind) === 'None') realExports.forEach(name => names.add(name))
      else if (!entry.isType) names.add(String(entry.exportName.kind) === 'Default' ? 'default' : entry.exportName.name!)
    }
  }
  return names
}

interface Found { specifier: string, needs: string[] | '*' }

/** How `source` imports a swapped specifier: the names it needs, or `'*'` for the whole module. */
function importsOf(file: string, source: string): Found[] {
  const { module } = parseSync(file, source)
  const found: Found[] = []
  for (const statement of module.staticImports) {
    const specifier = statement.moduleRequest.value
    if (!SWAPPED[specifier]) continue
    const values = statement.entries.filter(entry => !entry.isType)
    if (values.some(entry => String(entry.importName.kind) === 'NamespaceObject')) found.push({ specifier, needs: '*' })
    else found.push({ specifier, needs: values.map(entry => (String(entry.importName.kind) === 'Default' ? 'default' : entry.importName.name!)) })
  }
  for (const statement of module.staticExports) {
    for (const entry of statement.entries) {
      const specifier = entry.moduleRequest?.value
      if (!specifier || !SWAPPED[specifier] || entry.isType) continue
      found.push({ specifier, needs: String(entry.importName.kind) === 'Name' ? [entry.importName.name!] : '*' })
    }
  }
  for (const dynamic of module.dynamicImports) {
    const literal = source.slice(dynamic.moduleRequest.start, dynamic.moduleRequest.end).replace(/^['"`]|['"`]$/g, '')
    if (SWAPPED[literal]) found.push({ specifier: literal, needs: '*' })
  }
  return found
}

describe.each(Object.entries(SWAPPED))('the stand-in for %s', (specifier, { stand, real }) => {
  it('exports every name of the module it replaces', async () => {
    const realExports = Object.keys(await real())
    expect(realExports.length).toBeGreaterThan(0)
    const exported = standInExports(join(runtime, 'test-utils', stand), realExports)
    expect(realExports.filter(name => !exported.has(name))).toEqual([])
  })

  it('has every name the runtime imports from it, in any form', async () => {
    const exported = standInExports(join(runtime, 'test-utils', stand), Object.keys(await real()))
    const missing = walk(runtime)
      .filter(file => !relative(runtime, file).startsWith('test-utils'))
      .flatMap(file => importsOf(file, readFileSync(file, 'utf8'))
        .filter(found => found.specifier === specifier && found.needs !== '*')
        .flatMap(found => (found.needs as string[]).filter(name => !exported.has(name)).map(name => `${relative(root, file)}: ${name}`)))
    expect(missing).toEqual([])
  })
})

describe('the import scan', () => {
  it('reads double quotes, default, namespace, re-export and dynamic imports, and skips types', () => {
    const sample = [
      'import { useQuery as q, type Foo } from "nuxt-convex-module/client"',
      'import base from \'nuxt-convex-module/vue\'',
      'import * as all from \'nuxt-convex-module/client\'',
      'import type { Bar } from \'nuxt-convex-module/client\'',
      'export { authClient } from \'#convex/auth-client\'',
      'const lazy = () => import("nuxt-convex-module/vue")',
    ].join('\n')
    expect(importsOf('sample.ts', sample)).toEqual([
      { specifier: 'nuxt-convex-module/client', needs: ['useQuery'] },
      { specifier: 'nuxt-convex-module/vue', needs: ['default'] },
      { specifier: 'nuxt-convex-module/client', needs: '*' },
      { specifier: 'nuxt-convex-module/client', needs: [] },
      { specifier: '#convex/auth-client', needs: ['authClient'] },
      { specifier: 'nuxt-convex-module/vue', needs: '*' },
    ])
  })
})

describe('backendTestAliases', () => {
  it('names the stand-ins and the base module\'s real files, every one existing, forward-slashed', () => {
    expect(Object.keys(aliases).sort()).toEqual([
      '#backend-test-utils/base-client',
      '#backend-test-utils/base-use-better-auth',
      '#convex/auth-client',
      'nuxt-convex-module/client',
      'nuxt-convex-module/vue',
    ])
    for (const target of Object.values(aliases)) {
      expect(target).not.toContain('\\')
      expect(existsSync(target), target).toBe(true)
    }
    expect(aliases['nuxt-convex-module/client']).toMatch(/\/test-utils\/client\.ts$/)
    // The real path, as the base module's own plugins load it: one copy of its keys.
    const base = aliases['#backend-test-utils/base-client']!
    expect(base).toBe(realpathSync(base).split('\\').join('/'))
  })
})

// The stand-ins import the base module under the private names above, which
// only the aliases resolve. An app's type check reads the stand-ins as
// written (the website's reads src/runtime, which dist/runtime links to after
// dev:prepare), so each name is declared in a declaration file inside
// src/runtime, which ships with them, and nowhere else.
describe('the private names the stand-ins import', () => {
  /** Every `declare module` under `dir`, by the file that declares it. */
  function declaredUnder(dir: string): Array<{ name: string, file: string }> {
    return readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.d.ts'))
      .flatMap((entry) => {
        const file = join(entry.parentPath, entry.name)
        return [...readFileSync(file, 'utf8').matchAll(/^declare module '([^']+)'/gm)].map(([, name]) => ({ name: name!, file: relative(root, file) }))
      })
  }

  it('are each declared beside the stand-ins, in a file the runtime ships', () => {
    const imported = new Set(walk(runtime).flatMap((file) => {
      const { module } = parseSync(file, readFileSync(file, 'utf8'))
      return [...module.staticImports.map(statement => statement.moduleRequest.value), ...module.staticExports.flatMap(statement => statement.entries.map(entry => entry.moduleRequest?.value ?? ''))]
    }).filter(specifier => specifier.startsWith('#backend-test-utils/')))
    const privateNames = Object.keys(aliases).filter(name => name.startsWith('#backend-test-utils/')).sort()
    expect([...imported].sort()).toEqual(privateNames)
    const declared = declaredUnder(runtime).filter(entry => entry.name.startsWith('#backend-test-utils/'))
    expect(declared.map(entry => entry.name).sort()).toEqual(privateNames)
    expect(new Set(declared.map(entry => entry.file))).toEqual(new Set(['src/runtime/test-utils/base-modules.d.ts']))
    // Nowhere outside the runtime, where no app's type check would find it.
    expect(declaredUnder(join(root, 'src')).filter(entry => entry.name.startsWith('#backend-test-utils/') && !entry.file.startsWith('src/runtime/'))).toEqual([])
  })

  // A program that reaches a stand-in through imports alone (an app's test
  // importing nuxt-backend/test-utils, which leads to install.ts) and not
  // through a glob of the runtime directory still loads the declarations.
  it('are referenced by every file that imports one', () => {
    const importers = walk(runtime).filter(file => /from '#backend-test-utils\//.test(readFileSync(file, 'utf8')))
    expect(importers.map(file => relative(root, file)).sort()).toEqual(['src/runtime/test-utils/client.ts', 'src/runtime/test-utils/install.ts'])
    for (const file of importers) {
      const { comments, program } = parseSync(file, readFileSync(file, 'utf8'))
      const leading = comments.filter(comment => comment.end <= program.body[0]!.start)
      expect(leading.map(comment => comment.value.trim()), relative(root, file)).toContain('/ <reference path="./base-modules.d.ts" />')
    }
  })
})

describe('the base module internals the mock reaches', () => {
  // Neither is a public API of nuxt-convex-module (~0.11.0): an upstream ask
  // in .github/upstream.json requests a supported seam. Until then these fail,
  // with what moved, on the release that moves them.
  const sessionLayer = aliases['#backend-test-utils/base-use-better-auth']!

  it('still builds its session layer on the #convex/auth-client import the aliases swap', () => {
    expect(existsSync(sessionLayer), 'nuxt-convex-module moved use-better-auth.js: update baseModuleFiles() in src/runtime/test-utils/aliases.ts').toBe(true)
    expect(readFileSync(sessionLayer, 'utf8'), 'the session layer of nuxt-convex-module no longer imports #convex/auth-client: the auth client of the mock would go unused')
      .toMatch(/from ["']#convex\/auth-client["']/)
  })

  it('still exports the reset of the session token it caches', () => {
    // Read, not imported: the file resolves #convex/auth-client only inside a Nuxt app.
    const exported = parseSync(sessionLayer, readFileSync(sessionLayer, 'utf8')).module.staticExports.flatMap(statement => statement.entries.map(entry => entry.exportName.name))
    expect(exported, 'nuxt-convex-module dropped __resetUseBetterAuthForTests: resetBackendMock() could not clear the cached token').toContain('__resetUseBetterAuthForTests')
  })
})

describe('the redirect check the login page uses', () => {
  // The aliases leave the base module's Better Auth entry as it is, so the
  // login page's tests reach this function, not a copy of it.
  it.each([
    '//evil.example/steal',
    '/\\evil.example/steal',
    '/.//evil.example/steal',
    'https://evil.example/steal',
    'javascript:alert(1)',
    'dashboard',
    '',
    undefined,
  ])('never follows %s off the site', (value) => {
    expect(resolveAuthRedirect(value, '/dashboard')).toBe('/dashboard')
  })

  it('keeps a same-site path with its query and hash', () => {
    expect(resolveAuthRedirect('/app/settings?tab=security#passkeys', '/')).toBe('/app/settings?tab=security#passkeys')
  })
})
