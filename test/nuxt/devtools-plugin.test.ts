import { computed, reactive, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BackendDevtoolsBridge } from '../../src/runtime/devtools/types'

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
  pendingUpdate: ref<{ productId: string | null } | null>(null),
}
const features = {
  isLoading: ref(false),
  plans: ref<string[] | undefined>(['prod_pro']),
  benefits: ref<Array<{ benefitId: string, type?: string, metadata?: Record<string, unknown> }> | undefined>([
    { benefitId: 'b1', metadata: { key: 'priority_support' } },
  ]),
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
  organizations: ref([{}, {}]),
}

vi.mock('#app', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  defineNuxtPlugin: (plugin: unknown) => plugin,
  useAppConfig: () => appConfig,
  useRuntimeConfig: () => ({ public: { backend: { workspaces: true } } }),
}))
vi.mock('nuxt-convex-module/client', () => ({
  useConvexNamespace: (name: string) => namespaces.get(name),
  useQuery: (query: { rows: unknown }) => ref(query.rows),
}))
vi.mock('../../src/runtime/vue/composables/use-auth', () => ({ useAuth: () => auth }))
vi.mock('../../src/runtime/vue/composables/use-billing', () => ({ useBilling: () => billing }))
vi.mock('../../src/runtime/vue/composables/use-features', () => ({ useFeatures: () => features }))
vi.mock('../../src/runtime/vue/composables/use-organization', () => ({ useOrganization: () => organization }))

const sessionRows = ref<Array<{ token: string, userAgent?: string, createdAt: string }> | undefined>(undefined)
const sessions = {
  sessions: sessionRows,
  current: computed(() => sessionRows.value?.[0]),
  isLoading: ref(false),
  error: ref<string | null>(null),
  refresh: vi.fn(async () => {
    sessionRows.value = [
      { token: 'sentinel-session-token-1', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', createdAt: '2026-09-01T00:00:00.000Z' },
      { token: 'sentinel-session-token-2', createdAt: '2026-09-02T00:00:00.000Z' },
    ]
  }),
}
const emailStatus = ref<{ status: string } | null | undefined>(undefined)
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
  useGifts: (options: { autoClaim?: boolean }) => {
    if (options.autoClaim !== false) throw new Error('the panel must never claim a gift')
    const received = ref([{ status: 'paid' }, { status: 'pending' }, { status: 'claimed' }])
    return { received, unclaimed: computed(() => received.value.filter(gift => gift.status === 'paid')) }
  },
}))
vi.mock('../../src/runtime/vue/composables/use-email-status', () => ({
  useEmailStatus: () => ({
    data: emailStatus,
    status: computed(() => emailStatus.value?.status),
    isLoading: computed(() => emailStatus.value === undefined),
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
  it('publishes a version 2 bridge with every section filled', () => {
    const snapshot = install().getSnapshot()

    expect(snapshot.identity).toEqual({ available: true, isLoading: false, isAuthenticated: true, email: 'a@example.com', name: 'Ada', id: 'u1' })
    expect(snapshot.billing).toMatchObject({ isLoading: false, status: 'active', productId: 'prod_pro', productName: 'Pro', cancelAtPeriodEnd: false, isPaused: false, subscriptions: 2 })
    expect(snapshot.entitlements).toEqual({ isLoading: false, features: ['priority_support'], plans: ['prod_pro'] })
    expect(snapshot.credits).toEqual([{ meterId: 'm1', name: 'credits', balance: 7, credited: 10, consumed: 3 }])
    expect(snapshot.workspace).toEqual({ available: true, id: 'w1', name: 'Acme', role: 'owner', workspaces: 2, members: 3, pendingInvitations: 1 })
    expect(snapshot.webhooks).toEqual([{ service: 'billing', deliveryId: 'd1', type: 'order.paid', outcome: 'ok', note: undefined, receivedAt: 5 }])
    expect(snapshot.config).toEqual({ brand: { name: 'Acme', logo: undefined }, plans: ['pro'], packs: ['credits500'] })
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
    expect(loaded!.items[1]).toMatchObject({ current: false, createdAt: Date.parse('2026-09-02T00:00:00.000Z') })
    expect(passkeys!.items).toEqual([{ name: 'Laptop', deviceType: 'multiDevice', backedUp: true, createdAt: Date.parse('2026-09-03T00:00:00.000Z') }])
    const serialized = JSON.stringify(bridge.getSnapshot())
    for (const secret of ['sentinel-session-token-1', 'sentinel-session-token-2', 'sentinel-passkey-id']) {
      expect(serialized).not.toContain(secret)
    }
  })

  it('counts gifts by state, and never claims one', () => {
    const bridge = install()
    bridge.request('gifts')
    expect(bridge.getSnapshot().gifts).toEqual({ isLoading: false, received: 3, unclaimed: 1, pending: 1 })
  })

  it('looks up one email\'s delivery status', async () => {
    const bridge = install()
    bridge.lookupEmail(' email_123 ')
    await vi.waitFor(() => expect(bridge.getSnapshot().emailLookup).toEqual({ emailId: 'email_123', isLoading: true, status: undefined, found: false }))

    emailStatus.value = { status: 'delivered' }
    await vi.waitFor(() => expect(bridge.getSnapshot().emailLookup).toMatchObject({ status: 'delivered', found: true, isLoading: false }))
  })
})
