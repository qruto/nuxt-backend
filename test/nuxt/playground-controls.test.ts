import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as vue from 'vue'
import { websiteComponent } from '../helpers/website-sfc'

// The playground's controls as a keyboard and a screen reader meet them.
// A key while its action runs (website/components/Key.vue): the focus stays
// on it, and a click or a submit does not start the action a second time. A
// labelled field (website/components/LabField.vue): a label that names one
// control and nothing else, a hint or an error that describes it, and a
// group of keys named by its stamp without a <label> that would swallow
// their names or click the first one.

const Key = websiteComponent('website/components/Key.vue', { computed: vue.computed })
const LabField = websiteComponent('website/components/LabField.vue', { computed: vue.computed, useId: vue.useId })

afterEach(() => {
  document.body.innerHTML = ''
})

describe('a loading <Key>', () => {
  it('keeps the keyboard\'s focus when it starts loading', async () => {
    const wrapper = mount(Key, { attachTo: document.body, props: { loading: false }, slots: { default: () => 'Send' } })
    const button = wrapper.get('button').element as HTMLButtonElement
    button.focus()
    await wrapper.setProps({ loading: true })
    expect(button.disabled).toBe(false)
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(button)
  })

  it('swallows a click while loading, and passes one on again after', async () => {
    const onClick = vi.fn()
    const wrapper = mount(Key, { attachTo: document.body, props: { loading: true }, attrs: { onClick }, slots: { default: () => 'Send' } })
    await wrapper.get('button').trigger('click')
    expect(onClick).not.toHaveBeenCalled()
    await wrapper.setProps({ loading: false })
    await wrapper.get('button').trigger('click')
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('does not submit its form while loading', async () => {
    const onSubmit = vi.fn((event: Event) => event.preventDefault())
    const form = mount(vue.defineComponent({
      setup: () => () => vue.h('form', { onSubmit }, [vue.h(Key, { type: 'submit', loading: true }, () => 'Send')]),
    }), { attachTo: document.body })
    ;(form.get('button').element as HTMLButtonElement).click()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('is disabled, not focusable, when it is unavailable', () => {
    const wrapper = mount(Key, { props: { disabled: true }, slots: { default: () => 'Send' } })
    expect((wrapper.get('button').element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.get('button').attributes('aria-disabled')).toBeUndefined()
  })
})

describe('<LabField>', () => {
  it('labels its one control, and describes it with the hint', () => {
    const wrapper = mount(LabField, {
      attachTo: document.body,
      props: { label: 'recipient', hint: 'a test inbox' },
      slots: { default: (field: { id: string, describedby?: string }) => [vue.h('input', { 'id': field.id, 'aria-describedby': field.describedby }), vue.h('button', { type: 'button' }, 'Send')] },
    })
    const input = wrapper.get('input').element as HTMLInputElement
    const label = wrapper.get('label').element as HTMLLabelElement
    expect(label.htmlFor).toBe(input.id)
    expect(label.textContent).toBe('recipient')
    expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent).toBe('a test inbox')
    // The key beside the control is outside the label.
    expect(label.contains(wrapper.get('button').element)).toBe(false)
  })

  it('describes the control with the error in place of the hint', () => {
    const wrapper = mount(LabField, {
      props: { label: 'recipient', hint: 'a test inbox', error: 'use a resend.dev address' },
      slots: { default: (field: { id: string, describedby?: string }) => vue.h('input', { 'id': field.id, 'aria-describedby': field.describedby }) },
    })
    const note = wrapper.find(`#${CSS.escape(wrapper.get('input').attributes('aria-describedby')!)}`)
    expect(note.text()).toBe('use a resend.dev address')
    expect(wrapper.text()).not.toContain('a test inbox')
  })

  it('names a group of keys by its stamp, with no label to click the first one', async () => {
    const onClick = vi.fn()
    const wrapper = mount(LabField, {
      attachTo: document.body,
      props: { as: 'div', label: 'security', hint: 'passkey + account' },
      slots: { default: () => [vue.h('button', { type: 'button', onClick }, 'Register passkey'), vue.h('button', { type: 'button' }, 'Sign out')] },
    })
    const group = wrapper.get('[role="group"]')
    expect(wrapper.find('label').exists()).toBe(false)
    expect(document.getElementById(group.attributes('aria-labelledby')!)?.textContent).toBe('security')
    expect(document.getElementById(group.attributes('aria-describedby')!)?.textContent).toBe('passkey + account')
    await wrapper.get(`#${CSS.escape(group.attributes('aria-labelledby')!)}`).trigger('click')
    expect(onClick).not.toHaveBeenCalled()
  })
})
