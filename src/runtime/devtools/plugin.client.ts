import type { FunctionReference } from 'convex/server'
import { type App, computed, effectScope, watchEffect } from 'vue'
import { defineNuxtPlugin, useAppConfig } from '#app'
import { useConvex, useQuery } from 'nuxt-convex-module/client'
import { featureKeyOf } from '../../convex/catalog.js'
import { useAuthSession } from '../vue/utils/auth-session'
import { useBilling, type BillingApi } from '../vue/composables/use-billing'
import { useFeatures } from '../vue/composables/use-features'
import { useWorkspace } from '../vue/composables/use-workspace'
import type { BackendAppConfigInput } from '../config'
import { useApiNamespace } from '../vue/utils/namespace'
import { failureOf } from '../vue/utils/backend-error'
import { createBackendDevtoolsBridge } from './bridge'
import { createOnDemandSections } from './on-demand'
import { patchWebhookFeed } from './webhook-feed'
import type {
  BackendDevtoolsBridge,
  BackendDevtoolsBridgeHost,
  DevtoolsBridgeRequests,
  DevtoolsConnectionState,
  DevtoolsWebhookDeliverySnapshot,
} from './types'

/** The scaffolded function modules the composables bind to by name. */
const SCAFFOLDED_NAMESPACES = ['auth', 'billing', 'email', 'webhooks'] as const

/** How many recent webhook deliveries the panel lists. */
const DELIVERY_LIMIT = 50

declare global {
  interface Window {
    __NUXT_BACKEND_DEVTOOLS__?: BackendDevtoolsBridge
  }
}

// The delivery feed and its replay ride the webhooks namespace (the
// scaffolded `webhooks.ts` re-exports them). Admin-only: the feed is `null`
// for anyone else, and a replay is refused.
interface DevtoolsWebhooksNamespace {
  getWebhookDeliveries?: FunctionReference<
    'query',
    'public',
    { limit?: number },
    DevtoolsWebhookDeliverySnapshot[] | null
  >
  replayWebhookDelivery?: FunctionReference<'action', 'public', { service: 'billing' | 'email', deliveryId: string }, { replayedAt: number }>
}

/** The slice of the base module's bridge this plugin reads (version-checked). */
interface ConvexBridgeLike {
  version: number
  getSnapshot(): { connection: ConvexConnectionLike }
  on(event: 'connection', callback: (connection: ConvexConnectionLike) => void): () => void
}

interface ConvexConnectionLike {
  status?: 'idle' | 'active' | 'closed'
  state?: { isWebSocketConnected: boolean, hasEverConnected?: boolean, connectionRetries?: number }
}

/**
 * The base module's connection snapshot, as one of four states. A socket that
 * is down is not always trouble: before the first connect the page is still
 * starting (idle), and after one Convex counts a failed attempt before it
 * reports any drop, so a socket that is down with none is being restarted on
 * purpose, as Convex does to swap in a refreshed auth token.
 */
function connectionState(connection: ConvexConnectionLike): DevtoolsConnectionState {
  if (connection.status === 'closed') return 'closed'
  if (connection.status === 'idle') return 'idle'
  const state = connection.state
  if (state?.isWebSocketConnected) return 'connected'
  if (state?.hasEverConnected === false) return 'idle'
  return state?.connectionRetries === 0 ? 'connected' : 'reconnecting'
}

function readConvexBridge(): ConvexBridgeLike | undefined {
  const bridge = (window as unknown as { __NUXT_CONVEX_DEVTOOLS__?: ConvexBridgeLike }).__NUXT_CONVEX_DEVTOOLS__
  return bridge?.version === 1 ? bridge : undefined
}

/** The Vue DevTools timeline layer the activity log is mirrored into. */
const TIMELINE_LAYER = 'nuxt-backend'

/**
 * Mirror every activity entry into a `Backend` layer of the Vue DevTools
 * timeline, beside route changes and component events. Loaded on demand and
 * best-effort: without a Vue DevTools the import is all it costs.
 */
async function mirrorToVueDevtools(app: App, bridge: BackendDevtoolsBridgeHost): Promise<void> {
  const { setupDevtoolsPlugin } = await import('@vue/devtools-api')
  setupDevtoolsPlugin({
    id: 'nuxt-backend',
    label: 'nuxt-backend',
    packageName: 'nuxt-backend',
    homepage: 'https://nuxt-backend.dev',
    app,
  }, (api) => {
    api.addTimelineLayer({ id: TIMELINE_LAYER, label: 'Backend', color: 0x22C55E })
    bridge.onActivity((event) => {
      api.addTimelineEvent({
        layerId: TIMELINE_LAYER,
        event: {
          time: api.now(),
          title: event.title,
          subtitle: event.detail,
          data: { kind: event.kind, ...(event.detail ? { detail: event.detail } : {}) },
          logType: event.level === 'error' ? 'error' : event.level === 'warn' ? 'warning' : 'default',
        },
      })
    })
  })
}

// Dev-only (the module registers this plugin only in dev, appended so it runs
// after the plugins that provide the Convex client and auth session). It
// drives the package's own composables inside the app context and mirrors
// their state into a plain-JSON bridge — no client internals touched, so it
// keeps working across base-module upgrades.
//
// What the app already holds (the session, the content config) is mirrored
// from page load. Sections that need queries of their own start on the
// panel's first `activate()`, so a page nobody inspects pays nothing for them.
export default defineNuxtPlugin({
  name: 'nuxt-backend:devtools',
  setup(nuxtApp) {
    const attach = (): BackendDevtoolsBridgeHost | null => {
      try {
        return nuxtApp.vueApp.runWithContext(() => {
          const requests: Partial<DevtoolsBridgeRequests> = {}
          const bridge = createBackendDevtoolsBridge(requests)
          const runInApp = <T>(fn: () => T): T => nuxtApp.vueApp.runWithContext(fn)
          Object.assign(requests, createOnDemandSections(runInApp, bridge.patch))
          requests.replayWebhook = (service, deliveryId) => runInApp(() => replayWebhook(bridge.patch, service, deliveryId))

          const auth = useAuthSession()
          const appConfig = useAppConfig() as { backend?: BackendAppConfigInput }
          bridge.patch('missingNamespaces', SCAFFOLDED_NAMESPACES.filter(name => useApiNamespace(name) === undefined))

          // Every read is optional-chained: a missing namespace or a signed-out
          // session degrades a section, never the plugin.
          watchEffect(() => {
            const user = auth.user.value
            bridge.patch('identity', {
              available: true,
              // Signed in a moment before the user record arrives: still
              // loading, so the Account tab and the activity log name who.
              isLoading: auth.isLoading.value || (auth.isAuthenticated.value && !user),
              isAuthenticated: auth.isAuthenticated.value,
              email: user?.email,
              name: user?.name,
              id: user?.id,
            })
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

          // Detached: these live as long as the page, not as long as the call.
          const scope = effectScope(true)
          requests.activate = () => runInApp(() => scope.run(() => watchActiveSections(bridge.patch)))

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
      void mirrorToVueDevtools(nuxtApp.vueApp, bridge).catch(() => {
        // No Vue DevTools API to talk to — the panel's Activity tab still has it all.
      })
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

/**
 * The sections that need queries of their own: the subscription, the
 * entitlements, every credit meter, the active workspace and the webhook
 * delivery feed. Called once, when the panel first opens, inside the app
 * context and a detached effect scope.
 */
function watchActiveSections(patch: BackendDevtoolsBridgeHost['patch']): void {
  const billing = useBilling()
  const features = useFeatures()
  const workspace = useWorkspace()

  // All meters (useCredits narrows to a single one) come straight from the
  // injected billing namespace, and the delivery feed from the webhooks one —
  // resolved the same way the composables resolve them.
  const namespace = useApiNamespace<BillingApi>('billing')
  const credits = namespace?.getCredits
    ? useQuery(namespace.getCredits)
    : computed(() => undefined)
  const webhooks = useApiNamespace<DevtoolsWebhooksNamespace>('webhooks')
  const deliveries = webhooks?.getWebhookDeliveries
    ? useQuery(webhooks.getWebhookDeliveries, { limit: DELIVERY_LIMIT })
    : undefined

  watchEffect(() => {
    const subscription = billing.subscription.value
    const productId = subscription?.productId
    const product = productId
      ? Object.values(billing.products.value ?? {}).find(entry => entry?.id === productId)
      : undefined
    patch('billing', {
      isLoading: billing.isLoading.value,
      status: subscription?.status,
      productId,
      productName: product?.name,
      cancelAtPeriodEnd: billing.cancelAtPeriodEnd.value,
      isPaused: billing.isPaused.value,
      trialEnd: billing.trialEnd.value?.getTime(),
      pendingProductId: billing.pendingChange.value?.productId,
      subscriptions: billing.subscriptions.value?.length,
    })
  })

  watchEffect(() => {
    patch('entitlements', {
      isLoading: features.isLoading.value,
      features: (features.benefits.value ?? []).map(benefit => featureKeyOf(benefit)),
      plans: [...(features.plans.value ?? [])],
      quotas: Object.entries(features.quotas.value ?? {}).map(([key, { limit, used, description }]) => ({ key, limit, used, ...(description === undefined ? {} : { description }) })),
    })
  })

  watchEffect(() => {
    patch('credits', (credits.value?.meters ?? []).map(meter => ({
      meterId: meter.meterId,
      name: meter.name,
      balance: meter.balance,
      credited: meter.creditedUnits,
      consumed: meter.consumedUnits,
    })))
  })

  watchEffect(() => {
    const current = workspace.current.value
    patch('workspace', current
      ? {
          available: true,
          id: current.id,
          name: current.name,
          role: workspace.role.value ?? undefined,
          workspaces: workspace.workspaces.value.length,
          members: workspace.members.value.length,
          pendingInvitations: (current.invitations ?? [])
            .filter(invitation => invitation.status === 'pending').length,
        }
      : { available: false })
  })

  if (!deliveries) {
    patch('webhookFeed', 'unavailable')
    return
  }
  watchEffect(() => {
    // Only once the feed has answered: its first value is the baseline the
    // activity log compares later deliveries against.
    const rows = deliveries.value
    if (rows !== undefined) patchWebhookFeed(patch, rows)
  })
}

/**
 * Ask a delivery's provider to send it again, as the signed-in
 * administrator, from the panel's Replay button. The outcome lands in the
 * snapshot's `webhookReplay`, a refusal in its English sentence: a replay
 * takes a recent sign-in, which the admin console's Webhooks tab can ask
 * for and the panel cannot.
 */
function replayWebhook(patch: BackendDevtoolsBridgeHost['patch'], service: string, deliveryId: string): void {
  const replay = useApiNamespace<DevtoolsWebhooksNamespace>('webhooks')?.replayWebhookDelivery
  const settle = (state: 'pending' | 'done' | 'error', message?: string) => patch('webhookReplay', { service, deliveryId, state, ...(message ? { message } : {}) })
  if (!replay || (service !== 'billing' && service !== 'email')) {
    settle('error', 'backend/webhooks.ts does not export replayWebhookDelivery.')
    return
  }
  const convex = useConvex()
  settle('pending')
  convex.action(replay, { service, deliveryId }).then(
    () => settle('done'),
    (cause: unknown) => settle('error', failureOf(cause).message),
  )
}
