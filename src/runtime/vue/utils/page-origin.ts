import { useRequestURL } from '#imports'

/**
 * The page's origin, the same string on the server and in the browser, so
 * an absolute link renders into the server's HTML and hydrates unchanged:
 * Nuxt's `useRequestURL`, which reads the request on the server and
 * `location` in the browser. Call it in `setup`. `''` where neither can be
 * read, which leaves a link its path.
 *
 * The server reads the request's own `Host`, never `x-forwarded-host`,
 * which any client can write: a forwarded host would let a request choose
 * the origin of every link the page renders, and a cache keep it for the
 * next visitor. A proxy in front keeps the host the browser asked for, as
 * the platforms' edges do; one that rewrites it renders links on its own
 * host.
 */
export function usePageOrigin(): string {
  try {
    return useRequestURL().origin
  }
  catch {
    return ''
  }
}
