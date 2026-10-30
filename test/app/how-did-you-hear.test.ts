import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { createBackendMock } from '../../src/runtime/test-utils'
import HowDidYouHear from '../../src/runtime/vue/components/account/HowDidYouHear.vue'

// <HowDidYouHear> on the backend mock. The deployment updates the live
// `getSource` before `recordSource` resolves, as Convex does: the answer this
// form just gave is not "asked before", so `done` fires once, with the answer.

let backend: ReturnType<typeof createBackendMock>

beforeEach(() => {
  backend = createBackendMock({ user: { name: 'Ada' } })
  backend.state.queries['audit:getSource'] = { asked: false, answer: null, campaign: null }
  backend.stub('audit:recordSource', ({ answer }: { answer?: string | null }) => {
    const view = { asked: true, answer: answer ?? null, campaign: null }
    backend.state.queries['audit:getSource'] = view
    return view
  })
})

describe('<HowDidYouHear>', () => {
  it('emits done once, with the answer, and moves focus to the heading that replaces the form', async () => {
    const wrapper = await mountSuspended(HowDidYouHear, { attachTo: document.body })
    await flushPromises()
    const option = wrapper.find('input[type="radio"]')
    await option.setValue(true)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    const done = wrapper.emitted('done')
    expect(done).toEqual([[(option.element as HTMLInputElement).value]])
    expect(document.activeElement).toBe(wrapper.find('h2[data-source="title"]').element)
    wrapper.unmount()
  })

  it('emits done with null at once for a person asked before', async () => {
    backend.state.queries['audit:getSource'] = { asked: true, answer: 'search', campaign: null }
    const wrapper = await mountSuspended(HowDidYouHear)
    await flushPromises()
    expect(wrapper.emitted('done')).toEqual([[null]])
  })
})
