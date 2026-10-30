import { fileURLToPath } from 'node:url'
import { loadNuxt } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Nuxt 5: the module on `compatibilityVersion: 5` and the Vite server builder
// (test/fixtures/nuxt5). Skipped, with the blocker named: the module declares
// `compatibility: { nuxt: '^4.6.2' }` because nuxt-security 2.6, which it
// installs for the security headers and the Convex-aware CSP, imports h3 1,
// while Nuxt 5's server runs on h3 2 (Nitro v3). Unskip once nuxt-security
// ships an h3 2 release, widen the compatibility range, and let these run.
const BLOCKER = 'nuxt-security 2.6 imports h3 1, and Nuxt 5 runs on h3 2'

describe.skip(`the module on Nuxt 5 (blocked: ${BLOCKER})`, () => {
  let nuxt: Nuxt

  beforeAll(async () => {
    nuxt = await loadNuxt({ cwd: fileURLToPath(new URL('../fixtures/nuxt5', import.meta.url)), dev: false, ready: true, overrides: { telemetry: false } })
  })

  afterAll(async () => {
    await nuxt?.close()
  })

  it('installs, with nuxt-security and the base module, instead of being disabled as incompatible', () => {
    const names = nuxt.options._installedModules.map(entry => entry.meta.name)
    expect(names).toEqual(expect.arrayContaining(['nuxt-backend', 'nuxt-convex-module', 'nuxt-security']))
  })

  it('registers its pages and its auth proxy on the Vite server builder', () => {
    const backend = nuxt.options.runtimeConfig.public.backend
    expect(backend.pages.login).toBe('/login')
    expect(backend.authRoute).toBe('/api/auth')
  })
})
