import { defineBillingCatalog } from 'nuxt-backend/billing'

// The playground's billing catalog as code: meters, plans, packs and feature
// benefits, declared once here and pushed with `npx nuxt-backend billing sync`
// (find-or-create, tagged `managedBy`, never deleted). The resulting provider
// ids land in billing.generated.ts — the only place UUIDs live.
//
// This catalog mirrors the objects that already exist in the qruto sandbox, so
// the first sync ran with `--adopt` (existing objects recorded as-is, their
// benefits left untouched rather than growing managed twins that would
// double-grant). Credit granting stays provider-native: a plan's `credits`
// become a meter-credit benefit granted every cycle; a pack's are granted once
// at purchase.
export default defineBillingCatalog({
  // Counts `credits` events, so one spend event = exactly one unit. A meter
  // with `aggregation: 'sum'` would instead sum `metadata[property]`.
  meters: {
    credits: { aggregation: 'count' },
  },
  plans: {
    starter: {
      name: 'Starter',
      description: 'For getting started — 50 credits every month.',
      interval: 'month',
      price: 500,
      credits: { meter: 'credits', units: 50 },
    },
    pro: {
      name: 'Pro',
      description: 'For products finding their feet — 200 credits every month.',
      interval: 'month',
      price: 900,
      credits: { meter: 'credits', units: 200 },
      features: ['premium'],
    },
    ultra: {
      name: 'Ultra',
      description: 'Everything unlocked — 500 credits every month.',
      interval: 'month',
      price: 1900,
      credits: { meter: 'credits', units: 500 },
      features: ['premium', 'ultra'],
    },
  },
  packs: {
    credits100: {
      name: 'Credit Pack 100',
      price: 1000,
      credits: { meter: 'credits', units: 100, rollover: false },
    },
    credits500: {
      name: 'Credit Pack 500',
      description: 'One-time top-up of 500 credits.',
      price: 4000,
      credits: { meter: 'credits', units: 500 },
    },
  },
  features: {
    premium: { description: 'Premium access' },
    ultra: { description: 'Ultra access' },
  },
})
