/**
 * Auto-scaffolded backend file templates.
 *
 * Each key is a filename relative to the backend functions directory;
 * the value is the file content that will be written when the file
 * does not yet exist.
 */
export const BACKEND_FILE_TEMPLATES: Record<string, string> = {
  'convex.config.ts': [
    `import { defineApp } from 'convex/server'`,
    `import backend from 'nuxt-backend/convex/component/convex.config'`,
    ``,
    `const app = defineApp()`,
    `app.use(backend, { httpPrefix: '/api/auth' })`,
    `export default app`,
    ``,
  ].join('\n'),
  'auth.config.ts': `export { default } from 'nuxt-backend/convex/auth.config'\n`,
  'auth.ts': [
    `import { setupAuth } from 'nuxt-backend/convex'`,
    `import { components } from './_generated/api'`,
    `import { query } from './_generated/server'`,
    ``,
    `export const { authComponent, createAuth, getCurrentUser } = setupAuth(components.backend, query)`,
    ``,
  ].join('\n'),
}
