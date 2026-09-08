import { fileURLToPath } from 'node:url'

// Registration fixture for test/module/registration.test.ts: the module is
// listed by its package name (the way an app lists it) and resolved to the
// source entry through the alias, so `loadNuxt` exercises the same
// name-based module resolution consumers get without a build of this package.
// The `backend/` dir carries the full default scaffold set so an (unexpected)
// scaffold pass would have no file to write — except `convex.json`, which is
// deliberately absent: it is the sentinel the zero-write assertion watches.
export default defineNuxtConfig({
  modules: ['nuxt-backend'],
  alias: {
    'nuxt-backend': fileURLToPath(new URL('../../../src/module.ts', import.meta.url)),
  },
})
