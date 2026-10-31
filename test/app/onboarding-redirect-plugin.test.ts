import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { shallowRef, type ShallowRef } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useNuxtApp, useRuntimeConfig } from '#imports'
import { createBackendMock, resetBackendMock } from '../../src/runtime/test-utils'

// The onboarding-redirect plugin file on the test's own Nuxt app, over the
// backend mock: when it starts the redirect (on the first page that asks for
// a sign-in, or the first page after the sign-in page), and that it mounts
// nothing with the first run turned off. Which accounts go to /welcome is
// onboarding-redirect.test.ts's. The plugin's router is a stand-in (the
// app's own everywhere else): the test app's matches no page a guard could
// sit on.

type Route = { path: string, fullPath: string, matched: Array<{ meta: Record<string, unknown> }> }
type Hook = (to: Route, from: Route, failure?: unknown) => void
interface StandIn {
  currentRoute: ShallowRef<Route>
  hooks: Hook[]
  afterEach: (hook: Hook) => () => void
  push: ReturnType<typeof vi.fn>
}
const router = vi.hoisted(() => ({ starting: false, standIn: undefined as unknown }))
mockNuxtImport('useRouter', original => () => (router.starting ? router.standIn : (original as () => unknown)()))

const { default: plugin } = await import('../../src/runtime/vue/plugins/onboarding-redirect')

const page = (path: string, guarded = false): Route => ({ path, fullPath: path, matched: guarded ? [{ meta: { auth: true } }] : [] })
const config = () => useRuntimeConfig().public as Record<string, unknown>
let original: unknown

/** Start the plugin as Nuxt does, on `at`, with `pages` in the public runtime config: what it watches and pushes. */
function start(at: Route, pages?: Record<string, unknown>): StandIn {
  config().backend = { ...(original as object), ...(pages ? { pages } : {}) }
  const hooks: Hook[] = []
  const standIn: StandIn = {
    currentRoute: shallowRef(at),
    hooks,
    afterEach: (hook) => {
      hooks.push(hook)
      return () => hooks.splice(hooks.indexOf(hook), 1)
    },
    push: vi.fn(async () => {}),
  }
  router.standIn = standIn
  router.starting = true
  const nuxtApp = useNuxtApp()
  try {
    nuxtApp.runWithContext(() => (plugin as unknown as { setup: (app: typeof nuxtApp) => void }).setup(nuxtApp))
  }
  finally {
    router.starting = false
  }
  return standIn
}

/** A navigation the stand-in router reports to every `afterEach`. */
async function navigate(standIn: StandIn, to: Route, from: Route, failure?: unknown): Promise<void> {
  standIn.currentRoute.value = to
  for (const hook of [...standIn.hooks]) hook(to, from, failure)
  await flushPromises()
}

beforeEach(() => {
  original = config().backend
  // A new account, a minute old, that has not been through the first run.
  const backend = createBackendMock({ user: { createdAt: new Date(Date.now() - 60_000) } })
  backend.state.queries['account:getOnboarding'] = { onboardedAt: null }
  backend.state.queries['account:getConsents'] = { consents: [], missing: [], storage: null, minimumAge: null }
})
afterEach(() => {
  config().backend = original
  resetBackendMock()
})

describe('the onboarding-redirect plugin', { timeout: 20_000 }, () => {
  it('starts at once on a page that asks for a sign-in, and leads a new account to the first run', async () => {
    const standIn = start(page('/studio', true))
    // The watch loads on demand: the first load is a cold transform under the test runner.
    await vi.waitFor(() => expect(standIn.push).toHaveBeenCalledWith({ path: '/welcome', query: { redirect: '/studio' } }), { timeout: 15_000 })
  })

  it('waits on a public page, and starts on the first page after it that asks for a sign-in', async () => {
    const standIn = start(page('/'))
    await navigate(standIn, page('/pricing'), page('/'))
    await flushPromises()
    expect(standIn.push).not.toHaveBeenCalled()

    await navigate(standIn, page('/studio', true), page('/pricing'))
    await vi.waitFor(() => expect(standIn.push).toHaveBeenCalledWith({ path: '/welcome', query: { redirect: '/studio' } }), { timeout: 15_000 })
  })

  it('starts on the first page after the configured sign-in page, a public one too', async () => {
    const standIn = start(page('/signin'), { login: '/signin' })
    // A failed navigation away from it leaves the person where they were.
    await navigate(standIn, page('/pricing'), page('/signin'), new Error('aborted'))
    await navigate(standIn, page('/pricing'), page('/login'))
    expect(standIn.push).not.toHaveBeenCalled()

    await navigate(standIn, page('/pricing'), page('/signin/'))
    await vi.waitFor(() => expect(standIn.push).toHaveBeenCalledWith({ path: '/welcome', query: { redirect: '/pricing' } }), { timeout: 15_000 })
  })

  it('mounts nothing while the first run is turned off', async () => {
    const standIn = start(page('/studio', true), { welcome: false })
    expect(standIn.hooks).toEqual([])
    await flushPromises()
    expect(standIn.push).not.toHaveBeenCalled()
  })
})
