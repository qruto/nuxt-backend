import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import AiLabel from '../../src/runtime/vue/components/shell/AiLabel.vue'

// <AiLabel>: the label alone, and with a provenance record a button that
// opens its details as a native popover: the models, the date, and a link
// to the Content Credentials verifier, on the image when `src` names it.

enableAutoUnmount(afterEach)

const provenance = { models: ['openai/gpt-5-mini', 'google/gemini-3.1-flash-image-preview'], finishedAt: Date.UTC(2026, 9, 25, 12), inputs: ['strip_1'] }

describe('<AiLabel>', () => {
  it('is the label alone without a record', () => {
    const wrapper = mount(AiLabel)
    expect(wrapper.find('[data-ai-label="root"]').attributes('data-state')).toBe('label')
    expect(wrapper.text()).toBe('AI-generated')
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('opens the models, the date and the verifier on the image from its button', () => {
    const wrapper = mount(AiLabel, { props: { provenance, src: 'https://example.com/panel 1.png' } })
    const button = wrapper.find('[data-ai-label="trigger"]')
    const details = wrapper.find('[data-ai-label="details"]')
    expect(button.text()).toBe('AI-generated')
    expect(button.attributes('popovertarget')).toBe(details.attributes('id'))
    expect(details.attributes('popover')).toBe('auto')
    expect(wrapper.find('[data-ai-label="models"]').text()).toBe('Made with openai/gpt-5-mini and google/gemini-3.1-flash-image-preview')
    expect(wrapper.find('[data-ai-label="date"]').text()).toMatch(/^Made on .*2026/)
    expect(wrapper.find('[data-ai-label="verify"]').attributes('href')).toBe('https://contentcredentials.org/verify?source=https%3A%2F%2Fexample.com%2Fpanel%201.png')
  })

  it('never sends a signed URL or the page to the verifier', () => {
    const wrapper = mount(AiLabel, { props: { provenance, src: 'https://panels.example.com/storage/kg2abc?expires=1793000000&signature=abc123' } })
    const verify = wrapper.find('[data-ai-label="verify"]')
    expect(verify.attributes('href')).toBe('https://contentcredentials.org/verify')
    expect(verify.attributes('rel')).toBe('noreferrer')
  })

  it('takes its words from labels, and a slot for the label', () => {
    const wrapper = mount(AiLabel, { props: { labels: { label: 'Made with AI' } } })
    expect(wrapper.text()).toBe('Made with AI')
    const slotted = mount(AiLabel, { slots: { default: () => 'Généré par IA' } })
    expect(slotted.text()).toBe('Généré par IA')
  })
})
