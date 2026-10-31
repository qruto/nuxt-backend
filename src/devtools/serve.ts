import { readFile, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import type { Nuxt } from '@nuxt/schema'
import { addDevServerHandler, runWithNuxtContext } from '@nuxt/kit'

/** The panel is one page plus its scripts, styles, icon and fonts. */
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
}

/**
 * Serve one file of the built panel mounted at `route` from `root`. The
 * request's URL is the full one on every server builder, so the route is
 * cut off here. Never cached: the panel's asset names can stay the same
 * across versions while their content changes.
 *
 * Exported for tests.
 * @internal
 */
export async function servePanel(request: Request, route: string, root: string): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } })
  }
  let path: string
  try {
    path = decodeURIComponent(new URL(request.url).pathname)
  }
  catch {
    return new Response(null, { status: 400 })
  }
  if (path.startsWith(route)) path = path.slice(route.length)
  const file = resolve(root, `.${path === '' || path === '/' ? '/index.html' : path}`)
  // A `..` segment or an absolute path never reaches past the panel's folder.
  const stats = file.startsWith(root + sep) ? await stat(file).catch(() => undefined) : undefined
  if (!stats?.isFile()) return new Response(null, { status: 404 })
  return new Response(request.method === 'HEAD' ? null : await readFile(file), {
    headers: {
      'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
      'content-length': String(stats.size),
      'cache-control': 'no-store',
    },
  })
}

/**
 * Serve the built panel (`dist/devtools-client`) at `route` from the dev
 * server, through a portable (`nuxt/server`) dev-server handler. Mounted at
 * its own route, so the panel is reachable whatever the app's `baseURL`.
 */
export function serveDevtoolsPanel(nuxt: Nuxt, route: string, dir: string): void {
  const root = resolve(dir)
  // On the `nuxt` this receives: the module imports this file after an await.
  runWithNuxtContext(nuxt, () => addDevServerHandler({
    route: `${route}/**`,
    handler: { nuxt: event => servePanel(event.req, route, root) },
  }))
}

/**
 * While developing this module there is no built panel next to the stub:
 * proxy `route` to the panel's own dev server (`pnpm dev:devtools-client`) instead.
 */
export function proxyDevtoolsPanel(nuxt: Nuxt, route: string, port: number): void {
  nuxt.hook('vite:extendConfig', (config) => {
    // `server` is typed readonly on the resolved Vite config, but mutating it
    // in this hook is the established pattern (nuxt/fonts does the same).
    const mutable = config as { server?: { proxy?: Record<string, unknown> } }
    mutable.server ||= {}
    mutable.server.proxy ||= {}
    mutable.server.proxy[route] = {
      target: `http://localhost:${port}${route}`,
      changeOrigin: true,
      followRedirects: true,
      rewrite: (path: string) => path.replace(route, ''),
    }
  })
}
