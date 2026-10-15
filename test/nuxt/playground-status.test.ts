import { flushPromises } from '@vue/test-utils'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { usePlaygroundStatus } from '../../website/composables/usePlaygroundStatus'

// The docs site's Playground light (website/composables): the header's keys,
// the drawer's and a page's Try live key all read it. They must share one
// request per visit — the endpoint counts against the site's /api/** rate
// limit — however many of them mount, and whenever.

const requests = { count: 0 }
registerEndpoint('/api/playground/status', () => {
  requests.count++
  return { live: true }
})

const Key = defineComponent({
  setup() {
    const status = usePlaygroundStatus()
    return () => h('span', status.value)
  },
})

describe('the playground status', () => {
  it('is asked once per visit, however many keys read it and whenever they mount', async () => {
    // The header and a docs page's keys, mounted together.
    const header = await mountSuspended(Key)
    const page = await mountSuspended(Key)
    await flushPromises()
    expect(header.text()).toBe('live')
    expect(page.text()).toBe('live')

    // A navigation to another page, and the phone drawer opening.
    page.unmount()
    const next = await mountSuspended(Key)
    const drawer = await mountSuspended(Key)
    await flushPromises()
    expect(next.text()).toBe('live')
    expect(drawer.text()).toBe('live')

    // Even with every reader gone for a moment.
    header.unmount()
    next.unmount()
    drawer.unmount()
    const again = await mountSuspended(Key)
    await flushPromises()
    expect(again.text()).toBe('live')

    expect(requests.count).toBe(1)
  })
})
