/**
 * Auto-scaffolded backend file templates.
 *
 * Each key is a filename relative to the backend functions directory;
 * the value is the file content that will be written when the file
 * does not yet exist.
 */
export const BACKEND_FILE_TEMPLATES: Record<string, string> = {
  'convex.config.ts': `export { default } from 'nuxt-backend/backend-component'\n`,
  'auth.config.ts': `export { default } from 'nuxt-backend/auth-config'\n`,
  'auth.ts': [
    `import { setupAuth } from 'nuxt-backend/auth'`,
    `import { components } from './_generated/api'`,
    `import { query } from './_generated/server'`,
    ``,
    `export const { authComponent, createAuth, getCurrentUser } = setupAuth(components.backend, query)`,
    ``,
  ].join('\n'),
}
