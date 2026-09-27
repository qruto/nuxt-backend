import type { Nuxt } from '@nuxt/schema'
import { addCustomTab, extendServerRpc, onDevToolsInitialized } from '@nuxt/devtools-kit'
import type { ClientFunctions, DevtoolsServerInfo, ServerFunctions } from './rpc-types'

export interface DevtoolsRegistration {
  tab: { name: string, title: string, icon: string }
  /** Route the panel is served under. */
  route: string
  /** The built panel to serve with sirv; `null` proxies to the panel's dev server. */
  staticDir: string | null
  /** The panel dev server's port (`pnpm dev:devtools-client`). */
  proxyPort: number
  rpc: { namespace: string, functions: ServerFunctions }
}

/** Server-to-panel calls. No-ops until DevTools is initialized. */
export interface DevtoolsHandle {
  broadcast: {
    onInfo(info: DevtoolsServerInfo): void
  }
}

/**
 * Every call into `@nuxt/devtools-kit` lives here: serving the panel, the
 * iframe tab, and the RPC. DevTools 3 is the shipped path (the legacy kit API
 * Nuxt 4 installs). DevTools 4, built on Vite DevTools, replaces these with
 * `onDevtoolsReady(ctx => ctx.views.hostStatic / ctx.docks.register /
 * ctx.rpc.register)` and shims the old calls for now: moving over is a
 * second implementation of this one function.
 */
export function registerDevtools(nuxt: Nuxt, registration: DevtoolsRegistration): DevtoolsHandle {
  const { route, staticDir, proxyPort } = registration

  if (staticDir) {
    nuxt.hook('vite:serverCreated', async (server) => {
      const sirv = (await import('sirv')).default
      server.middlewares.use(route, sirv(staticDir, { dev: true, single: true }))
    })
  }
  else {
    nuxt.hook('vite:extendConfig', (config) => {
      // `server` is typed readonly on the resolved Vite config, but mutating it
      // in this hook is the established pattern (nuxt/fonts does the same).
      const mutable = config as { server?: { proxy?: Record<string, unknown> } }
      mutable.server ||= {}
      mutable.server.proxy ||= {}
      mutable.server.proxy[route] = {
        target: `http://localhost:${proxyPort}${route}`,
        changeOrigin: true,
        followRedirects: true,
        rewrite: (path: string) => path.replace(route, ''),
      }
    })
  }

  let rpc: ReturnType<typeof extendServerRpc<ClientFunctions, ServerFunctions>> | null = null
  onDevToolsInitialized(() => {
    rpc = extendServerRpc<ClientFunctions, ServerFunctions>(registration.rpc.namespace, registration.rpc.functions)
  })

  addCustomTab({
    name: registration.tab.name,
    title: registration.tab.title,
    icon: registration.tab.icon,
    view: { type: 'iframe', src: route },
  })

  return {
    broadcast: {
      onInfo(info) {
        // The panel may not be open; an event needs no answer.
        void rpc?.broadcast.onInfo.asEvent(info)
      },
    },
  }
}
