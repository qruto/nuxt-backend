import { defineBillingCatalog } from 'nuxt-backend/billing'

// Your billing catalog as code: meters, plans, packs, feature benefits, and
// the checkout fields they collect. Push it with
// `npx nuxt-backend billing sync` — objects are created in the billing
// provider (find-or-create, tagged, never deleted) and the id map lands in
// billing.generated.ts. Credit granting is provider-native: a plan's
// `credits` become a meter-credit benefit granted every cycle; a pack's are
// granted once at purchase. A plan can also open with a free `trial` and
// charge `usage` on top of its fixed price — pay-as-you-go overage settled
// against the same meter at the end of each cycle.
export default defineBillingCatalog({
  // meters: { credits: {} },
  // plans: {
  //   pro: {
  //     name: 'Pro', interval: 'month', price: 2900,
  //     credits: { meter: 'credits', units: 500 },
  //     features: ['priority_support'],
  //     trial: { interval: 'day', count: 14 },
  //     usage: [{ meter: 'credits', unitAmount: 5 }],
  //     customFields: ['company'],
  //   },
  // },
  // packs: {
  //   credits500: { name: '500 credits', price: 2000, credits: { meter: 'credits', units: 500 } },
  // },
  // features: {
  //   priority_support: { description: 'Priority support' },
  // },
  // customFields: {
  //   company: { type: 'text', name: 'Company' },
  // },
})
