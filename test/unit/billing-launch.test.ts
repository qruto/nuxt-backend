import { describe, expect, it } from 'vitest'
import { billingLaunch } from '../../src/convex/billing-launch'

// The one rule of "billing not launched yet", which the runtime and doctor share.

describe('billingLaunch', () => {
  const products = { pro: 'prod_1' }

  it('is launched on the provider\'s sandbox, whatever the token and the catalog', () => {
    expect(billingLaunch({ environment: 'sandbox', accessToken: undefined, products: undefined })).toEqual({ launched: true })
    expect(billingLaunch({ environment: 'sandbox', accessToken: 'polar_oat_x', products })).toEqual({ launched: true })
  })

  it('is not launched on production without a token, which is named first', () => {
    expect(billingLaunch({ environment: 'production', accessToken: undefined, products })).toEqual({ launched: false, reason: 'no_access_token' })
    expect(billingLaunch({ environment: 'production', accessToken: '', products: undefined })).toEqual({ launched: false, reason: 'no_access_token' })
    expect(billingLaunch({ environment: 'production', accessToken: false, products })).toEqual({ launched: false, reason: 'no_access_token' })
  })

  it('is not launched on production without a production catalog', () => {
    expect(billingLaunch({ environment: 'production', accessToken: 'polar_oat_x', products: undefined })).toEqual({ launched: false, reason: 'no_catalog' })
    expect(billingLaunch({ environment: 'production', accessToken: true, products: {} })).toEqual({ launched: false, reason: 'no_catalog' })
  })

  it('is launched on production with a token and products', () => {
    expect(billingLaunch({ environment: 'production', accessToken: 'polar_oat_x', products })).toEqual({ launched: true })
  })
})
