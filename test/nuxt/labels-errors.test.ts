import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, type PropType } from 'vue'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { backendError } from '../../src/convex/errors'
import { LABELS } from '../../src/convex/labels'

// A refusal's sentence in an app without @nuxtjs/i18n, its `errors` labels
// overridden in app config: the app's labels are searched first, from the
// most specific key (the sentence with its numbers, the reason, the field,
// the service) to the code's own, and only then the package's, in the same
// order. So an override pins the sentence of every refusal it covers.

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
const billingDown = backendError('unavailable', { service: 'billing', reason: 'provider_refused' })

describe('an app\'s errors labels', () => {
  it('win over the package\'s more specific key: a code\'s own sentence covers every service and reason', () => {
    config.labels = { errors: { unavailable: 'We are down (app).' } }
    expect(sentence(billingDown)).toBe('We are down (app).')
    expect(sentence(paused)).toBe('We are down (app).')
    config.labels = { errors: { forbidden: 'Not allowed (app).' } }
    expect(sentence(backendError('forbidden', { reason: 'not_member' }))).toBe('Not allowed (app).')
  })

  it('win with a field\'s or a service\'s sentence over the package\'s for the reason', () => {
    config.labels = { errors: { invalid_input_email: 'That email looks off.' } }
    expect(sentence(required)).toBe('That email looks off.')
    config.labels = { errors: { unavailable_checkout: 'The till is down.' } }
    expect(sentence(paused)).toBe('The till is down.')
  })

  it('win over a sentence with the refusal\'s numbers in it', () => {
    config.labels = { errors: { insufficient_credits: 'Not enough coins (app).', rate_limited: 'Slow down (app).', forbidden_banned: 'Banned (app).' } }
    expect(sentence(backendError('insufficient_credits', { balance: 2, need: 5 }))).toBe('Not enough coins (app).')
    expect(sentence(backendError('rate_limited', { retryAfter: 3000 }))).toBe('Slow down (app).')
    expect(sentence(backendError('forbidden', { reason: 'banned', until: Date.UTC(2026, 11, 1) }))).toBe('Banned (app).')
    // The app's own sentence with the numbers wins over its plain one.
    config.labels = { errors: { insufficient_credits: 'Not enough coins (app).', insufficient_credits_amounts: '{balance} of {need} coins (app).' } }
    expect(sentence(backendError('insufficient_credits', { balance: 2, need: 5 }))).toBe('2 of 5 coins (app).')
  })

  it('go by specificity among themselves', () => {
    config.labels = { errors: { forbidden: 'Not allowed (app).', forbidden_not_member: 'Join first (app).', unavailable: 'We are down (app).', unavailable_billing: 'Billing is down (app).' } }
    expect(sentence(backendError('forbidden', { reason: 'not_member' }))).toBe('Join first (app).')
    expect(sentence(backendError('forbidden', { reason: 'role' }))).toBe('Not allowed (app).')
    expect(sentence(billingDown)).toBe('Billing is down (app).')
  })

  it('leave the package\'s most specific sentence wherever they have none', () => {
    config.labels = { errors: { no_workspace: 'Pick a workspace (app).' } }
    expect(sentence(billingDown)).toBe(LABELS.errors.unavailable_billing)
    expect(sentence(paused)).toBe(LABELS.errors.unavailable_checkout_paused)
    expect(sentence(required)).toBe(LABELS.errors.invalid_input_required)
    expect(sentence(backendError('insufficient_credits', { balance: 2, need: 5 }))).toBe('Not enough credits: 2 left, 5 needed. Top up to continue.')
  })
})
