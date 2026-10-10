import { readFile, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import type { Nuxt } from '@nuxt/schema'
import { defineEventHandler, serveStatic, setResponseHeader } from 'h3'

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
 * Serve the built panel (`dist/devtools-client`) at `route` from the dev
 * server. A dev-server handler is mounted at its own route, so the panel is
 * reachable whatever the app's `baseURL`; `serveStatic` turns away any path
 * with a `..` segment before it reaches the file system. Never cached: the
 * panel's asset names can stay the same across versions while their content
 * changes.
 */
export function serveDevtoolsPanel(nuxt: Nuxt, route: string, dir: string): void {
  nuxt.options.devServerHandlers.push({
    route,
    handler: defineEventHandler((event) => {
      setResponseHeader(event, 'cache-control', 'no-store')
      return serveStatic(event, {
        getContents: id => readFile(join(dir, id)),
        getMeta: async (id) => {
          const stats = await stat(join(dir, id)).catch(() => undefined)
          if (stats?.isFile()) return { type: CONTENT_TYPES[extname(id)], size: stats.size, mtime: stats.mtimeMs }
        },
      })
    }),
  })
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
