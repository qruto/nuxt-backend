import { describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { useNuxtApp, useRouter, useRuntimeConfig } from '#imports'

// The plugin file itself, on the test's own Nuxt app and router: it reads
// the sign-in path from the runtime config, loads the auth client only
// once a guarded page is open, and builds the watch inside the app's
// context. The test app has no pages, and its stand-in router matches no
// record a page's meta could sit on, so `/account` stands for a page
// `definePageMeta({ auth })` guards (test/nuxt/session-ended.test.ts reads
// the meta itself); the session is a stand-in too.

const session = ref<{ data: unknown, isPending: boolean }>({ data: { session: { id: 's1' }, user: { id: 'u1' } }, isPending: false })
const inContext = vi.hoisted(() => ({ calls: [] as boolean[] }))

vi.mock('nuxt-convex-module/better-auth/client', async () => {
  const { tryUseNuxtApp } = await import('#app')
  return {
    useBetterAuth: () => {
      inContext.calls.push(tryUseNuxtApp() !== null)
      return {
        client: {},
        session,
        user: computed(() => null),
        isAuthenticated: computed(() => Boolean(session.value.data)),
        isLoading: computed(() => false),
        fetchAccessToken: async () => null,
        authVersion: computed(() => null),
      }
    },
  }
})

vi.mock('../../src/runtime/vue/utils/page-rules', async (original) => {
  const actual = await original<Record<string, unknown>>()
  const isAuthGuarded = (route: { path: string }) => route.path.startsWith('/account')
  return {
    ...actual,
    isAuthGuarded,
    onFirstGuardedPage: (router: { afterEach: (hook: (to: { path: string }) => void) => () => void }, start: () => void) => {
      const stop = router.afterEach((to) => {
        if (!isAuthGuarded(to)) return
        stop()
        start()
      })
    },
  }
})

const { default: plugin } = await import('../../src/runtime/vue/plugins/session-ended')

describe('the session-ended plugin', () => {
  it('waits for a guarded page, loads the auth client in the app\'s context, and redirects to the configured sign-in page', async () => {
    const config = useRuntimeConfig().public as Record<string, unknown>
    config.backend = { ...(config.backend as object), pages: { login: '/signin' } }
    const nuxtApp = useNuxtApp()
    const router = useRouter()
    await router.push('/')
    await nuxtApp.runWithContext(() => (plugin as unknown as (app: typeof nuxtApp) => unknown)(nuxtApp))

    // A public page: the auth client is never loaded for it.
    await flushPromises()
    expect(inContext.calls).toEqual([])

    await router.push('/account?tab=keys')
    // The first load of the auth client's chunk is a cold transform under the test runner.
    await vi.waitFor(() => expect(inContext.calls).toEqual([true]), { timeout: 15_000 })

    session.value = { data: null, isPending: false }
    await nextTick()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/signin'))
    expect(router.currentRoute.value.query.redirect).toBe('/account?tab=keys')
  })
})
