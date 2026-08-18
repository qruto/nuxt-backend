// The contract between the dev-only devtools plugin running inside the
// inspected app and the Nuxt DevTools iframe panel. Everything crossing the
// frame boundary is plain JSON data — Vue reactivity does not cross frames,
// so the panel keeps its own state and refreshes it from these snapshots.

/** Who is signed in, per `useAuth()`. */
export interface DevtoolsIdentitySnapshot {
  /** False until the auth composables attached (no client yet, or app misconfigured). */
  available: boolean
  isLoading?: boolean
  isAuthenticated?: boolean
  email?: string
  name?: string
  id?: string
}

/** Subscription state per `useBilling()` (+ active plan ids per `useFeatures()`). */
export interface DevtoolsBillingSnapshot {
  isLoading: boolean
  /** Active subscription status (`active`, `trialing`, …); absent on the free plan. */
  status?: string
  /** Active subscription's provider product id. */
  productId?: string
  /** Active product ids the billing entity is subscribed to. */
  plans?: string[]
}

/** Granted benefits per `useFeatures()`, reduced to friendly keys. */
export interface DevtoolsFeaturesSnapshot {
  isLoading: boolean
  keys: string[]
}

/** One prepaid credit meter (the `getCredits` cache row). */
export interface DevtoolsCreditMeterSnapshot {
  meterId: string
  /** The configured friendly name, when the catalog declares one. */
  name?: string
  balance: number
  credited: number
  consumed: number
}

/** The active workspace per `useOrganization()`. */
export interface DevtoolsWorkspaceSnapshot {
  /** False while no workspace is active (or workspace state is unreachable). */
  available: boolean
  id?: string
  name?: string
  members?: number
  pendingInvitations?: number
}

/** One recent webhook delivery (the identity-gated `getWebhookDeliveries` row). */
export interface DevtoolsWebhookDeliverySnapshot {
  service: string
  deliveryId: string
  type?: string
  outcome: string
  note?: string
  receivedAt: number
}

export interface BackendDevtoolsSnapshot {
  identity: DevtoolsIdentitySnapshot
  billing: DevtoolsBillingSnapshot
  features: DevtoolsFeaturesSnapshot
  credits: DevtoolsCreditMeterSnapshot[]
  workspace: DevtoolsWorkspaceSnapshot
  webhooks: DevtoolsWebhookDeliverySnapshot[]
  /** From the base module's bridge; `null` while that bridge is absent. */
  convexConnected: boolean | null
}

/** The surface the DevTools iframe consumes via `$backendDevtools`. */
export interface BackendDevtoolsBridge {
  version: 1
  getSnapshot(): BackendDevtoolsSnapshot
  /** Subscribe to snapshot changes; returns an unsubscribe function. */
  on(event: 'snapshot', callback: (snapshot: BackendDevtoolsSnapshot) => void): () => void
}

/** Host-side extras the plugin uses; not part of the iframe contract. */
export interface BackendDevtoolsBridgeHost extends BackendDevtoolsBridge {
  /** Replace one section of the snapshot (plugin-side, from `watchEffect`s). */
  patch<K extends keyof BackendDevtoolsSnapshot>(key: K, value: BackendDevtoolsSnapshot[K]): void
}
