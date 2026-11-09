import { useRequestURL } from '#imports'

/**
 * How the server reads the page's address: the host a proxy forwarded
 * (`x-forwarded-host`), as it does the scheme, so a server behind one
 * (a platform's edge, a dev proxy on https) reads the origin the browser
 * shows.
 */
const PAGE_ORIGIN_READ = { xForwardedHost: true } as const

/**
 * The page's origin, the same string on the server and in the browser, so
 * an absolute link renders into the server's HTML and hydrates unchanged:
 * Nuxt's `useRequestURL`, which reads the request on the server and
 * `location` in the browser. Call it in `setup`. `''` where neither can be
 * read, which leaves a link its path.
 */
export function usePageOrigin(): string {
  try {
    return useRequestURL(PAGE_ORIGIN_READ).origin
  }
  catch {
    return ''
  }
}
