import { onDevtoolsClientConnected, useDevtoolsClient } from '@nuxt/devtools-kit/iframe-client'
import type { NuxtDevtoolsHostClient } from '@nuxt/devtools-kit/types'
import { RPC_NAMESPACE } from '../../../src/devtools/rpc-types'
import type { ClientFunctions, DevtoolsServerInfo, ServerFunctions } from '../../../src/devtools/rpc-types'
import { createPanelStore, type PanelRpc, type PanelState } from './store'

// How long to keep polling for the in-page bridge before declaring it absent —
// the app plugin may attach it as late as `app:mounted`.
const BRIDGE_RETRY_INTERVAL = 300
const BRIDGE_RETRY_LIMIT = 10

/** The base module's own DevTools tab: connection, live queries, auth state, logs. */
const CONNECTION_TAB = '/modules/custom-nuxt-convex-module'

/** The MCP toolkit's tab (dev only, present while `backend.mcp` is on). */
const MCP_INSPECTOR_TAB = '/modules/custom-mcp-inspector'

// No colour-mode code here on purpose: DevTools toggles `dark` on this
// same-origin page's <html> itself and follows changes both ways, so a sync
// of the panel's own would fight it.

const store = createPanelStore()
let host: NuxtDevtoolsHostClient | null = null
let initialized = false

function lookupBridge(hostNuxt: unknown): { version?: number } | undefined {
  const fromNuxt = (hostNuxt as { $backendDevtools?: { version?: number } } | undefined)?.$backendDevtools
  if (fromNuxt) return fromNuxt
  // Same-origin fallback: the inspected app's window is the iframe's parent.
  try {
    return (window.parent as unknown as { __NUXT_BACKEND_DEVTOOLS__?: { version?: number } }).__NUXT_BACKEND_DEVTOOLS__
  }
  catch {
    return undefined
  }
}

/** Panel-wide reactive state, connecting to the host app on first use. */
export function usePanelState(): PanelState {
  if (initialized) return store.state
  initialized = true

  // Initializes the kit's internal clientRef — without this, the
  // `window.__NUXT_DEVTOOLS__` getter it installs throws on access.
  useDevtoolsClient()

  onDevtoolsClientConnected((client) => {
    host = client.host
    const rpc = client.devtools.extendClientRpc<ServerFunctions, ClientFunctions>(RPC_NAMESPACE, {
      onInfo: (info: DevtoolsServerInfo) => store.receiveInfo(info),
    })
    store.connect(rpc as unknown as PanelRpc)

    // The RPC rides the Vite HMR WebSocket, which can lag behind the iframe —
    // keep trying until the server answers rather than showing stale defaults.
    const fetchInfo = (attempt = 0) => {
      Promise.race([
        store.refresh(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
      ]).catch(() => {
        if (attempt < 5) setTimeout(() => fetchInfo(attempt + 1), 2000)
      })
    }
    fetchInfo()

    const tryAttach = (): boolean => {
      const bridge = lookupBridge(client.host.nuxt)
      if (bridge) store.attachBridge(bridge)
      return bridge !== undefined
    }
    let attempts = 0
    const poll = () => {
      if (tryAttach()) return
      attempts += 1
      if (attempts < BRIDGE_RETRY_LIMIT) {
        setTimeout(poll, BRIDGE_RETRY_INTERVAL)
        return
      }
      store.bridgeMissing()
      // A cold dev server can mount the app after the panel gave up, and the
      // plugin's last try is on `app:mounted` — look once more then.
      client.host.nuxt.hook('app:mounted', () => {
        tryAttach()
      })
    }
    poll()
  })

  return store.state
}

/** The panel's actions (see `createPanelStore`). */
export function usePanel() {
  return store
}

/**
 * Open a backend source file (e.g. `billing.ts`) in the editor, through the
 * dev server's own open-in-editor endpoint. The name is resolved inside the
 * functions directory first; nothing else can be opened.
 */
export async function openBackendFile(file: string): Promise<void> {
  const filepath = await store.resolveSource(file)
  // fallow-ignore-next-line security-sink -- a same-origin path on the panel's own dev server; the file is resolved server-side inside the functions directory; verified 2026-09-27
  if (filepath) await fetch(`/__open-in-editor?file=${encodeURIComponent(filepath)}`)
}

/** Switch DevTools to the base module's tab: connection, live queries, auth state, logs. */
export function openConnectionTab(): void {
  host?.devtools.navigate(CONNECTION_TAB)
}

/** Switch DevTools to the MCP Inspector, which drives the agent endpoint by hand. */
export function openMcpInspector(): void {
  host?.devtools.navigate(MCP_INSPECTOR_TAB)
}

/** Copy text (fix-hint commands, URLs) to the clipboard; quiet on denial. */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  }
  catch {
    // Clipboard access can be denied inside the iframe — nothing to recover.
  }
}
