import { computed, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BackendDevtoolsBridge } from '../../src/runtime/devtools/types'

// The dev-only DevTools bridge plugin where the app is not all there yet:
// no backend client at start (it attaches once the app mounts), the base
// module's bridge arriving after it, no Vue DevTools to mirror into, and a
// panel opened on an app without the functions a section reads. Every
// composable is a stand-in, as in devtools-plugin.test.ts; what is under test
// is what the panel is told then.

const namespaces = new Map<string, unknown>()
const appConfig: { backend?: Record<string, unknown> } = {}
const ready = { auth: true }

const subscription = ref<Record<string, unknown> | null>(null)
const billing = {
  subscription,
  subscriptions: ref<unknown[] | undefined>(undefined),
  products: ref(undefined),
  isLoading: computed(() => false),
  cancelAtPeriodEnd: ref(false),
  isPaused: ref(false),
  trialEnd: ref<Date | null>(new Date(Date.UTC(2026, 11, 1))),
  pendingChange: ref<{ productId: string, appliesAt: Date } | null>({ productId: 'prod_team', appliesAt: new Date(0) }),
}
const features = {
  isLoading: ref(false),
  plans: ref<string[] | undefined>(undefined),
  benefits: ref(undefined),
  quotas: ref<Record<string, { limit: number | 'unlimited', used: number, description?: string }> | undefined>({ seats: { limit: 5, used: 2, description: 'Team members' } }),
}
const auth = {
  user: ref<{ id: string, email: string, name: string } | null>(null),
  isLoading: ref(false),
  isAuthenticated: ref(false),
}

vi.mock('#app', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  defineNuxtPlugin: (plugin: unknown) => plugin,
  useAppConfig: () => appConfig,
}))
vi.mock('nuxt-convex-module/client', () => ({
  useQuery: (query: { rows: unknown }) => ref(query.rows),
  useConvex: () => ({ action: vi.fn() }),
}))
vi.mock('../../src/runtime/vue/utils/namespace', () => ({ useApiNamespace: (name: string) => namespaces.get(name) }))
vi.mock('../../src/runtime/vue/utils/auth-session', () => ({
  useAuthSession: () => {
    // What the base module's session composable throws before its client exists.
    if (!ready.auth) throw new Error('No Convex client: no deployment URL yet.')
    return auth
  },
}))
vi.mock('../../src/runtime/vue/composables/use-billing', () => ({ useBilling: () => billing }))
vi.mock('../../src/runtime/vue/composables/use-features', () => ({ useFeatures: () => features }))
vi.mock('../../src/runtime/vue/composables/use-workspace', () => ({
  useWorkspace: () => ({ current: ref(null), members: ref([]), role: ref(null), workspaces: ref([]) }),
}))
// The on-demand sections' composables, never asked for here.
vi.mock('../../src/runtime/vue/composables/use-sessions', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSessions: vi.fn(),
}))
vi.mock('../../src/runtime/vue/composables/use-passkeys', () => ({ usePasskeys: vi.fn() }))
vi.mock('../../src/runtime/vue/composables/use-gifts', () => ({ useGifts: vi.fn() }))
vi.mock('../../src/runtime/vue/composables/use-notifications', () => ({ useNotifications: vi.fn() }))
vi.mock('../../src/runtime/vue/composables/use-email-status', () => ({ useEmailStatus: vi.fn() }))
// No Vue DevTools listening: its API refuses.
vi.mock('@vue/devtools-api', () => ({
  setupDevtoolsPlugin: () => {
    throw new Error('No Vue DevTools hook.')
  },
}))

const plugin = (await import('../../src/runtime/devtools/plugin.client')).default as unknown as { setup: (nuxtApp: unknown) => void }

/** A Nuxt app whose `app:mounted` the test calls. */
function fakeNuxtApp() {
  const mounted: Array<() => void> = []
  const app = {
    vueApp: { runWithContext: <T>(fn: () => T) => fn() },
    provide: vi.fn(),
    hook: vi.fn((name: string, run: () => void) => {
      if (name === 'app:mounted') mounted.push(run)
    }),
  }
  return { app, mount: () => mounted.forEach(run => run()) }
}

const published = () => window.__NUXT_BACKEND_DEVTOOLS__ as BackendDevtoolsBridge | undefined

beforeEach(() => {
  ready.auth = true
  namespaces.clear()
  delete appConfig.backend
})
afterEach(() => {
  delete window.__NUXT_BACKEND_DEVTOOLS__
  delete (window as unknown as { __NUXT_CONVEX_DEVTOOLS__?: unknown }).__NUXT_CONVEX_DEVTOOLS__
})

describe('the DevTools bridge plugin, before the app is all there', () => {
  it('publishes nothing while there is no backend client, then the bridge once the app has mounted', () => {
    ready.auth = false
    const { app, mount } = fakeNuxtApp()
    plugin.setup(app)
    expect(published()).toBeUndefined()
    expect(app.provide).not.toHaveBeenCalled()

    ready.auth = true
    mount()
    expect(published()?.version).toBe(3)
    expect(app.provide).toHaveBeenCalledWith('backendDevtools', published())
  })

  it('keeps waiting when the app mounts still without a client', () => {
    ready.auth = false
    const { app, mount } = fakeNuxtApp()
    plugin.setup(app)
    mount()
    expect(published()).toBeUndefined()
  })

  it('reads the base module\'s bridge once the app has mounted, when it was not there at start', () => {
    const { app, mount } = fakeNuxtApp()
    plugin.setup(app)
    expect(published()!.getSnapshot().connection).toBeNull()

    ;(window as unknown as { __NUXT_CONVEX_DEVTOOLS__: unknown }).__NUXT_CONVEX_DEVTOOLS__ = {
      version: 1,
      getSnapshot: () => ({ connection: { status: 'active', state: { isWebSocketConnected: true } } }),
      on: () => () => {},
    }
    mount()
    expect(published()!.getSnapshot().connection).toBe('connected')
  })

  it('ignores a base module bridge of another version', () => {
    ;(window as unknown as { __NUXT_CONVEX_DEVTOOLS__: unknown }).__NUXT_CONVEX_DEVTOOLS__ = { version: 2, getSnapshot: () => ({ connection: { status: 'closed' } }), on: () => () => {} }
    const { app } = fakeNuxtApp()
    plugin.setup(app)
    expect(published()!.getSnapshot().connection).toBeNull()
  })

  it('publishes the bridge without a Vue DevTools to mirror into', async () => {
    const { app } = fakeNuxtApp()
    expect(() => plugin.setup(app)).not.toThrow()
    // The mirror's failure is its own: nothing reaches the page as unhandled.
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(published()?.version).toBe(3)
  })
})

describe('the DevTools panel on an app without what a section reads', () => {
  it('names every scaffolded function module as missing, and shows the content config as empty', () => {
    const { app } = fakeNuxtApp()
    plugin.setup(app)
    const snapshot = published()!.getSnapshot()
    expect(snapshot.missingNamespaces).toEqual(['auth', 'billing', 'email', 'webhooks'])
    expect(snapshot.config).toEqual({ brand: { name: undefined, logo: undefined }, plans: [], packs: [] })
    expect(snapshot.identity).toEqual({ available: true, isLoading: false, isAuthenticated: false, email: undefined, name: undefined, id: undefined })
  })

  it('says the delivery feed is unavailable and lists no credits, no workspace, but the quotas with what they count', () => {
    const { app } = fakeNuxtApp()
    plugin.setup(app)
    const bridge = published()!
    bridge.activate()
    const snapshot = bridge.getSnapshot()
    expect(snapshot.webhookFeed).toBe('unavailable')
    expect(snapshot.credits).toEqual([])
    expect(snapshot.workspace).toEqual({ available: false })
    expect(snapshot.entitlements).toEqual({ isLoading: false, features: [], plans: [], quotas: [{ key: 'seats', limit: 5, used: 2, description: 'Team members' }] })
    expect(snapshot.billing).toMatchObject({ status: undefined, productName: undefined, trialEnd: Date.UTC(2026, 11, 1), pendingProductId: 'prod_team', subscriptions: undefined })
  })

  it('refuses a replay the app cannot run, saying why, for an unknown service too', () => {
    const { app } = fakeNuxtApp()
    plugin.setup(app)
    const bridge = published()!
    bridge.replayWebhook('billing', 'd1')
    expect(bridge.getSnapshot().webhookReplay).toEqual({ service: 'billing', deliveryId: 'd1', state: 'error', message: 'backend/webhooks.ts does not export replayWebhookDelivery.' })

    namespaces.set('webhooks', { replayWebhookDelivery: { name: 'webhooks:replayWebhookDelivery' } })
    bridge.replayWebhook('sms', 'd2')
    expect(bridge.getSnapshot().webhookReplay).toMatchObject({ service: 'sms', state: 'error' })
  })
})
