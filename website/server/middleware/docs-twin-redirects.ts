import { defineEventHandler, sendRedirect } from 'h3'
import { docsTwinRedirects } from '../../shared/docs-routes'

// Both Markdown twins of every route the docs moved, aliased or shortened
// (`<from>.md`, `/raw<from>.md`), one hop to the target's twin. A route rule
// would do the same on the server, but Nuxt hands every route rule to the
// browser too, and these, twice the HTML redirects, are what only an agent
// fetches: the browser never navigates to a twin.

const redirects = docsTwinRedirects()

export default defineEventHandler((event) => {
  const path = event.path.split('?')[0]!
  if (!path.endsWith('.md')) return
  const redirect = redirects[path]
  if (redirect) return sendRedirect(event, redirect.to, redirect.statusCode)
})
