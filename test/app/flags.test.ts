import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { clearNuxtData } from '#app'
import type { FlagValues } from '../../src/convex/integrations/flags'
import { createBackendMock, type BackendMock } from '../../src/runtime/test-utils'
import { useFlag } from '../../src/runtime/vue/composables/use-flags'
import MaintenanceBanner from '../../src/runtime/vue/components/shell/NoticeMaintenance.vue'
import { registerComponents } from '../helpers/register-components'

await registerComponents('NoticeMaintenance')

// useFlag and <MaintenanceBanner> over the backend mock
// (nuxt-backend/test-utils), the way an app tests a page behind a flag:
// both read the scaffolded `getFlags`, and follow it live as an
// administrator changes a flag.

let backend: BackendMock

const values = (flags: Record<string, boolean>, maintenance: FlagValues['maintenance'] = null): FlagValues => ({
  flags: { pause_signups: false, pause_checkout: false, pause_ai: false, maintenance: maintenance !== null, ...flags },
  maintenance,
  variants: {},
  running: [],
  discounts: {},
})

/** A page that shows one thing behind a flag, and another without it. */
const Page = defineComponent({
  props: { flag: { type: String, required: true } },
  setup(props) {
    const { isEnabled, isLoading } = useFlag(() => props.flag)
    return () => h('p', { 'data-loading': isLoading.value || undefined }, isEnabled.value ? 'New editor' : 'Classic editor')
  },
})

beforeEach(() => {
  clearNuxtData()
  backend = createBackendMock({ user: {}, queries: { 'flags:getFlags': values({ newEditor: true, labs: false }) } })
})

describe('useFlag, on the backend mock', () => {
  it('says whether a flag is on for whoever is looking, and follows a change live', async () => {
    const page = await mountSuspended(Page, { props: { flag: 'newEditor' } })
    await flushPromises()
    expect(page.text()).toBe('New editor')
    backend.state.queries['flags:getFlags'] = values({ newEditor: false })
    await flushPromises()
    expect(page.text()).toBe('Classic editor')
  })

  it('reads a flag the app does not declare as off, and one of the package\'s own as it is', async () => {
    backend.state.queries['flags:getFlags'] = values({ newEditor: true, pause_checkout: true })
    const unknown = await mountSuspended(Page, { props: { flag: 'oldEditor' } })
    const paused = await mountSuspended(Page, { props: { flag: 'pause_checkout' } })
    await flushPromises()
    expect(unknown.text()).toBe('Classic editor')
    expect(paused.text()).toBe('New editor')
  })

  it('reads off until the flags arrive', async () => {
    delete backend.state.queries['flags:getFlags']
    const page = await mountSuspended(Page, { props: { flag: 'newEditor' } })
    await flushPromises()
    expect(page.text()).toBe('Classic editor')
    backend.state.queries['flags:getFlags'] = values({ newEditor: true })
    await flushPromises()
    expect(page.text()).toBe('New editor')
  })
})

describe('<MaintenanceBanner>, on the backend mock', () => {
  it('shows the administrator\'s message while the switch is on, and goes once it is off, without a reload', async () => {
    backend.state.queries['flags:getFlags'] = values({}, { message: 'Back at 3 pm.' })
    const banner = await mountSuspended(MaintenanceBanner)
    await flushPromises()
    expect(banner.find('aside[data-maintenance="banner"]').attributes('aria-label')).toBe('Maintenance')
    expect(banner.text()).toBe('Back at 3 pm.')
    backend.state.queries['flags:getFlags'] = values({})
    await nextTick()
    expect(banner.find('[data-maintenance="banner"]').exists()).toBe(false)
  })

  it('says the default sentence when the administrator wrote none', async () => {
    backend.state.queries['flags:getFlags'] = values({}, { message: '' })
    const banner = await mountSuspended(MaintenanceBanner)
    await flushPromises()
    expect(banner.text()).toBe('We\'re doing maintenance. Some things may not work for a little while.')
  })
})
