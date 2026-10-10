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

/** Subscription state per `useBilling()`. */
export interface DevtoolsBillingSnapshot {
  isLoading: boolean
  /** Provider status (`active`, `trialing`, `past_due`, `paused`, …); absent on the free plan. */
  status?: string
  /** The active subscription's product id. */
  productId?: string
  /** That product's name, from the configured products. */
  productName?: string
  /** The subscription ends when the paid period does. */
  cancelAtPeriodEnd: boolean
  isPaused: boolean
  /** End of the trial, ms since epoch. */
  trialEnd?: number
  /** The product a plan change scheduled for the next period switches to. */
  pendingProductId?: string
  /** Every subscription on record, ended ones included. */
  subscriptions?: number
}

/** What the billing entity is entitled to, per `useFeatures()`. */
export interface DevtoolsEntitlementsSnapshot {
  isLoading: boolean
  /** Granted feature keys — what `useFeatures().has()` matches. */
  features: string[]
  /** Active plan (product) ids. */
  plans: string[]
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
  /** The signed-in user's role in it. */
  role?: string
  members?: number
  pendingInvitations?: number
  /** Workspaces the user belongs to. */
  workspaces?: number
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

/** The content layer (`appConfig.backend`) the shipped pages render from. */
export interface DevtoolsConfigSnapshot {
  brand: { name?: string, logo?: string }
  /** Plan keys in the display catalog. */
  plans: string[]
  /** Credit pack keys in the display catalog. */
  packs: string[]
}

/** One device session. Its token is a credential and never crosses to the panel. */
export interface DevtoolsSessionRow {
  /** The browser and OS, from the user agent. */
  device: string
  /** The session of the inspected browser. */
  current: boolean
  createdAt?: number
}

export interface DevtoolsSessionsSnapshot {
  isLoading: boolean
  error?: string
  items: DevtoolsSessionRow[]
}

/** One passkey, without its credential. */
export interface DevtoolsPasskeyRow {
  name?: string
  deviceType?: string
  backedUp?: boolean
  createdAt?: number
}

export interface DevtoolsPasskeysSnapshot {
  isLoading: boolean
  error?: string
  items: DevtoolsPasskeyRow[]
}

/** Gifts addressed to the signed-in user, by state. */
export interface DevtoolsGiftsSnapshot {
  isLoading: boolean
  received: number
  /** Paid and ready to receive. */
  unclaimed: number
  /** Awaiting the purchaser's payment. */
  pending: number
}

/** The delivery status of one email the panel looks up by id. */
export interface DevtoolsEmailLookupSnapshot {
  emailId: string
  isLoading: boolean
  /** `queued`, `sent`, `delivered`, `bounced`, …; absent when unknown. */
  status?: string
  /** The id matched an email this deployment sent. */
  found: boolean
}

/** Sections loaded when a panel page asks for them, not on every render. */
export type DevtoolsOnDemandSection = 'sessions' | 'passkeys' | 'gifts'

/** The backend connection, from the base module's client state. */
export type DevtoolsConnectionState = 'connected' | 'reconnecting' | 'idle' | 'closed'

/** What an activity entry is about — one per snapshot section that produces them. */
export type DevtoolsActivityKind = 'auth' | 'workspace' | 'billing' | 'features' | 'credits' | 'webhook' | 'email' | 'connection'

/** `info` is routine, `warn` needs a look, `error` is a failure. */
export type DevtoolsActivityLevel = 'info' | 'warn' | 'error'

/** One change the bridge saw between two snapshots: a sign-in, a plan change, a refused webhook. */
export interface DevtoolsActivityEvent {
  /** Increasing per page load; stable keys for lists. */
  id: number
  /** When the change reached the page, ms since epoch. */
  at: number
  kind: DevtoolsActivityKind
  level: DevtoolsActivityLevel
  /** What happened, e.g. `Signed in`, `Credits changed`. */
  title: string
  /** Who or what it concerns, e.g. `ada@example.com`, `credits: 120 → 90`. */
  detail?: string
}

export interface BackendDevtoolsSnapshot {
  identity: DevtoolsIdentitySnapshot
  billing: DevtoolsBillingSnapshot
  entitlements: DevtoolsEntitlementsSnapshot
  credits: DevtoolsCreditMeterSnapshot[]
  workspace: DevtoolsWorkspaceSnapshot
  webhooks: DevtoolsWebhookDeliverySnapshot[]
  config: DevtoolsConfigSnapshot
  /** Scaffolded function modules (`backend/<name>.ts`) the composables bind to and the app lacks. */
  missingNamespaces: string[]
  /** `null` while the base module's bridge is absent. */
  connection: DevtoolsConnectionState | null
  sessions?: DevtoolsSessionsSnapshot
  passkeys?: DevtoolsPasskeysSnapshot
  gifts?: DevtoolsGiftsSnapshot
  emailLookup?: DevtoolsEmailLookupSnapshot
  /**
   * False until the panel first opens: the sections that need queries of
   * their own (billing, entitlements, credits, workspace, webhooks) start
   * then, so a page nobody inspects pays nothing for them.
   */
  active: boolean
  /** What changed since the page loaded, oldest first, the last 200 entries. */
  activity: DevtoolsActivityEvent[]
}

/** What the panel can ask the inspected app to load. */
export interface DevtoolsBridgeRequests {
  /** Start the sections that need queries of their own (idempotent). */
  activate(): void
  /** Load an on-demand section (later calls refresh it). */
  request(section: DevtoolsOnDemandSection): void
  /** Track one email's delivery status, replacing the previous lookup. */
  lookupEmail(emailId: string): void
}

/** The surface the DevTools iframe consumes via `$backendDevtools`. */
export interface BackendDevtoolsBridge extends DevtoolsBridgeRequests {
  version: 3
  getSnapshot(): BackendDevtoolsSnapshot
  /** Subscribe to snapshot changes; returns an unsubscribe function. */
  on(event: 'snapshot', callback: (snapshot: BackendDevtoolsSnapshot) => void): () => void
}

/** The snapshot sections the plugin patches; `active` and `activity` belong to the bridge. */
export type DevtoolsPatchableSection = Exclude<keyof BackendDevtoolsSnapshot, 'active' | 'activity'>

/** Host-side extras the plugin uses; not part of the iframe contract. */
export interface BackendDevtoolsBridgeHost extends BackendDevtoolsBridge {
  /** Replace one section of the snapshot (plugin-side, from `watchEffect`s). */
  patch<K extends DevtoolsPatchableSection>(key: K, value: BackendDevtoolsSnapshot[K]): void
  /** Called with every activity entry kept so far, then with each new one (the Vue DevTools timeline listens). */
  onActivity(callback: (event: DevtoolsActivityEvent) => void): () => void
}
