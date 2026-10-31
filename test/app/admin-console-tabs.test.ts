import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { useRuntimeConfig } from '#imports'
import { createBackendMock, resetBackendMock } from '../../src/runtime/test-utils'
import { ADMIN_TABS } from '../../src/runtime/vue/components/admin/admin-tabs'
import { registerComponents } from '../helpers/register-components'

await registerComponents('AdminConsole')
const { default: AdminConsole } = await import('../../src/runtime/vue/components/admin/AdminConsole.vue')

// The admin console's built-in tabs over the backend mock, which exports
// every function a tab reads: each tab shows, the two a setting turns on
// (Reports, Queue) only once the public runtime config says so, and each
// opens its own panel, loaded the first time it is picked.

enableAutoUnmount(afterEach)

const config = () => useRuntimeConfig().public as Record<string, unknown>
let original: unknown
beforeEach(() => {
  original = config().backend
  const backend = createBackendMock({ user: { role: 'admin' } })
  // The actions a tab runs as it opens (the Waitlist tab's caps, the Analytics tab's revenue): nothing to show here.
  for (const name of ['waitlist:getWaitlistCaps', 'billing:getRevenue']) backend.stub(name, () => null)
})
afterEach(() => {
  config().backend = original
  resetBackendMock()
})

async function adminConsole(settings: Record<string, unknown> = {}): Promise<VueWrapper> {
  config().backend = { ...(original as object), ...settings }
  const wrapper = await mountSuspended(AdminConsole, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

const labels = (wrapper: VueWrapper) => wrapper.findAll('[role="tab"]').map(tab => tab.text())

describe('the admin console\'s built-in tabs', () => {
  it('lists every tab whose backend file the app has, and the Reports and Queue tabs only once the app turns them on', async () => {
    const all = ['Users', 'Workspaces', 'Activity', 'Flags', 'Access', 'Waitlist', 'Announcements', 'Inbox', 'Referrals', 'Billing', 'Costs', 'Analytics', 'Webhooks', 'Suppressions', 'System']
    expect(labels(await adminConsole())).toEqual(all)
    expect(labels(await adminConsole({ reports: true, jobs: true }))).toEqual(['Users', 'Workspaces', 'Activity', 'Reports', ...all.slice(3, 10), 'Queue', ...all.slice(10)])
    // Only `true` turns one on.
    expect(labels(await adminConsole({ reports: 'yes', jobs: 1 }))).toEqual(all)
  })

  it('opens each tab\'s own panel, loaded the first time it is picked', { timeout: 60_000 }, async () => {
    const wrapper = await adminConsole({ reports: true, jobs: true })
    const panels = ADMIN_TABS.filter(tab => tab.panel)
    expect(panels.length).toBeGreaterThan(10)
    for (const tab of panels) {
      await wrapper.find(`[data-admin-tab="${tab.key}"]`).trigger('click')
      await flushPromises()
      const panel = wrapper.find('[role="tabpanel"]')
      expect(panel.attributes('aria-labelledby'), tab.key).toBe(wrapper.find(`[data-admin-tab="${tab.key}"]`).attributes('id'))
      const hook = tab.key === 'queue' ? '[data-admin-queue="tab"]' : `[data-admin="${tab.key}"]`
      // Its code loads on first use: a cold transform under the test runner.
      await vi.waitFor(() => expect(wrapper.find(`[role="tabpanel"] ${hook}`).exists(), tab.key).toBe(true), { timeout: 15_000 })
    }
  })
})
