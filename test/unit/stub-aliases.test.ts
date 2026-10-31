import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createJiti } from 'jiti'
import { describe, expect, it } from 'vitest'
import { stubAliases } from '../../scripts/lib/stub-aliases.mjs'

// `nuxt-module-build --stub` makes dist/cli.mjs load the sources through
// jiti, aliasing the package name to the repository root. A file the CLI
// imports that names a subpath (the website's billing.catalog.ts imports
// `nuxt-backend/billing`) failed there with "Cannot find module
// …/nuxt-backend/billing". build.config.ts gives jiti an alias per export.

const root = fileURLToPath(new URL('../..', import.meta.url))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { name: string, exports: Record<string, unknown> }
const aliases = stubAliases(pkg, root)

describe('the dev stub\'s aliases', () => {
  it('map every export that is code to a source file that exists', () => {
    const subpaths = Object.keys(pkg.exports).filter(key => key !== './package.json')
    expect(Object.keys(aliases).sort()).toEqual(subpaths.map(key => key === '.' ? pkg.name : `${pkg.name}/${key.slice(2)}`).sort())
    for (const [name, source] of Object.entries(aliases)) expect(existsSync(source), name).toBe(true)
  })

  it('point a subpath at its source, not under the repository root', () => {
    expect(aliases['nuxt-backend/billing']).toBe(join(root, 'src/convex/integrations/billing.ts'))
    expect(aliases['nuxt-backend/app']).toBe(join(root, 'src/convex/app.ts'))
    expect(aliases['nuxt-backend/_generated/component']).toBe(join(root, 'src/convex/components/backend/_generated/component.ts'))
    expect(aliases['nuxt-backend']).toBe(join(root, 'src/module.ts'))
  })

  it('make a file that imports a subpath load, as the CLI does through the stub', async () => {
    const jiti = createJiti(join(root, 'dist/cli.mjs'), { alias: aliases })
    // Without the aliases the package name resolves to the repository root, which has no `billing`.
    const bare = createJiti(join(root, 'dist/cli.mjs'), { alias: { [pkg.name]: root } })
    await expect(bare.import(`${pkg.name}/billing`)).rejects.toThrow()
    expect(jiti.esmResolve(`${pkg.name}/billing`)).toBe(pathToFileURL(join(root, 'src/convex/integrations/billing.ts')).href)
    expect(Object.keys(await jiti.import(`${pkg.name}/app`) as object)).toContain('backendEnv')
    // `auth` and `auth.config` are two exports with one prefix: each keeps its own file.
    expect(jiti.esmResolve(`${pkg.name}/auth.config`)).toBe(pathToFileURL(join(root, 'src/convex/auth.config.ts')).href)
    expect(jiti.esmResolve(`${pkg.name}/auth`)).toBe(pathToFileURL(join(root, 'src/convex/client/index.ts')).href)
  })

  it('are what build.config.ts hands the stub', () => {
    const config = readFileSync(join(root, 'build.config.ts'), 'utf8')
    expect(config).toContain('stubOptions: { jiti: { alias: stubAliases(pkg, rootDir) } }')
  })
})
