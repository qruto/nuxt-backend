import type { FunctionReference } from 'convex/server'
import { computed, watchEffect } from 'vue'
import { defineNuxtPlugin, useAppConfig, useRuntimeConfig } from '#app'
import { useConvexNamespace, useQuery } from 'nuxt-convex-module/client'
import { useAuth } from '../vue/composables/use-auth'
import { useBilling, type BillingApi } from '../vue/composables/use-billing'
import { useFeatures } from '../vue/composables/use-features'
import { useOrganization } from '../vue/composables/use-organization'
import type { BackendAppConfigInput } from '../config'
import { createBackendDevtoolsBridge } from './bridge'
import { createOnDemandSections } from './on-demand'
import type {
  BackendDevtoolsBridge,
  BackendDevtoolsBridgeHost,
  DevtoolsBridgeRequests,
  DevtoolsConnectionState,
  DevtoolsWebhookDeliverySnapshot,
} from './types'

/** The scaffolded function modules the composables bind to by name. */
const SCAFFOLDED_NAMESPACES = ['auth', 'billing', 'email'] as const

/** How many recent webhook deliveries the panel lists. */
const DELIVERY_LIMIT = 50

declare global {
  interface Window {
    __NUXT_BACKEND_DEVTOOLS__?: BackendDevtoolsBridge
  }
}

// The delivery feed rides the billing namespace (scaffolded `billing.ts`
// re-exports it) but isn't part of the composable-facing `BillingApi`.
type DevtoolsBillingNamespace = BillingApi & {
  getWebhookDeliveries?: FunctionReference<
    'query',
    'public',
    { limit?: number },
    DevtoolsWebhookDeliverySnapshot[] | null
  >
}

/** The slice of the base module's bridge this plugin reads (version-checked). */
interface ConvexBridgeLike {
  version: number
  getSnapshot(): { connection: ConvexConnectionLike }
  on(event: 'connection', callback: (connection: ConvexConnectionLike) => void): () => void
}

interface ConvexConnectionLike {
  status?: 'idle' | 'active' | 'closed'
  state?: { isWebSocketConnected: boolean }
}

/** The base module's connection snapshot, as one of four states. */
function connectionState(connection: ConvexConnectionLike): DevtoolsConnectionState {
  if (connection.status === 'closed') return 'closed'
  if (connection.status === 'idle') return 'idle'
  return connection.state?.isWebSocketConnected ? 'connected' : 'reconnecting'
}

function readConvexBridge(): ConvexBridgeLike | undefined {
  const bridge = (window as unknown as { __NUXT_CONVEX_DEVTOOLS__?: ConvexBridgeLike }).__NUXT_CONVEX_DEVTOOLS__
  return bridge?.version === 1 ? bridge : undefined
}

// Dev-only (the module registers this plugin only in dev, appended so it runs
// after the plugins that provide the Convex client and auth session). It
// drives the package's own composables inside the app context and mirrors
// their state into a plain-JSON bridge — no client internals touched, so it
// keeps working across base-module upgrades.
export default defineNuxtPlugin({
  name: 'nuxt-backend:devtools',
  setup(nuxtApp) {
    const attach = (): BackendDevtoolsBridgeHost | null => {
      try {
        return nuxtApp.vueApp.runWithContext(() => {
          const requests: Partial<DevtoolsBridgeRequests> = {}
          const bridge = createBackendDevtoolsBridge(requests)
          Object.assign(requests, createOnDemandSections(fn => nuxtApp.vueApp.runWithContext(fn), bridge.patch))

          const auth = useAuth()
          const billing = useBilling()
          const features = useFeatures()
          // With workspaces off (`backend.workspaces: false`) the organization
          // endpoints do not exist — never ask for them.
          const workspacesOn = (useRuntimeConfig().public.backend as { workspaces?: boolean } | undefined)?.workspaces !== false
          const workspace = workspacesOn ? useOrganization() : null
          const appConfig = useAppConfig() as { backend?: BackendAppConfigInput }
          bridge.patch('missingNamespaces', SCAFFOLDED_NAMESPACES.filter(name => useConvexNamespace(name) === undefined))

          // All meters (useCredits narrows to a single one) and the delivery
          // feed come straight from the injected billing namespace — resolved
          // the same way the composables resolve it.
          const namespace = useConvexNamespace<DevtoolsBillingNamespace>('billing')
          const credits = namespace?.getCredits
            ? useQuery(namespace.getCredits)
            : computed(() => undefined)
          const deliveries = namespace?.getWebhookDeliveries
            ? useQuery(namespace.getWebhookDeliveries, { limit: DELIVERY_LIMIT })
            : computed(() => undefined)

          // Every read is optional-chained: a missing namespace or a signed-out
          // session degrades a section, never the plugin.
          watchEffect(() => {
            const user = auth.user.value
            bridge.patch('identity', {
              available: true,
              isLoading: auth.isLoading.value,
              isAuthenticated: auth.isAuthenticated.value,
              email: user?.email,
              name: user?.name,
              id: user?.id,
            })
          })

          watchEffect(() => {
            const subscription = billing.subscription.value
            const productId = subscription?.productId
            const product = productId
              ? Object.values(billing.products.value ?? {}).find(entry => entry?.id === productId)
              : undefined
            bridge.patch('billing', {
              isLoading: billing.isLoading.value,
              status: subscription?.status,
              productId,
              productName: product?.name,
              cancelAtPeriodEnd: billing.cancelAtPeriodEnd.value,
              isPaused: billing.isPaused.value,
              trialEnd: billing.trialEnd.value?.getTime(),
              pendingProductId: billing.pendingUpdate.value?.productId ?? undefined,
              subscriptions: billing.subscriptions.value?.length,
            })
          })

          watchEffect(() => {
            bridge.patch('entitlements', {
              isLoading: features.isLoading.value,
              features: (features.benefits.value ?? []).map(benefit =>
                String(benefit.metadata?.key ?? benefit.type ?? benefit.benefitId)),
              plans: [...(features.plans.value ?? [])],
            })
          })

          watchEffect(() => {
            bridge.patch('credits', (credits.value?.meters ?? []).map(meter => ({
              meterId: meter.meterId,
              name: meter.name,
              balance: meter.balance,
              credited: meter.creditedUnits,
              consumed: meter.consumedUnits,
            })))
          })

          watchEffect(() => {
            const current = workspace?.current.value
            bridge.patch('workspace', workspace && current
              ? {
                  available: true,
                  id: current.id,
                  name: current.name,
                  role: workspace.role.value ?? undefined,
                  workspaces: workspace.organizations.value.length,
                  members: workspace.members.value.length,
                  pendingInvitations: (current.invitations ?? [])
                    .filter(invitation => invitation.status === 'pending').length,
                }
              : { available: false })
          })

          watchEffect(() => {
            bridge.patch('webhooks', (deliveries.value ?? []).map(row => ({
              service: row.service,
              deliveryId: row.deliveryId,
              type: row.type,
              outcome: row.outcome,
              note: row.note,
              receivedAt: row.receivedAt,
            })))
          })

          // The content layer, read from app config so HMR edits show up.
          watchEffect(() => {
            const backend = appConfig.backend
            bridge.patch('config', {
              brand: { name: backend?.brand?.name, logo: backend?.brand?.logo },
              plans: (backend?.billing?.plans ?? []).map(plan => plan.key),
              packs: (backend?.billing?.packs ?? []).map(pack => pack.key),
            })
          })

          return bridge
        })
      }
      catch {
        // No Convex client / auth context yet (e.g. no deployment URL) — the
        // caller retries once after mount; the panel shows guidance meanwhile.
        return null
      }
    }

    // The base module's bridge attaches after ours (its plugin is appended by
    // a module that sets up later) — read it at mount for the connection
    // light instead of assuming order.
    const attachConnection = (bridge: BackendDevtoolsBridgeHost): boolean => {
      const base = readConvexBridge()
      if (!base) return false
      const push = (connection: ConvexConnectionLike) => bridge.patch('connection', connectionState(connection))
      push(base.getSnapshot().connection)
      base.on('connection', push)
      return true
    }

    const publish = (bridge: BackendDevtoolsBridgeHost): void => {
      // The DevTools iframe reads the bridge from the host app: primarily via
      // `client.host.nuxt.$backendDevtools`, with the window global as fallback.
      nuxtApp.provide('backendDevtools', bridge)
      window.__NUXT_BACKEND_DEVTOOLS__ = bridge
      if (!attachConnection(bridge)) {
        nuxtApp.hook('app:mounted', () => {
          attachConnection(bridge)
        })
      }
    }

    const bridge = attach()
    if (bridge) {
      publish(bridge)
      return
    }
    nuxtApp.hook('app:mounted', () => {
      const retried = attach()
      if (retried) publish(retried)
    })
  },
})
