import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h, provide } from 'vue'
import { makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import { ConvexClientKey, ConvexVueClient } from 'nuxt-convex-module/client'
import { failClientQuery } from '../helpers/vue_test_utils'
import { silentConnectLogger } from '../helpers/silent-logger'
import Gate from '../../src/runtime/vue/components/shell/Gate.vue'
import { BackendApiKey } from '../../src/runtime/vue/utils/namespace'
import { registerComponents } from '../helpers/register-components'

await registerComponents('Gate')

// <Gate feature> over a real client: `getFeatures` comes from the
// provided `api.billing` namespace, as in an app. The loading and failed
// reads stay here, through the real client, for someone signed in;
// test/app/gate-feature.test.ts covers every state over the backend mock.

// Someone signed in: a gate with a check asks for a sign-in first.
vi.mock('../../src/runtime/vue/utils/auth-session', async () => {
  const { computed } = await import('vue')
  return { useAuthSession: () => ({ isLoading: computed(() => false), isAuthenticated: computed(() => true), banned: computed(() => false), hasRole: () => true }) }
})

const featuresRef = makeFunctionReference<'query'>('billing:getFeatures')

let client: ConvexVueClient

/** Mount the boundary with the three slots it chooses between. */
async function mountBoundary(props: { feature?: string | string[] }, extra: Record<string, (ctx: never) => unknown> = {}) {
  const Wrapper = defineComponent({
    setup() {
      provide(ConvexClientKey, client)
      provide(BackendApiKey, { billing: { getFeatures: featuresRef } })
      return () => h(Gate, props, {
        default: () => h('p', { 'data-slot': 'allowed' }, 'allowed'),
        fallback: () => h('p', { 'data-slot': 'fallback' }, 'fallback'),
        placeholder: () => h('p', { 'data-slot': 'placeholder' }, 'loading'),
        ...extra,
      })
    },
  })
  return mountSuspended(Wrapper)
}

const shown = (wrapper: Awaited<ReturnType<typeof mountBoundary>>) => wrapper.find('[data-slot]').attributes('data-slot')

beforeEach(() => {
  client = new ConvexVueClient('https://127.0.0.1:3001', { logger: silentConnectLogger })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('<Gate feature>', () => {
  it('shows the placeholder until the features load', async () => {
    expect(shown(await mountBoundary({ feature: 'premium' }))).toBe('placeholder')
  })

  it('shows neither the content nor the upsell when the features cannot be read: nothing, else the error slot', async () => {
    failClientQuery(client, featuresRef, new ConvexError({ code: 'unauthenticated' }))
    expect((await mountBoundary({ feature: 'premium' })).find('[data-slot]').exists()).toBe(false)

    const withError = await mountBoundary({ feature: 'premium' }, {
      error: ({ error }: { error: { code: string } }) => h('p', { 'data-slot': 'error' }, error.code),
    })
    expect(shown(withError)).toBe('error')
    expect(withError.find('[data-slot]').text()).toBe('unauthenticated')
  })
})
