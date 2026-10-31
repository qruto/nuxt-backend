import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { collectBillingFindings, type BillingOrganizationState } from '../../../src/cli/billing/doctor'
import { type BillingCatalog, type CatalogPack, type CatalogPlan, pricedIntervals } from '../../../src/convex/catalog'
import type { PreflightFinding } from '../../../src/findings/types'

// Property tests (fast-check) for how doctor reads a billing catalog against
// the provider organization's settings (`collectBillingFindings`). Catalogs
// and settings are generated: every finding reports exactly the condition
// its documentation names, for any mix of meters, plans, packs and features,
// and each always comes out the same — one row, pass or warn, never both.

/**
 * Meter and feature keys that never contain one another, nor a word of the
 * findings' own sentences, so a message names exactly the keys it lists.
 */
const meterKey = fc.constantFrom('tokens', 'images', 'minutes', 'renders', 'calls')
const featureKey = fc.constantFrom('priority_support', 'export', 'sso_login', 'audit_trail')

/** A credit grant on a catalog meter, or on one the catalog forgot to declare. */
const grant = fc.record({ meter: meterKey, units: fc.integer({ min: 1, max: 10_000 }) })

/** A plan priced by the month, the year or both. */
const prices = fc.oneof(
  fc.record({ month: fc.integer({ min: 0, max: 100_000 }) }),
  fc.record({ year: fc.integer({ min: 0, max: 1_000_000 }) }),
  fc.record({ month: fc.integer({ min: 0, max: 100_000 }), year: fc.integer({ min: 0, max: 1_000_000 }) }),
)

const plan: fc.Arbitrary<CatalogPlan> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 20 }),
  prices,
  credits: fc.option(grant, { nil: undefined }),
  features: fc.option(fc.uniqueArray(featureKey, { maxLength: 3 }), { nil: undefined }),
  trial: fc.option(fc.record({ interval: fc.constantFrom('day', 'week', 'month', 'year'), count: fc.integer({ min: 1, max: 30 }) }), { nil: undefined }),
  usage: fc.option(fc.array(fc.record({ meter: meterKey, unitAmount: fc.integer({ min: 1, max: 100 }) }), { maxLength: 2 }), { nil: undefined }),
  retired: fc.option(fc.boolean(), { nil: undefined }),
}, { requiredKeys: ['name', 'prices'] })

const pack: fc.Arbitrary<CatalogPack> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 20 }),
  price: fc.integer({ min: 0, max: 100_000 }),
  credits: grant,
})

const catalog: fc.Arbitrary<BillingCatalog> = fc.record({
  meters: fc.dictionary(meterKey, fc.constant({}), { maxKeys: 4 }),
  plans: fc.dictionary(fc.constantFrom('free', 'pro', 'team', 'scale'), plan, { maxKeys: 4 }),
  packs: fc.dictionary(fc.constantFrom('credits100', 'credits500', 'boost'), pack, { maxKeys: 3 }),
  features: fc.dictionary(featureKey, fc.record({ description: fc.string({ maxLength: 30 }) }), { maxKeys: 4 }),
}, { requiredKeys: [] })

const state: fc.Arbitrary<BillingOrganizationState> = fc.record({
  slug: fc.constant('acme'),
  allowMultipleSubscriptions: fc.boolean(),
  prorationBehavior: fc.constantFrom('invoice', 'prorate', 'next_period'),
  benefitRevocationGracePeriod: fc.integer({ min: 0, max: 30 }),
  preventTrialAbuse: fc.boolean(),
  customerEmailsOff: fc.constant([]),
  portal: fc.record({ updatePlan: fc.boolean(), pause: fc.boolean() }),
  benefitTypeByKey: fc.dictionary(featureKey, fc.constantFrom('feature_flag', 'custom', 'meter_credit')),
  memberModel: fc.boolean(),
  membersReadable: fc.boolean(),
  productByKey: fc.constant({}),
})

const entries = <T>(record: Record<string, T> | undefined) => Object.entries(record ?? {})
/** The one finding of `id`: exactly one, whatever else was found. */
function only(findings: PreflightFinding[], id: string): PreflightFinding {
  const matching = findings.filter(found => found.id === id)
  expect(matching, id).toHaveLength(1)
  return matching[0]!
}

describe('collectBillingFindings', () => {
  it('without a catalog, finds nothing at all', () => {
    fc.assert(fc.property(fc.option(state, { nil: null }), fc.boolean(), (settings, tokenPresent) => {
      expect(collectBillingFindings(null, settings, { tokenPresent })).toEqual([])
    }))
  })

  it('flags exactly the meters nothing grants credits on and nothing prices usage against', () => {
    fc.assert(fc.property(catalog, fc.option(state, { nil: null }), (declared, settings) => {
      const findings = collectBillingFindings(declared, settings, { tokenPresent: settings !== null })
      const meters = Object.keys(declared.meters ?? {})
      if (meters.length === 0) {
        expect(findings.map(found => found.id)).not.toContain('billing-meter-usage')
        return
      }
      const products = [...entries(declared.plans), ...entries(declared.packs)].map(([, product]) => product as CatalogPlan | CatalogPack)
      const referenced = new Set([
        ...products.flatMap(product => product.credits ? [product.credits.meter] : []),
        ...entries(declared.plans).flatMap(([, item]) => (item.usage ?? []).map(price => price.meter)),
      ])
      const orphans = meters.filter(meter => !referenced.has(meter))
      const usage = only(findings, 'billing-meter-usage')
      expect(usage.status).toBe(orphans.length === 0 ? 'pass' : 'warn')
      for (const meter of meters) {
        if (orphans.length > 0) expect(usage.message.includes(meter), meter).toBe(orphans.includes(meter))
      }
    }))
  })

  it('reads the organization only when it could: a refused token is one warning, no token is silence', () => {
    fc.assert(fc.property(catalog, fc.boolean(), (declared, tokenPresent) => {
      const ids = collectBillingFindings(declared, null, { tokenPresent }).map(found => found.id)
      expect(ids.filter(id => id !== 'billing-meter-usage')).toEqual(tokenPresent ? ['billing-organization'] : [])
    }))
  })

  it('warns on each organization setting exactly when the catalog depends on it', () => {
    fc.assert(fc.property(catalog, state, (declared, settings) => {
      const findings = collectBillingFindings(declared, settings, { tokenPresent: true })
      const plans = entries(declared.plans)
      // Every price a customer can still pick: a retired plan's are gone.
      const sold = plans.filter(([, item]) => !item.retired)
      const offered = sold.reduce((count, [, item]) => count + pricedIntervals(item).length, 0)
      const features = Object.keys(declared.features ?? {})
      const grantsCredits = [...plans, ...entries(declared.packs)].some(([, product]) => (product as CatalogPlan).credits)
      const status = (warn: boolean) => (warn ? 'warn' : 'pass')

      expect(only(findings, 'billing-multiple-subscriptions').status).toBe(status(settings.allowMultipleSubscriptions && offered > 1))
      expect(only(findings, 'billing-proration').status).toBe(status(offered > 1 && settings.prorationBehavior === 'next_period'))
      expect(only(findings, 'billing-benefit-grace').status).toBe(status(settings.benefitRevocationGracePeriod > 0 && (features.length > 0 || grantsCredits)))
      expect(only(findings, 'billing-trial-abuse').status).toBe(status(sold.some(([, item]) => item.trial) && !settings.preventTrialAbuse))
      expect(only(findings, 'billing-portal').status).toBe(status(offered > 1 && !settings.portal.updatePlan))
      if (features.length > 0) {
        const legacy = features.filter(key => settings.benefitTypeByKey[key] === 'custom')
        expect(only(findings, 'billing-feature-benefits').status).toBe(status(legacy.length > 0))
      }
      else {
        expect(findings.map(found => found.id)).not.toContain('billing-feature-benefits')
      }
      expect(findings.some(found => found.id === 'billing-gift-twins')).toBe(entries(declared.packs).length > 0)
    }))
  })

  it('never reports an id twice', () => {
    fc.assert(fc.property(catalog, fc.option(state, { nil: null }), fc.boolean(), (declared, settings, tokenPresent) => {
      const ids = collectBillingFindings(declared, settings, { tokenPresent }).map(found => found.id)
      expect(new Set(ids).size).toBe(ids.length)
    }))
  })
})
