import type { FunctionReference } from 'convex/server'
import { computed, watchEffect } from 'vue'
import { defineNuxtPlugin } from '#app'
import { useConvexNamespace, useQuery } from 'nuxt-convex-module/client'
import { useAuth } from '../vue/composables/use-auth'
import { useBilling, type BillingApi } from '../vue/composables/use-billing'
import { useFeatures } from '../vue/composables/use-features'
import { useOrganization } from '../vue/composables/use-organization'
import { createBackendDevtoolsBridge } from './bridge'
import type {
  BackendDevtoolsBridge,
  BackendDevtoolsBridgeHost,
  DevtoolsWebhookDeliverySnapshot,
} from './types'

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
  state?: { isWebSocketConnected: boolean }
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
          const bridge = createBackendDevtoolsBridge()

          const auth = useAuth()
          const billing = useBilling()
          const features = useFeatures()
          const workspace = useOrganization()

          // All meters (useCredits narrows to a single one) and the delivery
          // feed come straight from the injected billing namespace — resolved
          // the same way the composables resolve it.
          const namespace = useConvexNamespace<DevtoolsBillingNamespace>('billing')
          const credits = namespace?.getCredits
            ? useQuery(namespace.getCredits)
            : computed(() => undefined)
          const deliveries = namespace?.getWebhookDeliveries
            ? useQuery(namespace.getWebhookDeliveries, { limit: 25 })
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
            bridge.patch('billing', {
              isLoading: billing.isLoading.value,
              status: subscription?.status,
              productId: subscription?.productId,
              plans: features.plans.value ? [...features.plans.value] : undefined,
            })
          })

          watchEffect(() => {
            bridge.patch('features', {
              isLoading: features.isLoading.value,
              keys: (features.benefits.value ?? []).map(benefit =>
                String(benefit.metadata?.key ?? benefit.type ?? benefit.benefitId)),
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
            const current = workspace.current.value
            bridge.patch('workspace', current
              ? {
                  available: true,
                  id: current.id,
                  name: current.name,
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
    // a module that sets up later) — poll it at mount for the "Convex
    // connected" chip instead of assuming order.
    const attachConvexChip = (bridge: BackendDevtoolsBridgeHost): boolean => {
      const convex = readConvexBridge()
      if (!convex) return false
      const push = (connection: ConvexConnectionLike) =>
        bridge.patch('convexConnected', connection.state?.isWebSocketConnected === true)
      push(convex.getSnapshot().connection)
      convex.on('connection', push)
      return true
    }

    const publish = (bridge: BackendDevtoolsBridgeHost): void => {
      // The DevTools iframe reads the bridge from the host app: primarily via
      // `client.host.nuxt.$backendDevtools`, with the window global as fallback.
      nuxtApp.provide('backendDevtools', bridge)
      window.__NUXT_BACKEND_DEVTOOLS__ = bridge
      if (!attachConvexChip(bridge)) {
        nuxtApp.hook('app:mounted', () => {
          attachConvexChip(bridge)
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
