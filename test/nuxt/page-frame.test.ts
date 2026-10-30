import { afterEach, describe, expect, it, vi } from 'vitest'
import { Comment, computed, h, nextTick, ref, toValue, type Component, type MaybeRefOrGetter } from 'vue'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { BACKEND_PAGE_DEFS } from '../../src/pages'
import BackendPageFrame from '../../src/runtime/vue/components/shell/PageFrame.vue'
import ConnectionStatus from '../../src/runtime/vue/components/shell/ConnectionStatus.vue'
import MaintenanceBanner from '../../src/runtime/vue/components/shell/NoticeMaintenance.vue'
import { ConvexClientKey } from 'nuxt-convex-module/client'
import { registerComponents } from '../helpers/register-components'

// The module-page frame registry: every page the module mounts renders
// through the one frame, so a region the frame gains (a banner, the account
// nav) reaches every page at once. A new page that builds its own <main>
// fails here.

vi.mock('nuxt-convex-module/better-auth/client', async () => ({
  // The real redirect check: the module itself would pull in the app's auth client.
  resolveAuthRedirect: (await import('../../node_modules/nuxt-convex-module/dist/runtime/better-auth/vue/redirect.js')).resolveAuthRedirect,
  // The session the frame's banners read: an administrator's visit while `impersonating`.
  useBetterAuth: () => ({ session: computed(() => ({ data: impersonating.value ? { session: { impersonatedBy: 'root' } } : null })) }),
}))
const { impersonating } = vi.hoisted(() => ({ impersonating: { value: false } }))
// The maintenance switch, as the flags read it: its message while on.
const maintenance = ref<{ message: string } | null>(null)
vi.mock('../../src/runtime/vue/composables/use-flags', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  useMaintenanceNotice: () => computed(() => maintenance.value),
}))
vi.mock('../../src/runtime/vue/utils/auth-session', () => ({ useAuthSession: () => ({
  isAuthenticated: computed(() => false),
  isLoading: computed(() => true),
  isImpersonating: computed(() => impersonating.value),
  isPending: computed(() => false),
  error: computed(() => null),
  user: computed(() => ({ id: 'ada', name: 'Ada' })),
  session: computed(() => ({ data: { session: { impersonatedBy: 'root' } } })),
}),
}))

// Each test's pages go when it ends: a banner switched on later re-renders no page of an earlier one.
enableAutoUnmount(afterEach)

const { useHead } = vi.hoisted(() => ({ useHead: vi.fn() }))
mockNuxtImport('useHead', () => useHead)

// The pages' own components are someone else's test: here they are stubs.
const stubs = Object.fromEntries(['AuthForm', 'ProfileSettings', 'SecuritySettings', 'AcceptInvitation', 'PricingTable', 'WorkspaceSettings', 'AdminConsole', 'InviteRedeem', 'WaitlistStatus', 'KeepAccount', 'EmailUnsubscribe', 'OnboardingFlow', 'ReportNotice', 'GiftList', 'ReferralLanding', 'LegalDocument']

  .map(name => [name, { name, render: () => h('div', { 'data-stub': name }) }]))

// Registered by name, as Nuxt registers them, so the stubs above take the pages' tags.
await registerComponents('PageFrame', ...BACKEND_PAGE_DEFS.map(def => `page:${def.file}`))

const pages = await Promise.all(BACKEND_PAGE_DEFS.map(async def => ({
  key: def.key,
  Page: (await import(`../../src/runtime/vue/pages/${def.file}.vue`) as { default: Component }).default,
})))

describe('the module-page frame', () => {
  it('covers every page in the registry', () => {
    expect(pages.map(page => page.key).sort()).toEqual(['acceptInvitation', 'accessibility', 'admin', 'gifts', 'invite', 'keepAccount', 'login', 'pricing', 'privacy', 'profile', 'referral', 'report', 'security', 'settings', 'subprocessors', 'terms', 'unsubscribe', 'waitlist', 'welcome'])
  })

  it.each(pages)('$key declares the document\'s language: the labels\' own without @nuxtjs/i18n', ({ Page }) => {
    // axe's html-has-lang: a packaged page passes it in an app that declares no language.
    useHead.mockClear()
    mount(Page, { global: { stubs } })
    const head = useHead.mock.calls.at(-1)?.[0] as { htmlAttrs?: { lang?: MaybeRefOrGetter<string> } }
    expect(toValue(head.htmlAttrs?.lang)).toBe('en')
  })

  it.each(pages)('$key keeps itself out of search indexes with a robots tag only when it is public and reads a token from its link', ({ key, Page }) => {
    // A private page has the noindex plugin's tag (test/nuxt/noindex.test.ts); a public page that reads a token from its link (the sign-in code, an access link, a waitlist status link, the keep link) asks the frame for its own.
    useHead.mockClear()
    mount(Page, { global: { stubs } })
    const head = useHead.mock.calls.at(-1)?.[0] as { meta?: MaybeRefOrGetter<unknown> }
    expect(toValue(head.meta), key).toEqual(BACKEND_PAGE_DEFS.find(def => def.key === key)!.noindex ? [{ name: 'robots', content: 'noindex, nofollow' }] : [])
  })

  it.each(pages)('$key renders through it, with a title', ({ key, Page }) => {
    useHead.mockClear()
    const wrapper = mount(Page, { global: { stubs } })
    const frame = wrapper.findComponent(BackendPageFrame)
    expect(frame.exists()).toBe(true)
    expect(wrapper.element.tagName).toBe('MAIN')
    expect(wrapper.attributes('data-backend-page')).toBe(key)
    expect(wrapper.find('[data-stub]').exists()).toBe(true)
    const title = toValue((useHead.mock.calls.at(-1)?.[0] as { title: MaybeRefOrGetter<string> }).title)
    expect(title).toBe(frame.props('title'))
    expect(title.length).toBeGreaterThan(0)
  })

  it('renders the banner and nav regions only with content, before the main landmark', () => {
    const empty = mount(BackendPageFrame, {
      props: { page: 'profile', family: 'profile', title: 'Profile' },
      // A region whose `v-if` is off renders a comment, which is no content.
      slots: { banner: () => [h(Comment, 'v-if')] },
    })
    // One root element: a page transition needs one.
    expect(empty.element.tagName).toBe('MAIN')
    expect(empty.findAll('[data-backend-region]').map(region => region.attributes('data-backend-region'))).toEqual(['status'])
    expect(empty.find('h1[data-profile="title"]').text()).toBe('Profile')
    expect(empty.attributes('data-profile')).toBe('page')

    const filled = mount({
      render: () => h('div', h(BackendPageFrame, { page: 'profile', family: 'profile', title: 'Profile', heading: false }, {
        banner: () => h('p', 'Impersonating Ada'),
        status: () => h('p', 'Connected'),
        default: () => h('section', 'page'),
      })),
    })
    const order = [...filled.element.children].map(child => child.getAttribute('data-backend-region') ?? child.tagName)
    expect(order).toEqual(['banner', 'MAIN'])
    expect(filled.find('[data-backend-region="banner"]').text()).toBe('Impersonating Ada')
    expect(filled.find('main h1').exists()).toBe(false)
    expect(filled.find('main > section').text()).toBe('page')
    // A page's own status replaces the connection status.
    expect(filled.find('main > [data-backend-region="status"]').text()).toBe('Connected')
    expect(filled.find('[data-connection]').exists()).toBe(false)
  })

  it('shows an administrator\'s visit in the notices region of every page, first of the notices', () => {
    impersonating.value = true
    try {
      const frame = mount({ render: () => h('div', h(BackendPageFrame, { page: 'security', family: 'security', title: 'Security' })) })
      const order = [...frame.element.children].map(child => child.getAttribute('data-backend-region') ?? child.tagName)
      expect(order).toEqual(['banner', 'MAIN'])
      const banner = frame.find('[data-backend-region="banner"] [data-notices="region"] > aside[data-impersonation="banner"]')
      expect(banner.find('[data-impersonation="message"]').text()).toBe('You are acting as Ada.')
      // A page that fills the region itself replaces the banners.
      const own = mount({ render: () => h('div', h(BackendPageFrame, { page: 'security', family: 'security', title: 'Security' }, { banner: () => h('p', 'Maintenance') })) })
      expect(own.find('[data-backend-region="banner"]').text()).toBe('Maintenance')
    }
    finally {
      impersonating.value = false
    }
  })

  it('keeps the notices in one region, in priority order: an administrator\'s visit, then maintenance', async () => {
    const regionOf = (frame: ReturnType<typeof mount>) => frame.findAll('[data-backend-region="banner"] [data-notices="region"] > aside').map(banner => banner.attributes('aria-label'))
    const frame = mount({ render: () => h('div', h(BackendPageFrame, { page: 'settings', family: 'settings', title: 'Settings' })) })
    expect(frame.find('[data-backend-region="banner"]').exists()).toBe(false)
    maintenance.value = { message: 'Back at 3 pm.' }
    await nextTick()
    expect(regionOf(frame)).toEqual(['Maintenance'])
    expect(frame.find('[data-maintenance="message"]').text()).toBe('Back at 3 pm.')
    impersonating.value = true
    try {
      const both = mount({ render: () => h('div', h(BackendPageFrame, { page: 'settings', family: 'settings', title: 'Settings' })) })
      expect(regionOf(both)).toEqual(['Administrator visit', 'Maintenance'])
    }
    finally {
      impersonating.value = false
      maintenance.value = null
    }
    await nextTick()
    // Turned off, it goes without a reload.
    expect(frame.find('[data-backend-region="banner"]').exists()).toBe(false)
  })

  it('shows one maintenance banner however many are mounted: the layout\'s, and the frame\'s stands aside', async () => {
    maintenance.value = { message: '' }
    try {
      const page = mount({ render: () => h('div', [h(MaintenanceBanner), h(BackendPageFrame, { page: 'profile', family: 'profile', title: 'Profile' })]) })
      const banners = page.findAll('aside[data-maintenance="banner"]')
      expect(banners).toHaveLength(1)
      // No message of the administrator's: the default sentence.
      expect(banners[0]!.text()).toBe('We\'re doing maintenance. Some things may not work for a little while.')
    }
    finally {
      maintenance.value = null
    }
  })

  it('closes every page with the connection status: an empty live region while connected', () => {
    const frame = mount(BackendPageFrame, { props: { page: 'settings', family: 'settings', title: 'Settings' } })
    const status = frame.find('main > [data-backend-region="status"]:last-child [data-connection="status"]')
    expect(status.exists()).toBe(true)
    expect(status.attributes()).toMatchObject({ 'role': 'status', 'aria-live': 'polite', 'data-state': 'online' })
    expect(status.text()).toBe('')
  })

  it('opens no connection on a page that runs nothing: the sign-in page for a signed-out visitor', async () => {
    // The base client opens its socket the first time `sync` is read, which
    // asking it for its connection state does.
    const reads = { sync: 0 }
    const client = {
      cachedSync: undefined,
      get sync() {
        reads.sync++
        return { connectionState: () => ({}), subscribeToConnectionState: (_callback: () => void) => () => {} }
      },
      connectionState() {
        return client.sync.connectionState()
      },
      subscribeToConnectionState(callback: () => void) {
        return client.sync.subscribeToConnectionState(callback)
      },
    }
    vi.useFakeTimers()
    try {
      const login = pages.find(page => page.key === 'login')!.Page
      const wrapper = mount(login, { global: { stubs, provide: { [ConvexClientKey as symbol]: client } } })
      await vi.advanceTimersByTimeAsync(10_000)
      expect(wrapper.find('[data-connection="status"]').exists()).toBe(true)
      expect(reads.sync).toBe(0)
      wrapper.unmount()
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('says a drop once when the app\'s layout shows a status of its own around the page', async () => {
    const wrapper = mount({
      render: () => h('div', [
        h(BackendPageFrame, { page: 'settings', family: 'settings', title: 'Settings' }),
        h(ConnectionStatus),
      ]),
    })
    await nextTick()
    // Offline: the app's status says so; the frame's live region stays mounted and says nothing.
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    window.dispatchEvent(new Event('offline'))
    await nextTick()
    const statuses = wrapper.findAll('[data-connection="status"]')
    expect(statuses).toHaveLength(2)
    expect(statuses.map(status => status.text())).toEqual(['', 'You\'re offline.'])
    vi.restoreAllMocks()
    window.dispatchEvent(new Event('online'))
    wrapper.unmount()
  })
})
