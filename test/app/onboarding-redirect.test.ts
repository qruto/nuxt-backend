import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { useNuxtApp } from '#imports'
import { defineComponent, h, ref } from 'vue'
import { createBackendMock, type BackendMock } from '../../src/runtime/test-utils'
import { leavesAlone, ONBOARDING_REDIRECT_WINDOW_MS, watchOnboarding } from '../../src/runtime/vue/utils/onboarding-redirect'

// The one redirect that leads a new account to /welcome: right after
// sign-up, after the required consents, never during an administrator's
// visit, never in the middle of an invitation or a sign-in, and only once.

let backend: BackendMock
const route = ref({ path: '/studio', fullPath: '/studio' })
const goTo = (path: string, fullPath = path) => {
  route.value = { path, fullPath }
}
const push = vi.fn(async () => {})

const DAY = 24 * 60 * 60 * 1000
const consents = (missing: string[] = []) => ({ consents: [], missing, storage: null, minimumAge: null })

const stops: Array<() => void> = []
afterEach(() => {
  for (const stop of stops.splice(0)) stop()
})

/** Start the watch inside the app, as the plugin does once a page asks for a sign-in. */
async function start(): Promise<void> {
  let nuxtApp!: ReturnType<typeof useNuxtApp>
  await mountSuspended(defineComponent({
    setup() {
      nuxtApp = useNuxtApp()
      return () => h('div')
    },
  }))
  stops.push(watchOnboarding({ nuxtApp, router: { currentRoute: route as never, push } }))
  await flushPromises()
}

beforeEach(() => {
  push.mockClear()
  goTo('/studio')
  backend = createBackendMock({ user: { createdAt: new Date(Date.now() - 60_000) } })
  backend.state.queries['account:getOnboarding'] = { onboardedAt: null }
  backend.state.queries['account:getConsents'] = consents()
})

describe('the redirect to the first run', () => {
  it('leads a new account that has not finished it to /welcome, once', async () => {
    await start()
    expect(push).toHaveBeenCalledTimes(1)
    // The page they were headed for comes back once the first run is over.
    expect(push).toHaveBeenCalledWith({ path: '/welcome', query: { redirect: '/studio' } })
    // The person is free to go anywhere after: nothing sends them back.
    backend.state.queries['account:getOnboarding'] = { onboardedAt: null, again: true }
    goTo('/pricing')
    await flushPromises()
    expect(push).toHaveBeenCalledTimes(1)
  })

  it('carries the whole address, query included, and none for the home page', async () => {
    goTo('/studio', '/studio?strip=3')
    await start()
    expect(push).toHaveBeenCalledWith({ path: '/welcome', query: { redirect: '/studio?strip=3' } })
    stops.splice(0).forEach(stop => stop())
    push.mockClear()
    goTo('/', '/')
    await start()
    expect(push).toHaveBeenCalledWith('/welcome')
  })

  it('waits for the required consents: terms first, then onboarding', async () => {
    backend.state.queries['account:getConsents'] = consents(['terms'])
    await start()
    expect(push).not.toHaveBeenCalled()
    backend.state.queries['account:getConsents'] = consents([])
    await flushPromises()
    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith({ path: '/welcome', query: { redirect: '/studio' } })
  })

  it('waits while the consents are still being read', async () => {
    delete backend.state.queries['account:getConsents']
    await start()
    expect(push).not.toHaveBeenCalled()
  })

  it('never sends an account that finished or skipped it', async () => {
    backend.state.queries['account:getOnboarding'] = { onboardedAt: 1_000 }
    await start()
    expect(push).not.toHaveBeenCalled()
  })

  it('never sends anyone while an administrator visits the account', async () => {
    backend = createBackendMock({ user: { createdAt: new Date() }, session: { impersonatedBy: 'admin-1' } })
    backend.state.queries['account:getOnboarding'] = { onboardedAt: null }
    backend.state.queries['account:getConsents'] = consents()
    await start()
    expect(push).not.toHaveBeenCalled()
  })

  it('never sends an account created more than a day ago', async () => {
    backend = createBackendMock({ user: { createdAt: new Date(Date.now() - ONBOARDING_REDIRECT_WINDOW_MS - 1_000) } })
    backend.state.queries['account:getOnboarding'] = { onboardedAt: null }
    backend.state.queries['account:getConsents'] = consents()
    await start()
    expect(push).not.toHaveBeenCalled()
  })

  it('never sends a visitor, and starts when the person signs in', async () => {
    backend.signOut()
    await start()
    expect(push).not.toHaveBeenCalled()
    backend.signIn({ createdAt: new Date() } as never)
    await flushPromises()
    expect(push).toHaveBeenCalledTimes(1)
  })

  it.each(['/welcome', '/accept-invitation', '/login', '/invite', '/waitlist', '/account/keep', '/fr/welcome'])('leaves a person on %s where they are', async (here) => {
    goTo(here)
    await start()
    expect(push).not.toHaveBeenCalled()
  })

  it('waits on the sign-in page, and leads the person from the page they go on to', async () => {
    // The account is known before the sign-in page hands over.
    goTo('/login')
    await start()
    expect(push).not.toHaveBeenCalled()
    goTo('/studio')
    await flushPromises()
    expect(push).toHaveBeenCalledWith({ path: '/welcome', query: { redirect: '/studio' } })
  })

  it('does not lead anyone later to the first run they were spared on a page of an invitation', async () => {
    goTo('/accept-invitation')
    await start()
    goTo('/studio')
    await flushPromises()
    expect(push).not.toHaveBeenCalled()
  })
})

describe('leavesAlone', () => {
  it('matches a page and its localized copy, and nothing else', () => {
    expect(leavesAlone('/welcome', ['/welcome'])).toBe(true)
    expect(leavesAlone('/welcome/', ['/welcome'])).toBe(true)
    expect(leavesAlone('/fr/welcome', ['/welcome'])).toBe(true)
    expect(leavesAlone('/studio', ['/welcome', null, '/login'])).toBe(false)
    expect(leavesAlone('/', ['/'])).toBe(true)
    expect(leavesAlone('/studio/welcome-back', ['/welcome'])).toBe(false)
  })

  it('knows the window is a day', () => {
    expect(ONBOARDING_REDIRECT_WINDOW_MS).toBe(DAY)
  })
})
