import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, type PropType } from 'vue'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { backendError } from '../../src/convex/errors'
import { LABELS } from '../../src/convex/labels'

// A refusal's sentence in an app without @nuxtjs/i18n, its `errors` labels
// overridden in app config: the keys go by specificity across the app's
// labels and the package's (reason, then field, then service, then the
// code's own), the app's winning a key both have. So an app's less specific
// label never hides the package's sentence for the reason.

const config = vi.hoisted(() => ({
  billing: { plans: [], packs: [], lowCreditsThreshold: 10 },
  brand: {} as Record<string, string>,
  labels: {} as Record<string, Record<string, string>>,
}))
vi.mock('../../src/runtime/vue/composables/use-backend-config', () => ({ useBackendConfig: () => config }))

enableAutoUnmount(afterEach)
afterEach(() => {
  config.labels = {}
})

const Message = defineComponent({
  props: { error: { type: null as unknown as PropType<unknown>, required: true } },
  setup(props) {
    const { errorMessage } = useLabels('errors')
    return () => h('p', errorMessage(props.error))
  },
})
const { useLabels } = await import('../../src/runtime/vue/composables/use-labels')
const sentence = (error: unknown) => mount(Message, { props: { error } }).text()

const required = backendError('invalid_input', { field: 'email', reason: 'required' })
const paused = backendError('unavailable', { service: 'checkout', reason: 'checkout_paused' })

describe('an app\'s errors labels', () => {
  it('never hide the package\'s sentence for the reason behind a field\'s', () => {
    config.labels = { errors: { invalid_input_email: 'That email looks off.' } }
    expect(sentence(required)).toBe(LABELS.errors.invalid_input_required)
    // A field refused for a reason the package does not word reads the app's field label.
    expect(sentence(backendError('invalid_input', { field: 'email', reason: 'something_new' }))).toBe('That email looks off.')
    expect(sentence(backendError('invalid_input', { field: 'email' }))).toBe('That email looks off.')
  })

  it('never hide the package\'s sentence for the reason behind a service\'s', () => {
    config.labels = { errors: { unavailable_checkout: 'The till is down.' } }
    expect(sentence(paused)).toBe(LABELS.errors.unavailable_checkout_paused)
    expect(sentence(backendError('unavailable', { service: 'checkout', reason: 'provider_refused' }))).toBe('The till is down.')
  })

  it('never hide the package\'s sentence for the reason behind the code\'s own', () => {
    config.labels = { errors: { forbidden: 'Not allowed.' } }
    expect(sentence(backendError('forbidden', { reason: 'not_member' }))).toBe(LABELS.errors.forbidden_not_member)
    expect(sentence(backendError('forbidden', { reason: 'something_new' }))).toBe('Not allowed.')
  })

  it('win with a sentence for the reason, over the package\'s for the same key and every less specific one', () => {
    config.labels = { errors: { invalid_input_required: 'Fill this in first.', invalid_input_email: 'That email looks off.', unavailable_checkout_paused: 'The till is shut today.' } }
    expect(sentence(required)).toBe('Fill this in first.')
    expect(sentence(paused)).toBe('The till is shut today.')
  })
})
