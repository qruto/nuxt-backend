import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { dependencyRange, packageVersion } from '../../src/dirs'

// What the module declares about itself comes from its own manifest:
// `meta.version`, and the version ranges `moduleDependencies` holds the
// modules it installs to.
describe('the package manifest', () => {
  const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string, dependencies: Record<string, string> }

  it('gives the module its version and its dependency ranges', () => {
    expect(packageVersion()).toBe(manifest.version)
    expect(dependencyRange('nuxt-convex-module')).toBe(manifest.dependencies['nuxt-convex-module'])
  })

  it('refuses a dependency the package does not declare', () => {
    expect(() => dependencyRange('left-pad')).toThrow('nuxt-backend does not depend on left-pad')
  })
})
