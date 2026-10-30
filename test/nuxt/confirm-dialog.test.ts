import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ConfirmDialog from '../../src/runtime/vue/components/shell/ConfirmDialog.vue'
import { type ConfirmFn, useConfirmation } from '../../src/runtime/vue/utils/confirmation'

// The confirmation a packaged component asks in when the app passes no
// `confirm` of its own: a native modal dialog that takes focus on Cancel,
// answers `true` on Confirm and `false` on Cancel or Escape, and gives focus
// back to the button that asked.

const dialog = () => document.querySelector<HTMLDialogElement>('dialog[data-confirm="dialog"]')
const button = (hook: 'accept' | 'cancel') => dialog()!.querySelector<HTMLButtonElement>(`[data-confirm="${hook}"]`)!

const mounted: VueWrapper[] = []
afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
})

/** A component that asks on its button's press, its answers in `answers`. */
function host(override?: ConfirmFn) {
  const answers: boolean[] = []
  let confirmation!: ReturnType<typeof useConfirmation>
  const wrapper = mount(defineComponent({
    setup() {
      confirmation = useConfirmation(() => override)
      const ask = async () => answers.push(await confirmation.ask('Remove passkey “Laptop”?'))
      return () => h('div', [
        h('button', { 'data-test': 'ask', 'type': 'button', 'onClick': ask }, 'Remove'),
        h(ConfirmDialog, { confirmation, acceptLabel: 'Confirm', cancelLabel: 'Cancel' }),
      ])
    },
  }), { attachTo: document.body })
  mounted.push(wrapper)
  const trigger = wrapper.find<HTMLButtonElement>('[data-test="ask"]')
  const press = async () => {
    trigger.element.focus()
    await trigger.trigger('click')
    await flushPromises()
  }
  return { wrapper, answers, trigger, press, confirmation: () => confirmation }
}

describe('<ConfirmDialog>', () => {
  it('renders nothing until a question is asked', () => {
    host()
    expect(dialog()).toBeNull()
  })

  it('asks in a modal dialog named by the question, focus on Cancel, and resolves true on Confirm', async () => {
    const { answers, trigger, press } = host()
    await press()
    const element = dialog()!
    expect(element.open).toBe(true)
    expect(element.getAttribute('role')).toBe('alertdialog')
    expect(document.getElementById(element.getAttribute('aria-labelledby')!)!.textContent!.trim()).toBe('Remove passkey “Laptop”?')
    expect([...element.querySelectorAll('button')].map(control => control.textContent!.trim())).toEqual(['Cancel', 'Confirm'])
    expect(document.activeElement).toBe(button('cancel'))
    button('accept').click()
    await flushPromises()
    expect(answers).toEqual([true])
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(trigger.element)
  })

  it('resolves false on Cancel, and gives focus back to the button that asked', async () => {
    const { answers, trigger, press } = host()
    await press()
    button('cancel').click()
    await flushPromises()
    expect(answers).toEqual([false])
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(trigger.element)
  })

  it('resolves false on Escape (the dialog\'s cancel), and gives focus back', async () => {
    const { answers, trigger, press } = host()
    await press()
    const cancel = new Event('cancel', { cancelable: true })
    dialog()!.dispatchEvent(cancel)
    expect(cancel.defaultPrevented).toBe(true)
    await flushPromises()
    expect(answers).toEqual([false])
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(trigger.element)
  })

  it('asks through the app\'s own confirm when it passes one, and opens no dialog', async () => {
    const confirm = vi.fn(async () => true)
    const { answers, press } = host(confirm)
    await press()
    expect(confirm).toHaveBeenCalledWith('Remove passkey “Laptop”?')
    expect(dialog()).toBeNull()
    expect(answers).toEqual([true])
  })

  it('answers an open question false when another is asked, or when the component goes', async () => {
    const { wrapper, confirmation } = host()
    const first = confirmation().ask('First?')
    await flushPromises()
    const second = confirmation().ask('Second?')
    await expect(first).resolves.toBe(false)
    await flushPromises()
    expect(dialog()!.querySelector('[data-confirm="text"]')!.textContent!.trim()).toBe('Second?')
    wrapper.unmount()
    mounted.length = 0
    await expect(second).resolves.toBe(false)
  })
})
