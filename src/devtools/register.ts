import type { Nuxt } from '@nuxt/schema'
import type { ModuleCustomTab, NuxtDevtoolsServerContext } from '@nuxt/devtools-kit/types'
import type { ClientFunctions, DevtoolsServerInfo, ServerFunctions } from './rpc-types'
import { proxyDevtoolsPanel, serveDevtoolsPanel } from './serve'

export interface DevtoolsRegistration {
  tab: { name: string, title: string, icon: string }
  /** Route the panel is served under. */
  route: string
  /** The built panel to serve; `null` proxies to the panel's dev server. */
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
 * Wire the panel into Nuxt DevTools: serve it, register its tab, extend the
 * server RPC.
 *
 * It talks to DevTools through the hooks `@nuxt/devtools` itself calls — the
 * same ones `@nuxt/devtools-kit`'s `addCustomTab` and `extendServerRpc`
 * register — so the kit is a type-only dependency and never ships to
 * production installs. DevTools 3 is what Nuxt 4 installs; DevTools 4 (beta)
 * still calls both hooks, as its compatibility layer for tabs registered this
 * way.
 */
export function registerDevtools(nuxt: Nuxt, registration: DevtoolsRegistration): DevtoolsHandle {
  const { route, staticDir, proxyPort } = registration
  if (staticDir) serveDevtoolsPanel(nuxt, route, staticDir)
  else proxyDevtoolsPanel(nuxt, route, proxyPort)

  // What `extendServerRpc` hands back that this module uses: the push to open panels.
  let rpc: { broadcast: { onInfo: { asEvent(info: DevtoolsServerInfo): unknown } } } | null = null
  // DevTools sets `nuxt.devtools` before it calls this hook.
  nuxt.hook('devtools:initialized', () => {
    const devtools = (nuxt as Nuxt & { devtools?: NuxtDevtoolsServerContext }).devtools
    rpc = devtools?.extendServerRpc<ClientFunctions, ServerFunctions>(registration.rpc.namespace, registration.rpc.functions) ?? null
  })

  nuxt.hook('devtools:customTabs', (tabs: ModuleCustomTab[]) => {
    tabs.push({
      name: registration.tab.name,
      title: registration.tab.title,
      icon: registration.tab.icon,
      // Beside the server tabs (routes, tasks, storage) rather than in the
      // Modules group, which DevTools folds behind its overflow menu.
      category: 'server',
      view: { type: 'iframe', src: route },
    })
  })

  return {
    broadcast: {
      onInfo(info) {
        // The panel may not be open, and an event needs no answer.
        void rpc?.broadcast.onInfo.asEvent(info)
      },
    },
  }
}
