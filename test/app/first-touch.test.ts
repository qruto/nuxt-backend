import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useNuxtApp } from '#imports'
import { backendError } from '../../src/convex/errors'
import { createBackendMock, resetBackendMock, type BackendMock } from '../../src/runtime/test-utils'

// The growth funnel's first-touch plugin on the test's own Nuxt app, over
// the backend mock: on an address with `utm_*` parameters, a signed-in
// person's campaign goes to `recordSource` once, when the app mounts and
// after each navigation between pages. The plugin's router is a stand-in
// (the app's own everywhere else): the test app's matches no page, and a
// navigation is told apart from the first load by the page it leaves.

type Hook = (to: unknown, from: { matched: unknown[] }) => void
const router = vi.hoisted(() => ({
  /** While the plugin starts: its `useRouter()` is the stand-in. */
  starting: false,
  hooks: [] as Hook[],
  current: { value: { query: {} as Record<string, unknown> } },
}))
mockNuxtImport('useRouter', original => () => router.starting
  ? {
      currentRoute: router.current,
      afterEach: (hook: Hook) => {
        router.hooks.push(hook)
        return () => {}
      },
    }
  : (original as () => unknown)())
const current = router.current

const { default: plugin } = await import('../../src/runtime/vue/plugins/first-touch')

// The claim loads on demand: its first load is a cold transform under the test runner.
const LOADED = { timeout: 15_000 }
const RECORD = 'audit:recordSource'
const TAGGED = { utm_source: 'newsletter', utm_campaign: 'launch', ref: 'ignored' }
const TOUCH = { touch: { source: 'newsletter', campaign: 'launch' } }

// The page remembers which campaigns it sent, by account, for as long as it is open: a new account per test.
let account = 0
let backend: BackendMock
let mounted: () => Promise<void>

/** Install the plugin on the app, as Nuxt does at start, with the person `user` says signed in. */
function start(user: Record<string, unknown> | null = {}, init: Parameters<typeof createBackendMock>[0] = {}): void {
  router.hooks.length = 0
  backend = createBackendMock({ ...init, ...(user ? { user: { id: `user-${++account}`, ...user } } : {}) })
  backend.stub(RECORD, () => ({ source: 'newsletter' }))
  const nuxtApp = useNuxtApp()
  const hooks: Array<() => void> = []
  const app = Object.assign(Object.create(nuxtApp), { hook: (name: string, run: () => void) => (name === 'app:mounted' ? hooks.push(run) : undefined) })
  router.starting = true
  try {
    nuxtApp.runWithContext(() => (plugin as unknown as { setup: (app: unknown) => void }).setup(app))
  }
  finally {
    router.starting = false
  }
  mounted = async () => {
    for (const run of hooks) run()
    await flushPromises()
  }
}

/** A navigation from one page to another, as the router's `afterEach` reports it. */
async function navigate(query: Record<string, unknown>, fromPage = true): Promise<void> {
  current.value = { query }
  for (const hook of router.hooks) hook({}, { matched: fromPage ? [{}] : [] })
  await flushPromises()
}

beforeEach(() => {
  router.hooks.length = 0
  current.value = { query: {} }
})
afterEach(() => resetBackendMock())

describe('the first-touch plugin', { timeout: 20_000 }, () => {
  it('sends a signed-in person\'s campaign once the app mounts on an address that carries one', async () => {
    current.value = { query: TAGGED }
    start()
    await mounted()
    await vi.waitFor(() => expect(backend.callsTo(RECORD)).toEqual([TOUCH]), LOADED)
  })

  it('sends nothing for an address without utm parameters', async () => {
    current.value = { query: { ref: 'ADA123', discount: 'LAUNCH' } }
    start()
    await mounted()
    await navigate({ page: '2' })
    // The next tagged page is the first that sends.
    await navigate(TAGGED)
    await vi.waitFor(() => expect(backend.callsTo(RECORD)).toEqual([TOUCH]), LOADED)
  })

  it('checks each navigation between pages, but not the app\'s first one, which the mount covers', async () => {
    start()
    await mounted()
    await navigate({ utm_source: 'first-load' }, false)
    await navigate(TAGGED)
    await vi.waitFor(() => expect(backend.callsTo(RECORD)).toEqual([TOUCH]), LOADED)
  })

  it('sends a campaign once per account, and another campaign or another account again', async () => {
    start()
    await navigate(TAGGED)
    await navigate(TAGGED)
    await vi.waitFor(() => expect(backend.callsTo(RECORD)).toHaveLength(1), LOADED)
    await navigate({ utm_source: 'podcast' })
    await vi.waitFor(() => expect(backend.callsTo(RECORD)).toEqual([TOUCH, { touch: { source: 'podcast' } }]), LOADED)

    backend.signIn({ id: `user-${++account}` })
    await navigate(TAGGED)
    await vi.waitFor(() => expect(backend.callsTo(RECORD)).toHaveLength(3), LOADED)
  })

  it('waits for the session to load before it decides', async () => {
    start({}, { isLoading: true })
    await navigate(TAGGED)
    expect(backend.callsTo(RECORD)).toEqual([])
    backend.state.isLoading = false
    await vi.waitFor(() => expect(backend.callsTo(RECORD)).toEqual([TOUCH]), LOADED)
  })

  it('sends nothing for a visitor, nor during an administrator\'s visit to the account', async () => {
    start(null)
    await navigate(TAGGED)
    // Signed in, the same address sends: the visitor's look sent nothing.
    backend.signIn({ id: `user-${++account}` })
    await navigate(TAGGED)
    await vi.waitFor(() => expect(backend.callsTo(RECORD)).toEqual([TOUCH]), LOADED)

    start({}, { session: { impersonatedBy: 'u_admin' } })
    await navigate(TAGGED)
    backend.state.session.impersonatedBy = null
    await navigate(TAGGED)
    await vi.waitFor(() => expect(backend.callsTo(RECORD)).toEqual([TOUCH]), LOADED)
  })

  it('tries a campaign that failed to send again on the next page', async () => {
    start()
    backend.fail(RECORD, backendError('unavailable', { service: 'backend', reason: 'unexpected' }))
    await navigate(TAGGED)
    await vi.waitFor(() => expect(backend.callsTo(RECORD)).toHaveLength(1), LOADED)
    backend.stub(RECORD, () => ({ source: 'newsletter' }))
    await navigate(TAGGED)
    await vi.waitFor(() => expect(backend.callsTo(RECORD)).toEqual([TOUCH, TOUCH]), LOADED)
  })
})
