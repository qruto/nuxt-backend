import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h, provide, reactive, nextTick } from 'vue'
import { Authenticated, AuthLoading, Unauthenticated } from '../../../src/runtime/vue/auth_helpers'
import { ConvexAuthStateKey } from '../../../src/runtime/vue/auth'

describe('auth helpers', () => {
  it('helpers are valid children', async () => {
    const state = reactive({ isLoading: false, isAuthenticated: true })

    const Wrapper = defineComponent({
      setup() {
        provide(ConvexAuthStateKey, state)
        return () => h('div', [
          h(Authenticated, () => 'Yay'),
          h(Unauthenticated, () => 'Nay'),
          h(AuthLoading, () => '???'),
        ])
      },
    })

    const wrapper = await mountSuspended(Wrapper)
    expect(wrapper.text()).toContain('Yay')
    expect(wrapper.text()).not.toContain('Nay')
    expect(wrapper.text()).not.toContain('???')
  })

  it('helpers can take many children', async () => {
    const state = reactive({ isLoading: false, isAuthenticated: true })

    const Wrapper = defineComponent({
      setup() {
        provide(ConvexAuthStateKey, state)
        return () => h('div', [
          h(Authenticated, () => [h('div', 'Yay'), h('div', 'Yay again')]),
          h(Unauthenticated, () => [h('div', 'Nay'), h('div', 'Nay again')]),
          h(AuthLoading, () => [h('div', 'Load'), h('div', 'Load again')]),
        ])
      },
    })

    const wrapper = await mountSuspended(Wrapper)
    expect(wrapper.text()).toContain('Yay')
    expect(wrapper.text()).toContain('Yay again')
    expect(wrapper.text()).not.toContain('Nay')
    expect(wrapper.text()).not.toContain('Load')
  })

  it('renders the matching helper when auth state changes', async () => {
    const state = reactive({ isLoading: true, isAuthenticated: false })

    const Wrapper = defineComponent({
      setup() {
        provide(ConvexAuthStateKey, state)
        return () => h('div', [
          h(Authenticated, () => 'Authenticated'),
          h(Unauthenticated, () => 'Unauthenticated'),
          h(AuthLoading, () => 'Loading'),
        ])
      },
    })

    const wrapper = await mountSuspended(Wrapper)
    expect(wrapper.text()).toBe('Loading')

    state.isLoading = false
    await nextTick()
    expect(wrapper.text()).toBe('Unauthenticated')

    state.isAuthenticated = true
    await nextTick()
    expect(wrapper.text()).toBe('Authenticated')
  })
})
