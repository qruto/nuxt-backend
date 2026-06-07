import { describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h, nextTick, ref } from 'vue'
import type { AuthTokenFetcher } from 'convex/browser'
import { provideConvexAuth, useConvexAuth } from '../../../src/runtime/vue/auth'
import type { ConvexVueClient } from '../../../src/runtime/vue/client'

describe('ConvexAuthState', () => {
  it('provideConvexAuth works', async () => {
    const isLoading = ref(true)
    const isAuthenticated = ref(false)
    const fetchAccessToken: AuthTokenFetcher = vi.fn(async () => 'token')

    let onAuthChange: ((isAuthenticated: boolean) => void) | undefined
    const client = {
      setAuth: vi.fn((_fetchToken, callback) => {
        onAuthChange = callback
      }),
      clearAuth: vi.fn(),
    } as unknown as ConvexVueClient

    const App = defineComponent({
      setup() {
        const auth = useConvexAuth()
        return () => h('div', auth.isLoading ? 'Loading...' : auth.isAuthenticated ? 'Authenticated' : 'Unauthenticated')
      },
    })

    const Wrapper = defineComponent({
      setup() {
        provideConvexAuth({
          client,
          useAuth: () => ({
            isLoading,
            isAuthenticated,
            fetchAccessToken,
          }),
        })
        return () => h(App)
      },
    })

    const wrapper = await mountSuspended(Wrapper)
    expect(wrapper.text()).toBe('Loading...')

    isLoading.value = false
    isAuthenticated.value = true
    await nextTick()

    expect(client.setAuth).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toBe('Loading...')

    onAuthChange?.(true)
    await nextTick()

    expect(wrapper.text()).toBe('Authenticated')

    wrapper.unmount()
    expect(client.clearAuth).toHaveBeenCalledTimes(1)
  })

  it('resets to loading and unauthenticated when auth provider state changes', async () => {
    const isLoading = ref(false)
    const isAuthenticated = ref(true)
    const fetchAccessToken: AuthTokenFetcher = vi.fn(async () => 'token')

    let onAuthChange: ((isAuthenticated: boolean) => void) | undefined
    const client = {
      setAuth: vi.fn((_fetchToken, callback) => {
        onAuthChange = callback
      }),
      clearAuth: vi.fn(),
    } as unknown as ConvexVueClient

    const App = defineComponent({
      setup() {
        const auth = useConvexAuth()
        return () => h('div', auth.isLoading ? 'Loading...' : auth.isAuthenticated ? 'Authenticated' : 'Unauthenticated')
      },
    })

    const Wrapper = defineComponent({
      setup() {
        provideConvexAuth({
          client,
          useAuth: () => ({
            isLoading,
            isAuthenticated,
            fetchAccessToken,
          }),
        })
        return () => h(App)
      },
    })

    const wrapper = await mountSuspended(Wrapper)
    onAuthChange?.(true)
    await nextTick()
    expect(wrapper.text()).toBe('Authenticated')

    isLoading.value = true
    await nextTick()
    expect(wrapper.text()).toBe('Loading...')

    isLoading.value = false
    isAuthenticated.value = false
    await nextTick()
    expect(wrapper.text()).toBe('Unauthenticated')
  })

  it('settles to unauthenticated on a live sign-out (authenticated → unauthenticated directly)', async () => {
    // Reproduces the "live sign-out hangs in loading" bug: the provider goes
    // straight from authenticated to not-authenticated in a single tick (no
    // intermediate loading state, as happens on `client.signOut()`). The
    // setAuth() effect cleanup resets Convex state to `null`; without the
    // reconciliation re-running, useConvexAuth() would stay stuck in loading.
    const isLoading = ref(false)
    const isAuthenticated = ref(true)
    const fetchAccessToken: AuthTokenFetcher = vi.fn(async () => 'token')

    let onAuthChange: ((isAuthenticated: boolean) => void) | undefined
    const client = {
      setAuth: vi.fn((_fetchToken, callback) => {
        onAuthChange = callback
      }),
      clearAuth: vi.fn(),
    } as unknown as ConvexVueClient

    const App = defineComponent({
      setup() {
        const auth = useConvexAuth()
        return () => h('div', auth.isLoading ? 'Loading...' : auth.isAuthenticated ? 'Authenticated' : 'Unauthenticated')
      },
    })

    const Wrapper = defineComponent({
      setup() {
        provideConvexAuth({
          client,
          useAuth: () => ({
            isLoading,
            isAuthenticated,
            fetchAccessToken,
          }),
        })
        return () => h(App)
      },
    })

    const wrapper = await mountSuspended(Wrapper)
    onAuthChange?.(true)
    await nextTick()
    expect(wrapper.text()).toBe('Authenticated')

    // Sign out: the Better Auth session resolves directly to "not authenticated"
    // without ever flipping back to loading.
    isAuthenticated.value = false
    await nextTick()
    expect(wrapper.text()).toBe('Unauthenticated')
    expect(client.clearAuth).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('re-registers Convex auth when the auth context changes', async () => {
    const isLoading = ref(false)
    const isAuthenticated = ref(true)
    const authVersion = ref('session-1')
    const fetchAccessToken: AuthTokenFetcher = vi.fn(async () => 'token')

    const client = {
      setAuth: vi.fn(),
      clearAuth: vi.fn(),
    } as unknown as ConvexVueClient

    const Wrapper = defineComponent({
      setup() {
        provideConvexAuth({
          client,
          useAuth: () => ({
            isLoading,
            isAuthenticated,
            fetchAccessToken,
            authVersion,
          }),
        })
        return () => h('div', 'auth')
      },
    })

    const wrapper = await mountSuspended(Wrapper)

    expect(client.setAuth).toHaveBeenCalledTimes(1)

    authVersion.value = 'session-2'
    await nextTick()

    expect(client.clearAuth).toHaveBeenCalledTimes(1)
    expect(client.setAuth).toHaveBeenCalledTimes(2)

    wrapper.unmount()
  })
})
