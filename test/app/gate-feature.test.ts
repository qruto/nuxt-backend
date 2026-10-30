import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { h } from 'vue'
import { ConvexError } from 'convex/values'
import { createBackendMock, type BackendMock } from '../../src/runtime/test-utils'
import Gate from '../../src/runtime/vue/components/shell/Gate.vue'
import { registerComponents } from '../helpers/register-components'

await registerComponents('Gate')

// <Gate feature> over the backend mock (nuxt-backend/test-utils): the
// real useFeatures reads `billing:getFeatures` from the mock's queries, as
// it would read the deployment's.

let backend: BackendMock

const features = {
  plans: ['prod_pro'],
  benefits: [
    { id: 'g1', benefitId: 'ben_1', type: 'feature_flag', metadata: { managedBy: 'nuxt-backend', key: 'premium' } },
    // A benefit made in the dashboard with no key: its benefit id names it.
    { id: 'g2', benefitId: 'ben_2', type: 'custom', metadata: { note: 'beta' } },
  ],
}

/** Mount the boundary with the three slots it chooses between. */
async function mountBoundary(props: { feature?: string | string[] }, extra: Record<string, (ctx: never) => unknown> = {}) {
  return mountSuspended(Gate, {
    props,
    slots: {
      default: () => h('p', { 'data-slot': 'allowed' }, 'allowed'),
      fallback: () => h('p', { 'data-slot': 'fallback' }, 'fallback'),
      placeholder: () => h('p', { 'data-slot': 'placeholder' }, 'loading'),
      ...extra,
    },
  })
}

const shown = (wrapper: Awaited<ReturnType<typeof mountBoundary>>) => wrapper.find('[data-slot]').attributes('data-slot')

beforeEach(() => {
  backend = createBackendMock({ user: {} })
})

describe('<Gate feature>', () => {
  it('shows the placeholder until the features load', async () => {
    expect(shown(await mountBoundary({ feature: 'premium' }))).toBe('placeholder')
  })

  it('shows the content for a granted feature, by its key, or by its benefit id when it has none', async () => {
    backend.state.queries['billing:getFeatures'] = features
    expect(shown(await mountBoundary({ feature: 'premium' }))).toBe('allowed')
    expect(shown(await mountBoundary({ feature: ['missing', 'ben_2'] }))).toBe('allowed')
  })

  it('matches one name per benefit, as the server does: never a keyed benefit\'s id, a grant id, a type or another metadata value', async () => {
    backend.state.queries['billing:getFeatures'] = features
    for (const feature of ['ben_1', 'g1', 'g2', 'feature_flag', 'custom', 'nuxt-backend', 'beta']) {
      expect(shown(await mountBoundary({ feature })), feature).toBe('fallback')
    }
  })

  it('shows the fallback for a feature not granted', async () => {
    backend.state.queries['billing:getFeatures'] = features
    expect(shown(await mountBoundary({ feature: 'missing' }))).toBe('fallback')
    expect(shown(await mountBoundary({ feature: ['missing', 'other'] }))).toBe('fallback')
  })

  it('follows the features as they change: a plan bought, then lapsed', async () => {
    backend.state.queries['billing:getFeatures'] = { plans: [], benefits: [] }
    const boundary = await mountBoundary({ feature: 'premium' })
    expect(shown(boundary)).toBe('fallback')

    backend.state.queries['billing:getFeatures'] = features
    await flushPromises()
    expect(shown(boundary)).toBe('allowed')

    backend.state.queries['billing:getFeatures'] = { plans: [], benefits: [] }
    await flushPromises()
    expect(shown(boundary)).toBe('fallback')
  })

  it('shows neither the content nor the upsell when the features cannot be read: nothing, else the error slot', async () => {
    backend.fail('billing:getFeatures', new ConvexError({ code: 'unauthenticated' }))
    expect((await mountBoundary({ feature: 'premium' })).find('[data-slot]').exists()).toBe(false)

    const withError = await mountBoundary({ feature: 'premium' }, {
      error: ({ error }: { error: { code: string } }) => h('p', { 'data-slot': 'error' }, error.code),
    })
    expect(shown(withError)).toBe('error')
    expect(withError.find('[data-slot]').text()).toBe('unauthenticated')
  })
})
