import { describe, expect, it } from 'vitest'
import { activeAppTab, ADMIN_TABS, adminAppTabs, DEFAULT_APP_TAB_ORDER, readAdminTab, sortAdminTabs } from '../../src/runtime/vue/components/admin/admin-tabs'
import { adoptChildPages } from '../../src/pages'

// The admin console's own tabs: what `adminTab` in page meta says, which
// routes become tabs, the order they sort in, and how the module nests the
// app's pages below the console.

const route = (path: string, adminTab?: unknown) => ({ path, meta: adminTab === undefined ? {} : { adminTab } })

describe('readAdminTab', () => {
  it('takes a label, and an icon and an order when they are well formed', () => {
    expect(readAdminTab({ label: 'Featured', icon: 'i-lucide-star', order: 15 })).toEqual({ label: 'Featured', icon: 'i-lucide-star', order: 15 })
    expect(readAdminTab({ label: 'Queue' })).toEqual({ label: 'Queue' })
  })

  it('refuses anything without a label, and drops what is malformed', () => {
    for (const value of [undefined, null, 'Featured', true, [], {}, { label: '' }, { label: '  ' }, { label: 4 }, { icon: 'i-lucide-star' }]) {
      expect(readAdminTab(value), JSON.stringify(value)).toBeNull()
    }
    expect(readAdminTab({ label: 'A', icon: 3, order: Number.NaN })).toEqual({ label: 'A' })
    expect(readAdminTab({ label: 'A', icon: '', order: '3' })).toEqual({ label: 'A' })
  })
})

describe('adminAppTabs', () => {
  const routes = [
    route('/admin'),
    route('/admin/featured', { label: 'Featured', icon: 'i-lucide-star', order: 25 }),
    route('/admin/reports/', { label: 'Reports' }),
    route('/admin/queue/strips', { label: 'Strip queue', order: 25 }),
    route('/admin/hidden-tool'),
    route('/admin/users/:id()', { label: 'Account' }),
    route('/administrators', { label: 'Not below the console' }),
    route('/other/featured', { label: 'Elsewhere' }),
    route('/admin/featured', { label: 'Featured again' }),
    route('/admin/broken', { icon: 'i-lucide-star' }),
  ]

  it('lists the pages below the console that name a tab, ordered, equal orders by label', () => {
    expect(adminAppTabs(routes, '/admin')).toEqual([
      { key: 'app:featured', path: '/admin/featured', label: 'Featured', icon: 'i-lucide-star', order: 25 },
      { key: 'app:queue/strips', path: '/admin/queue/strips', label: 'Strip queue', icon: undefined, order: 25 },
      { key: 'app:reports', path: '/admin/reports', label: 'Reports', icon: undefined, order: DEFAULT_APP_TAB_ORDER },
    ])
  })

  it('follows the console wherever it is mounted', () => {
    expect(adminAppTabs([route('/staff/tools', { label: 'Tools' }), route('/admin/x', { label: 'X' })], '/staff/').map(tab => tab.path)).toEqual(['/staff/tools'])
    expect(adminAppTabs([route('/fr/admin/outils', { label: 'Outils' })], '/fr/admin').map(tab => tab.key)).toEqual(['app:outils'])
  })

  it('puts a tab without an order after every built-in one', () => {
    expect(Math.max(...ADMIN_TABS.map(tab => tab.order))).toBeLessThan(DEFAULT_APP_TAB_ORDER)
    expect(new Set(ADMIN_TABS.map(tab => tab.order)).size).toBe(ADMIN_TABS.length)
  })
})

describe('sortAdminTabs', () => {
  it('sorts by order, then label, without touching its input', () => {
    const tabs = [{ order: 20, label: 'B' }, { order: 10, label: 'Z' }, { order: 20, label: 'A' }]
    expect(sortAdminTabs(tabs).map(tab => tab.label)).toEqual(['Z', 'A', 'B'])
    expect(tabs.map(tab => tab.label)).toEqual(['B', 'Z', 'A'])
  })
})

describe('activeAppTab', () => {
  const tabs = [{ path: '/admin/queue' }, { path: '/admin/queue/strips' }, { path: '/admin/featured' }]

  it('is the tab whose page it is, or a page below it, the deepest first', () => {
    expect(activeAppTab(tabs, '/admin/featured')).toBe(tabs[2])
    expect(activeAppTab(tabs, '/admin/featured/12/')).toBe(tabs[2])
    expect(activeAppTab(tabs, '/admin/queue/strips/9')).toBe(tabs[1])
    expect(activeAppTab(tabs, '/admin/queue/other')).toBe(tabs[0])
  })

  it('is none for a page the bar does not list', () => {
    expect(activeAppTab(tabs, '/admin')).toBeUndefined()
    expect(activeAppTab(tabs, '/admin/featured-soon')).toBeUndefined()
  })
})

describe('adoptChildPages', () => {
  interface Page { name: string, path: string, children?: Page[] }
  const admin = (): Page => ({ name: 'backend-admin', path: '/admin' })

  it('moves the pages below a path into the page mounted there, as relative children', () => {
    const parent = admin()
    const pages: Page[] = [{ name: 'a', path: '/admin/featured' }, parent, { name: 'b', path: '/admin/queue/', children: [{ name: 'b1', path: ':id()' }] }, { name: 'c', path: '/about' }, { name: 'd', path: '/administrators' }]
    expect(adoptChildPages(pages, parent, '/admin')).toEqual(['/admin/featured', '/admin/queue'])
    expect(pages.map(page => page.name)).toEqual(['backend-admin', 'c', 'd'])
    expect(parent.children).toEqual([{ name: 'a', path: 'featured' }, { name: 'b', path: 'queue', children: [{ name: 'b1', path: ':id()' }] }])
  })

  it('nests nothing under the site root, and nothing when no page is below', () => {
    const parent = { name: 'root', path: '/' }
    const pages: Page[] = [parent, { name: 'a', path: '/about' }]
    expect(adoptChildPages(pages, parent, '/')).toEqual([])
    expect(adoptChildPages(pages, admin(), '/admin')).toEqual([])
    expect(pages).toHaveLength(2)
    expect((parent as Page).children).toBeUndefined()
  })
})
