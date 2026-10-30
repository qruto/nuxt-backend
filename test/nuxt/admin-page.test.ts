import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, reactive } from 'vue'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

// The ready-made admin page as the frame of the app's own tabs: the tabs it
// reads off the router, the page it shows in the console, and where a tab
// click goes. The console itself is admin.test.ts's.

enableAutoUnmount(afterEach)

const { navigateTo } = vi.hoisted(() => ({ navigateTo: vi.fn() }))
mockNuxtImport('navigateTo', () => navigateTo)

/** The route the page sits on. */
const route = reactive({ path: '/admin', query: {} as Record<string, string>, matched: [{ path: '/admin' }] as Array<{ path: string }> })
mockNuxtImport('useRoute', () => () => route)

// The router's table is the app's own: its pages are the tabs. The rest of
// the router is Nuxt's.
const routes = [
  { path: '/admin', meta: {} },
  { path: '/admin/featured', meta: { adminTab: { label: 'Featured', order: 25 } } },
  { path: '/admin/queue', meta: { adminTab: { label: 'Queue' } } },
  { path: '/admin/notes', meta: {} },
]
mockNuxtImport('useRouter', original => () => new Proxy((original as () => object)(), { get: (router, key) => (key === 'getRoutes' ? () => routes : Reflect.get(router, key)) }))

// The console and the frame are stubs: the page's work is what it hands them.
vi.mock('../../src/runtime/vue/components/admin/AdminConsole.vue', () => ({
  default: defineComponent({
    name: 'AdminConsole',
    props: ['tab', 'appTabs', 'page', 'pageTab'],
    emits: ['update:tab', 'open'],
    setup: (_props, { slots }) => () => h('div', { 'data-stub': 'console' }, slots.default?.()),
  }),
}))
vi.mock('../../src/runtime/vue/components/shell/PageFrame.vue', () => ({
  default: defineComponent({ name: 'PageFrame', setup: (_props, { slots }) => () => h('main', slots.default?.()) }),
}))

const { default: AdminPage } = await import('../../src/runtime/vue/pages/admin.vue')
const consoleProps = (wrapper: ReturnType<typeof mount>) => wrapper.findComponent({ name: 'AdminConsole' }).props() as { tab?: string, appTabs: Array<{ key: string }>, page: boolean, pageTab?: string }
const mountPage = () => mount(AdminPage, { global: { stubs: { NuxtPage: { render: () => h('i', { 'data-stub': 'page' }) } } } })

function at(path: string, matched: string[], query: Record<string, string> = {}) {
  route.path = path
  route.query = query
  route.matched = matched.map(entry => ({ path: entry }))
}

describe('the admin page', () => {
  it('hands the console the app\'s tabs from the router, in order, and the address\'s tab', () => {
    at('/admin', ['/admin'], { tab: 'flags' })
    const props = consoleProps(mountPage())
    expect(props.appTabs.map(tab => tab.key)).toEqual(['app:featured', 'app:queue'])
    expect(props).toMatchObject({ tab: 'flags', page: false, pageTab: undefined })
  })

  it('shows a child page in the console, its tab selected', () => {
    at('/admin/featured/12', ['/admin', '/admin/featured'])
    expect(consoleProps(mountPage())).toMatchObject({ page: true, pageTab: 'app:featured' })
    expect(mountPage().find('[data-stub="page"]').exists()).toBe(true)
  })

  it('shows a child page that names no tab with no tab selected', () => {
    at('/admin/notes', ['/admin', '/admin/notes'])
    expect(consoleProps(mountPage())).toMatchObject({ page: true, pageTab: undefined })
  })

  it('takes its tabs from the path it is mounted at', () => {
    at('/fr/admin', ['/fr/admin'])
    expect(consoleProps(mountPage()).appTabs).toEqual([])
  })

  it('opens an app tab at its address, a built-in tab by replacing the address\'s tab', async () => {
    navigateTo.mockClear()
    at('/admin', ['/admin'], { tab: 'users', q: 'ada' })
    const wrapper = mountPage()
    const console = wrapper.findComponent({ name: 'AdminConsole' })
    await console.vm.$emit('open', '/admin/queue')
    expect(navigateTo).toHaveBeenLastCalledWith('/admin/queue')
    await console.vm.$emit('update:tab', 'flags')
    expect(navigateTo).toHaveBeenLastCalledWith({ path: '/admin', query: { tab: 'flags', q: 'ada' } }, { replace: true })
  })

  it('leaves a child page for a built-in tab with a new history entry and a clean address', async () => {
    navigateTo.mockClear()
    at('/admin/featured', ['/admin', '/admin/featured'], { page: '2' })
    await mountPage().findComponent({ name: 'AdminConsole' }).vm.$emit('update:tab', 'system')
    expect(navigateTo).toHaveBeenLastCalledWith({ path: '/admin', query: { tab: 'system' } }, { replace: false })
  })
})
