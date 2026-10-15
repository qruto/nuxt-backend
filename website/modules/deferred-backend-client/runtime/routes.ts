/**
 * Whether a route renders with the backend client from the start: the
 * playground and the module's pages (`runtimeConfig.public.backend.pages`).
 * Docs pages with `demo: true` load it later, from their demo blocks.
 */
export function needsBackendClient(path: string, pages: readonly string[]): boolean {
  return path === '/playground' || path.startsWith('/playground/') || pages.includes(path)
}
