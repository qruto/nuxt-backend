import { fileURLToPath } from 'node:url'

// Nuxt 5 fixture for test/module/nuxt5.test.ts: the module under Nuxt 5's
// defaults (`compatibilityVersion: 5`) with the Vite server builder
// (`@nuxt/vite-server`, the experimental one on the Vite Environment API).
// The test is skipped until the blocker it names is gone; the fixture is
// ready for that day. The module is listed by its package name and aliased
// to the source entry, as in the registration fixture.
export default defineNuxtConfig({
  modules: ['@nuxt/vite-server', 'nuxt-backend'],
  devtools: { enabled: false },
  alias: {
    'nuxt-backend': fileURLToPath(new URL('../../../src/module.ts', import.meta.url)),
  },
  future: { compatibilityVersion: 5 },
  compatibilityDate: '2026-10-27',
  telemetry: false,
})
