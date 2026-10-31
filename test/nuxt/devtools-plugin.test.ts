import { computed, nextTick, reactive, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BackendDevtoolsBridge, BackendDevtoolsBridgeHost } from '../../src/runtime/devtools/types'

// The dev-only plugin that mirrors the package's composables into the bridge
// the DevTools panel reads. Every composable is a stand-in here, so what is
// under test is the mapping: which state lands in which section, and that
// nothing the panel should not see (tokens, ids of other rows) is copied.

const namespaces = new Map<string, unknown>()
const appConfig = reactive<{ backend?: Record<string, unknown> }>({})

const subscription = ref<Record<string, unknown> | null | undefined>(undefined)
const billing = {
  subscription,
  subscriptions: ref<unknown[] | undefined>(undefined),
  products: ref<Record<string, { id: string, name: string } | undefined> | undefined>(undefined),
  isLoading: computed(() => subscription.value === undefined),
  cancelAtPeriodEnd: ref(false),
  isPaused: ref(false),
  trialEnd: ref<Date | null>(null),
  pendingChange: ref<{ productId: string, appliesAt: Date } | null>(null),
}
const features = {
  isLoading: ref(false),
  plans: ref<string[] | undefined>(['prod_pro']),
  benefits: ref<Array<{ benefitId: string, type?: string, metadata?: Record<string, unknown> }> | undefined>([
    { benefitId: 'b1', metadata: { key: 'priority_support' } },
  ]),
  quotas: ref<Record<string, { limit: number | 'unlimited', used: number }> | undefined>({ projects: { limit: 10, used: 4 }, exports: { limit: 'unlimited', used: 2 } }),
}
const auth = {
  user: ref<{ id: string, email: string, name: string } | null>({ id: 'u1', email: 'a@example.com', name: 'Ada' }),
  isLoading: ref(false),
  isAuthenticated: ref(true),
}
const organization = {
  current: ref<{ id: string, name: string, invitations: Array<{ status: string }> } | null>({ id: 'w1', name: 'Acme', invitations: [{ status: 'pending' }, { status: 'accepted' }] }),
  members: ref([{}, {}, {}]),
  role: ref<string | null>('owner'),
  workspaces: ref([{}, {}]),
}

vi.mock('#app', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  defineNuxtPlugin: (plugin: unknown) => plugin,
  useAppConfig: () => appConfig,
}))
const convexAction = vi.fn(async (_ref: unknown, _args: unknown): Promise<unknown> => ({ replayedAt: 1 }))
vi.mock('nuxt-convex-module/client', () => ({
  useQuery: (query: { rows: unknown }) => ref(query.rows),
  useConvex: () => ({ action: convexAction }),
}))
vi.mock('../../src/runtime/vue/utils/namespace', () => ({
  useApiNamespace: (name: string) => namespaces.get(name),
}))
vi.mock('../../src/runtime/vue/utils/auth-session', () => ({ useAuthSession: () => auth }))
vi.mock('../../src/runtime/vue/composables/use-billing', () => ({ useBilling: () => billing }))
vi.mock('../../src/runtime/vue/composables/use-features', () => ({ useFeatures: () => features }))
vi.mock('../../src/runtime/vue/composables/use-workspace', () => ({ useWorkspace: () => organization }))

// A live query in the real composable: the rows are there as soon as it is created.
const sessions = {
  sessions: ref([
    { id: 'sentinel-session-id-1', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', createdAt: Date.parse('2026-09-01T00:00:00.000Z'), current: true },
    { id: 'sentinel-session-id-2', userAgent: null, createdAt: Date.parse('2026-09-02T00:00:00.000Z'), current: false },
  ]),
  isLoading: ref(false),
  error: ref<{ code: string, data: Record<string, unknown>, message: string } | null>(null),
}
const emailStatus = ref<{ status: string } | null | undefined>(undefined)
const emailError = ref<{ code: string, data: Record<string, unknown>, message: string } | null>(null)
vi.mock('../../src/runtime/vue/composables/use-sessions', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSessions: () => sessions,
}))
vi.mock('../../src/runtime/vue/composables/use-passkeys', () => ({
  usePasskeys: () => ({
    passkeys: ref([{ id: 'sentinel-passkey-id', name: 'Laptop', deviceType: 'multiDevice', backedUp: true, createdAt: '2026-09-03T00:00:00.000Z' }]),
    isLoading: ref(false),
    error: ref(null),
    refresh: vi.fn(async () => {}),
  }),
}))
vi.mock('../../src/runtime/vue/composables/use-gifts', () => ({
  // A claim is the recipient's own click: the panel gets no way to make one.
  useGifts: () => {
    const received = ref([{ status: 'paid' }, { status: 'claimed' }, { status: 'claimed' }])
    return { received, unclaimed: computed(() => received.value.filter(gift => gift.status === 'paid')) }
  },
}))
vi.mock('../../src/runtime/vue/composables/use-notifications', () => ({
  // The inbox's first page: what the panel lists, with the channels each went out on.
  useNotifications: () => ({
    items: ref([{ id: 'sentinel-notification-id', type: 'auth.passkey_added', title: 'A passkey was added', body: null, link: '/security', at: 1_790_000_000_000, read: false, channels: ['app'], actor: { kind: 'you', name: 'Ada' }, workspace: null, data: {} }]),
    unreadCount: ref(1),
    isLoading: ref(false),
    error: ref(null),
  }),
}))
vi.mock('../../src/runtime/vue/composables/use-email-status', () => ({
  useEmailStatus: () => ({
    data: emailStatus,
    status: computed(() => emailStatus.value?.status),
    isLoading: computed(() => emailStatus.value === undefined && !emailError.value),
    error: emailError,
  }),
}))

// A Vue DevTools that is listening: the plugin's setup runs at once.
const timeline = vi.hoisted(() => ({ layers: [] as unknown[], events: [] as unknown[] }))
vi.mock('@vue/devtools-api', () => ({
  setupDevtoolsPlugin: (_descriptor: unknown, setup: (api: unknown) => void) => setup({
    now: () => 42,
    addTimelineLayer: (layer: unknown) => timeline.layers.push(layer),
    addTimelineEvent: (event: unknown) => timeline.events.push(event),
  }),
}))

const plugin = (await import('../../src/runtime/devtools/plugin.client')).default as unknown as {
  setup: (nuxtApp: unknown) => void
}

function fakeNuxtApp() {
  return {
    vueApp: { runWithContext: <T>(fn: () => T) => fn() },
    provide: vi.fn(),
    hook: vi.fn(),
  }
}

function install(): BackendDevtoolsBridge {
  plugin.setup(fakeNuxtApp())
  return window.__NUXT_BACKEND_DEVTOOLS__!
}

beforeEach(() => {
  namespaces.clear()
  namespaces.set('auth', {})
  namespaces.set('email', {})
  namespaces.set('billing', {
    getCredits: { rows: { meters: [{ meterId: 'm1', name: 'credits', balance: 7, creditedUnits: 10, consumedUnits: 3 }] } },
  })
  namespaces.set('webhooks', {
    getWebhookDeliveries: { rows: [{ service: 'billing', deliveryId: 'd1', type: 'order.paid', outcome: 'ok', receivedAt: 5 }] },
  })
  appConfig.backend = { brand: { name: 'Acme' }, billing: { plans: [{ key: 'pro' }], packs: [{ key: 'credits500' }] } }
  subscription.value = { status: 'active', productId: 'prod_pro' }
  billing.products.value = { pro: { id: 'prod_pro', name: 'Pro' } }
  billing.subscriptions.value = [{}, {}]
})

afterEach(() => {
  delete window.__NUXT_BACKEND_DEVTOOLS__
  delete (window as unknown as { __NUXT_CONVEX_DEVTOOLS__?: unknown }).__NUXT_CONVEX_DEVTOOLS__
})

describe('the DevTools bridge plugin', () => {
  it('publishes a version 3 bridge: what the app holds at once, the rest on the panel\'s first visit', () => {
    const bridge = install()
    expect(bridge.version).toBe(3)

    const atLoad = bridge.getSnapshot()
    expect(atLoad.identity).toEqual({ available: true, isLoading: false, isAuthenticated: true, email: 'a@example.com', name: 'Ada', id: 'u1' })
    expect(atLoad.config).toEqual({ brand: { name: 'Acme', logo: undefined }, plans: ['pro'], packs: ['credits500'] })
    // Nothing that needs a query of its own has started yet.
    expect(atLoad.active).toBe(false)
    expect(atLoad.billing).toMatchObject({ isLoading: true })
    expect(atLoad.credits).toEqual([])
    expect(atLoad.workspace).toEqual({ available: false })
    expect(atLoad.webhooks).toEqual([])

    bridge.activate()
    const snapshot = bridge.getSnapshot()
    expect(snapshot.active).toBe(true)
    expect(snapshot.billing).toMatchObject({ isLoading: false, status: 'active', productId: 'prod_pro', productName: 'Pro', cancelAtPeriodEnd: false, isPaused: false, subscriptions: 2 })
    expect(snapshot.entitlements).toEqual({ isLoading: false, features: ['priority_support'], plans: ['prod_pro'], quotas: [{ key: 'projects', limit: 10, used: 4 }, { key: 'exports', limit: 'unlimited', used: 2 }] })
    expect(snapshot.credits).toEqual([{ meterId: 'm1', name: 'credits', balance: 7, credited: 10, consumed: 3 }])
    expect(snapshot.workspace).toEqual({ available: true, id: 'w1', name: 'Acme', role: 'owner', workspaces: 2, members: 3, pendingInvitations: 1 })
    expect(snapshot.webhooks).toEqual([{ service: 'billing', deliveryId: 'd1', type: 'order.paid', outcome: 'ok', note: undefined, receivedAt: 5 }])
    // Loading what was already true is not activity.
    expect(snapshot.activity).toEqual([])
  })

  it('names who signed in and out: a session whose user is still loading has not settled', async () => {
    const bridge = install()
    try {
      auth.isAuthenticated.value = false
      auth.user.value = null
      await nextTick()
      auth.isAuthenticated.value = true
      await nextTick()
      expect(bridge.getSnapshot().identity).toMatchObject({ isLoading: true, isAuthenticated: true })
      auth.user.value = { id: 'u1', email: 'a@example.com', name: 'Ada' }
      await nextTick()
      expect(bridge.getSnapshot().activity.map(event => [event.title, event.detail])).toEqual([
        ['Signed out', 'a@example.com'],
        ['Signed in', 'a@example.com'],
      ])
    }
    finally {
      auth.isAuthenticated.value = true
      auth.user.value = { id: 'u1', email: 'a@example.com', name: 'Ada' }
    }
  })

  it('mirrors each activity entry into a Backend layer of the Vue DevTools timeline', async () => {
    timeline.layers.length = 0
    timeline.events.length = 0
    const bridge = install() as BackendDevtoolsBridgeHost
    await vi.waitFor(() => expect(timeline.layers).toEqual([{ id: 'nuxt-backend', label: 'Backend', color: 0x22C55E }]))

    bridge.patch('connection', 'connected')
    bridge.patch('connection', 'reconnecting')
    bridge.patch('connection', 'closed')
    expect(timeline.events).toEqual([
      { layerId: 'nuxt-backend', event: { time: 42, title: 'Connection lost, reconnecting', subtitle: undefined, data: { kind: 'connection' }, logType: 'warning' } },
      { layerId: 'nuxt-backend', event: { time: 42, title: 'Connection closed', subtitle: undefined, data: { kind: 'connection' }, logType: 'error' } },
    ])
    bridge.patch('identity', { available: true, isLoading: false, isAuthenticated: false })
    expect(timeline.events.at(-1)).toMatchObject({ event: { title: 'Signed out', subtitle: 'a@example.com', data: { kind: 'auth', detail: 'a@example.com' }, logType: 'default' } })
  })

  it('replays a delivery as the signed-in administrator, the outcome in the snapshot', async () => {
    const replay = { name: 'webhooks:replayWebhookDelivery' }
    namespaces.set('webhooks', { ...namespaces.get('webhooks') as object, replayWebhookDelivery: replay })
    const bridge = install()
    bridge.replayWebhook('billing', 'd1')
    expect(bridge.getSnapshot().webhookReplay).toEqual({ service: 'billing', deliveryId: 'd1', state: 'pending' })
    expect(convexAction).toHaveBeenCalledWith(replay, { service: 'billing', deliveryId: 'd1' })
    await vi.waitFor(() => expect(bridge.getSnapshot().webhookReplay).toEqual({ service: 'billing', deliveryId: 'd1', state: 'done' }))

    convexAction.mockRejectedValueOnce(new Error('needs a recent sign-in'))
    bridge.replayWebhook('email', 'msg_1')
    await vi.waitFor(() => expect(bridge.getSnapshot().webhookReplay).toMatchObject({ service: 'email', deliveryId: 'msg_1', state: 'error', message: expect.any(String) }))
  })

  it('names the scaffolded function modules the app is missing', () => {
    namespaces.delete('email')
    expect(install().getSnapshot().missingNamespaces).toEqual(['email'])
  })

  it('maps the base module\'s connection into four states', async () => {
    let emit: (connection: unknown) => void = () => {}
    ;(window as unknown as { __NUXT_CONVEX_DEVTOOLS__: unknown }).__NUXT_CONVEX_DEVTOOLS__ = {
      version: 1,
      getSnapshot: () => ({ connection: { status: 'active', state: { isWebSocketConnected: true } } }),
      on: (_event: string, callback: (connection: unknown) => void) => {
        emit = callback
        return () => {}
      },
    }
    const bridge = install()
    expect(bridge.getSnapshot().connection).toBe('connected')

    // Restarted on purpose (a fresh auth token): no attempt has failed.
    emit({ status: 'active', state: { isWebSocketConnected: false, hasEverConnected: true, connectionRetries: 0 } })
    expect(bridge.getSnapshot().connection).toBe('connected')
    emit({ status: 'active', state: { isWebSocketConnected: false, hasEverConnected: true, connectionRetries: 1 } })
    expect(bridge.getSnapshot().connection).toBe('reconnecting')
    emit({ status: 'active', state: { isWebSocketConnected: false, hasEverConnected: false, connectionRetries: 0 } })
    expect(bridge.getSnapshot().connection).toBe('idle')
    emit({ status: 'active', state: { isWebSocketConnected: false } })
    expect(bridge.getSnapshot().connection).toBe('reconnecting')
    emit({ status: 'closed' })
    expect(bridge.getSnapshot().connection).toBe('closed')
    emit({ status: 'idle' })
    expect(bridge.getSnapshot().connection).toBe('idle')
  })

  it('leaves the connection unknown while the base module has no bridge', () => {
    expect(install().getSnapshot().connection).toBeNull()
  })

  it('loads sessions and passkeys when asked, without their credentials', async () => {
    const bridge = install()
    expect(bridge.getSnapshot().sessions).toBeUndefined()

    bridge.request('sessions')
    bridge.request('passkeys')
    await vi.waitFor(() => expect(bridge.getSnapshot().sessions?.items).toHaveLength(2))

    const { sessions: loaded, passkeys } = bridge.getSnapshot()
    expect(loaded!.items[0]).toMatchObject({ current: true, device: expect.stringContaining('Chrome') })
    expect(loaded!.items[1]).toMatchObject({ current: false, device: 'Unknown device', createdAt: Date.parse('2026-09-02T00:00:00.000Z') })
    expect(passkeys!.items).toEqual([{ name: 'Laptop', deviceType: 'multiDevice', backedUp: true, createdAt: Date.parse('2026-09-03T00:00:00.000Z') }])
    const serialized = JSON.stringify(bridge.getSnapshot())
    for (const secret of ['sentinel-session-id-1', 'sentinel-session-id-2', 'sentinel-passkey-id']) {
      expect(serialized).not.toContain(secret)
    }
  })

  it('shows why the session list could not be read, as its sentence', async () => {
    const bridge = install()
    bridge.request('sessions')
    sessions.error.value = { code: 'unauthenticated', data: {}, message: 'Sign in to continue.' }
    try {
      await vi.waitFor(() => expect(bridge.getSnapshot().sessions?.error).toBe('Sign in to continue.'))
    }
    finally {
      sessions.error.value = null
    }
  })

  it('counts gifts by state, and never claims one', () => {
    const bridge = install()
    bridge.request('gifts')
    expect(bridge.getSnapshot().gifts).toEqual({ isLoading: false, received: 3, unclaimed: 1, claimed: 2 })
  })

  it('lists the newest notifications with their channels, and not the ids or the actor behind them', () => {
    const bridge = install()
    bridge.request('notifications')
    const { notifications } = bridge.getSnapshot()
    expect(notifications).toEqual({ isLoading: false, unread: 1, items: [{ type: 'auth.passkey_added', title: 'A passkey was added', read: false, at: 1_790_000_000_000, channels: ['app'] }] })
    expect(JSON.stringify(notifications)).not.toContain('sentinel-notification-id')
  })

  it('looks up one email\'s delivery status', async () => {
    const bridge = install()
    bridge.lookupEmail(' email_123 ')
    await vi.waitFor(() => expect(bridge.getSnapshot().emailLookup).toEqual({ emailId: 'email_123', isLoading: true, status: undefined, found: false }))

    emailStatus.value = { status: 'delivered' }
    await vi.waitFor(() => expect(bridge.getSnapshot().emailLookup).toMatchObject({ status: 'delivered', found: true, isLoading: false }))
  })

  it('says why an email lookup failed, rather than that the email was not found', async () => {
    const bridge = install()
    emailStatus.value = undefined
    emailError.value = { code: 'unauthenticated', data: {}, message: 'Sign in to continue.' }
    try {
      bridge.lookupEmail('email_456')
      await vi.waitFor(() => expect(bridge.getSnapshot().emailLookup).toEqual({ emailId: 'email_456', isLoading: false, status: undefined, found: false, error: 'Sign in to continue.' }))
    }
    finally {
      emailError.value = null
    }
  })
})
