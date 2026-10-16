/**
 * Whether a route renders with the backend client from the start: the
 * playground and the module's pages (`runtimeConfig.public.backend.pages`).
 * Docs pages with `demo: true` load it later, from their demo blocks.
 *
 * The build asks this of each page's declared path and marks the pages that
 * need the client (`meta.backendClient`, ../index.ts). The browser reads the
 * mark off the matched route rather than comparing paths, so a URL
 * vue-router matches to the same page (`/login/`, `/Login`) loads the client
 * first too.
 */
export function needsBackendClient(path: string, pages: readonly string[]): boolean {
  return path === '/playground' || path.startsWith('/playground/') || pages.includes(path)
}

/** The page meta key the build sets on the routes that need the client. */
export const BACKEND_CLIENT_META = 'backendClient'

/** Whether a resolved route renders a page the build marked. */
export function routeNeedsBackendClient(route: { matched: ReadonlyArray<{ meta: Record<string, unknown> }> }): boolean {
  return route.matched.some(record => record.meta[BACKEND_CLIENT_META] === true)
}
