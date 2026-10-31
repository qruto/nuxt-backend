/** Where the lookups live on the site, and the links between them. */
import { code, link } from './markdown.mjs'

/** The lookup pages other lookups link to, by route. */
export const PAGES = {
  envVars: '/docs/reference/configuration/environment-variables',
  labels: '/docs/reference/configuration/labels',
  composables: '/docs/reference/nuxt/composables',
  components: '/docs/reference/components',
  setupHelpers: '/docs/reference/backend',
  httpRoutes: '/docs/reference/backend/http-routes',
  cli: '/docs/reference/cli',
  diagnostics: '/docs/reference/cli/diagnostics',
}

/** A finding id, linked to its Diagnostics entry. */
export const diagnosticsLink = id => link(code(id), `${PAGES.diagnostics}#${id}`)
