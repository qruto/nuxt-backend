import { defineBillingCatalog } from 'nuxt-backend/billing'

// Your billing catalog as code: meters, plans, packs, and feature benefits.
// Push it with `npx nuxt-backend billing sync` — objects are created in the
// billing provider (find-or-create, tagged, never deleted) and the id map
// lands in billing.generated.ts. Credit granting is provider-native: a
// plan's `credits` become a meter-credit benefit granted every cycle;
// a pack's are granted once at purchase.
export default defineBillingCatalog({
  // meters: { credits: {} },
  // plans: {
  //   pro: {
  //     name: 'Pro', interval: 'month', price: 2900,
  //     credits: { meter: 'credits', units: 500 },
  //     features: ['priority_support'],
  //   },
  // },
  // packs: {
  //   credits500: { name: '500 credits', price: 2000, credits: { meter: 'credits', units: 500 } },
  // },
  // features: {
  //   priority_support: { description: 'Priority support' },
  // },
})
