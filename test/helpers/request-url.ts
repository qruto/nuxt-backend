import { getRequestURL, type H3Event } from 'h3'

// Nuxt's `useRequestURL` for a test that renders as the server and as the
// browser in turn: Nuxt's own reads the request on the server
// (`getRequestURL(event, opts)`) and `location` in the browser. A test
// mocks it with `requestURL` (`mockNuxtImport('useRequestURL', original =>
// opts => requestURL(original, opts))`) and sets `serverRequest.current`
// for a server render.

/** The request a server render reads, as it reaches the server; `null` renders as the browser. */
export const serverRequest: { current: { path: string, headers: Record<string, string> } | null } = { current: null }

/** `useRequestURL` as Nuxt runs it: the request's URL on a server render, else the browser's own. */
export function requestURL(browser: (opts?: Parameters<typeof getRequestURL>[1]) => URL, opts?: Parameters<typeof getRequestURL>[1]): URL {
  const request = serverRequest.current
  if (!request) return browser(opts)
  // The parts of an h3 event `getRequestURL` reads.
  const event = { path: request.path, node: { req: { url: request.path, headers: request.headers, connection: {} } } } as unknown as H3Event
  return getRequestURL(event, opts)
}
