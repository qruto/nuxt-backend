// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { homeConsole, lcdRowCount as rows, NuxtLink, UIcon } from './sfc'

// The homepage console's fold on a phone, pressed: the key under the glass
// shows every row in place and folds them again, and the reader's choice
// holds when the dial turns. Its own file, because pressing a key takes a
// DOM; test/docs/homepage.test.ts holds the folded page as it is served.
// (Its doctor runs need Node's own fetch, which a DOM environment replaces.)

describe('the console\'s fold', () => {
  function mountConsole() {
    const { root, components } = homeConsole('billing')
    return mount(root, { global: { components: { ...components, NuxtLink, UIcon } } })
  }

  it('shows every row in place when its key is pressed, and folds them again', async () => {
    const wrapper = mountConsole()
    const key = () => wrapper.get('button[aria-controls]')
    const folded = () => wrapper.findAll('.lcd-row.max-sm\\:hidden').length
    const mark = () => wrapper.findAll('.lcd-row.sm\\:hidden').length
    const drawn = wrapper.findAll('.lcd-row').length - mark()

    expect(folded()).toBe(8)
    expect(mark()).toBe(1)
    expect(key().attributes('aria-pressed')).toBe('false')
    expect(key().text()).toBe(`Show all ${rows('billing')} lines`)

    await key().trigger('click')
    expect(key().attributes('aria-pressed')).toBe('true')
    expect([folded(), mark()]).toEqual([0, 0])
    // The same rows, in the same LCD: only the fold went away.
    expect(wrapper.findAll('.lcd-row')).toHaveLength(drawn)
    expect(key().text()).toBe(`Show all ${rows('billing')} lines`)

    await key().trigger('click')
    expect([folded(), mark()]).toEqual([8, 1])
    wrapper.unmount()
  })

  it('keeps the reader\'s choice when the dial turns, and counts the new transcript', async () => {
    const wrapper = mountConsole()
    await wrapper.get('button[aria-controls]').trigger('click')
    await wrapper.get('[data-detent="email"]').trigger('click')
    const key = wrapper.get('button[aria-controls]')
    expect(key.attributes('aria-pressed')).toBe('true')
    expect(key.text()).toBe(`Show all ${rows('email')} lines`)
    expect(wrapper.findAll('.lcd-row.max-sm\\:hidden')).toHaveLength(0)
    wrapper.unmount()
  })
})
