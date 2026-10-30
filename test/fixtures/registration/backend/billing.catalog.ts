/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Verbatim copy of templates/starter/backend, present so the scaffolder finds
// every default file in place. Never built or typechecked (no codegen here).
import { defineBillingCatalog } from 'nuxt-backend/billing'

// Your billing catalog as code: meters, plans, packs, feature benefits, and
// the checkout fields they collect. Push it with
// `npx nuxt-backend billing sync` — objects are created in the billing
// provider (find-or-create, tagged, never deleted) and the id map lands in
// billing.generated.ts. A plan is sold at each interval it has a price for,
// one product per price, so a subscriber switches between monthly and
// yearly like between plans. Credit granting is provider-native: a plan's
// `credits` become a meter-credit benefit granted every cycle (a year's
// worth on the yearly price); a pack's are granted once at purchase. This
// catalog is a starting point for the sandbox: a new plan, pack or price,
// and a changed trial, reach /pricing on the next sync. A price or credit
// grant already synced is reported as drift, never rewritten: change it in
// the provider dashboard, or publish it under a new key. Retire a plan with
// `retired: true` — its subscribers keep it, nobody new buys it — rather
// than deleting it.
export default defineBillingCatalog({
  meters: { credits: {} },
  plans: {
    starter: {
      name: 'Starter',
      prices: { month: 900, year: 9000 },
      credits: { meter: 'credits', units: 100 },
    },
    pro: {
      name: 'Pro',
      prices: { month: 2900, year: 29000 },
      credits: { meter: 'credits', units: 500 },
      features: ['priority_support'],
      trial: { interval: 'day', count: 14 },
      // Pay-as-you-go past the allowance, and a field checkout collects:
      // usage: [{ meter: 'credits', unitAmount: 5 }],
      // customFields: ['company'],
    },
  },
  packs: {
    credits100: { name: '100 credits', price: 1000, credits: { meter: 'credits', units: 100 } },
    credits500: { name: '500 credits', price: 4000, credits: { meter: 'credits', units: 500 } },
  },
  features: {
    priority_support: { description: 'Priority support' },
  },
  // customFields: {
  //   company: { type: 'text', name: 'Company' },
  // },
})
