import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getBackendAliases } from '../../src/module'

// resolveFunctionsDir falls back to `backend/` when neither a convex.json nor a
// backend/ or convex/ directory exists, so an empty root keeps this test pure.
const rootDir = '/tmp/nuxt-backend-alias-fixture'
const generatedDir = join(rootDir, 'backend', '_generated')

describe('backend import aliases', () => {
  it('maps the Convex generated modules to their _generated files', () => {
    const aliases = getBackendAliases(rootDir)

    expect(aliases).toEqual({
      '#backend/api': join(generatedDir, 'api'),
      '#backend/server': join(generatedDir, 'server'),
      '#backend/dataModel': join(generatedDir, 'dataModel'),
      '#backend/_generated': generatedDir,
      '#backend': join(rootDir, 'backend'),
    })
  })

  it('orders specific aliases before the catch-all #backend', () => {
    // @rollup/plugin-alias (Vite + Nitro) is first-match-wins and treats
    // `#backend` as a prefix of `#backend/api`, so the specific generated-module
    // aliases must precede `#backend` or they would never win.
    const keys = Object.keys(getBackendAliases(rootDir))
    const catchAll = keys.indexOf('#backend')

    expect(catchAll).toBe(keys.length - 1)
    for (const specific of ['#backend/api', '#backend/server', '#backend/dataModel', '#backend/_generated']) {
      expect(keys.indexOf(specific)).toBeLessThan(catchAll)
    }
  })
})
