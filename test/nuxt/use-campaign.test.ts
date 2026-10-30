import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useCampaign } from '../../src/runtime/vue/composables/use-campaign'

// A campaign link's discount code and UTM attribution, read from the address
// and nothing else: what a checkout carries, and what it never does.

const route = reactive<{ query: Record<string, string | string[] | null | undefined> }>({ query: {} })
mockNuxtImport('useRoute', () => () => route)

describe('useCampaign', () => {
  it('reads the code and the UTM parameters, trimmed, as checkout options', () => {
    route.query = { discount: ' LAUNCH20 ', utm_source: 'newsletter', utm_medium: ' email ', utm_campaign: 'autumn', utm_term: '', ref: 'x' }
    const campaign = useCampaign()
    expect(campaign.discountCode.value).toBe('LAUNCH20')
    expect(campaign.attribution.value).toEqual({ source: 'newsletter', medium: 'email', campaign: 'autumn' })
    expect(campaign.checkoutOptions.value).toEqual({ discountCode: 'LAUNCH20', utm: { source: 'newsletter', medium: 'email', campaign: 'autumn' } })
  })

  it('takes the provider\'s own `discount_code`, and the first of a repeated parameter', () => {
    route.query = { discount_code: 'SPRING', utm_source: ['ads', 'mail'] }
    const campaign = useCampaign()
    expect(campaign.discountCode.value).toBe('SPRING')
    expect(campaign.attribution.value).toEqual({ source: 'ads' })
  })

  it('carries no code that could not be one, and nothing at all for a plain address', () => {
    route.query = { discount: 'not a code!' }
    const campaign = useCampaign()
    expect(campaign.discountCode.value).toBeUndefined()
    route.query = {}
    expect(campaign.attribution.value).toBeUndefined()
    // Live: the address changes, the options follow.
    expect(campaign.checkoutOptions.value).toEqual({})
    route.query = { utm_source: 'blog' }
    expect(campaign.checkoutOptions.value).toEqual({ utm: { source: 'blog' } })
  })
})
