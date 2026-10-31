import { defineBillingCatalog } from 'nuxt-backend/billing'

// Panels' pricing as code: a `credits` meter, a free plan with a few credits
// a month, a Studio plan whose `priority_queue` feature gives its strips a
// head start in the queue (jobs.ts), and two packs. A strip costs 30
// credits, so the free plan draws one strip a month. Prices are in cents.
// Push it with `npx nuxt-backend billing sync`, which writes the ids to
// billing.generated.ts.
export default defineBillingCatalog({
  // Every price is created in US dollars, whatever the organization's default
  // currency: plans and packs then read alike on the pricing page.
  currency: 'usd',
  meters: { credits: {} },
  plans: {
    free: {
      name: 'Free',
      prices: { month: 0 },
      credits: { meter: 'credits', units: 30 },
    },
    studio: {
      name: 'Studio',
      prices: { month: 1200, year: 12000 },
      credits: { meter: 'credits', units: 400 },
      features: ['priority_queue'],
    },
  },
  packs: {
    credits100: { name: '100 credits', price: 500, credits: { meter: 'credits', units: 100 } },
    credits500: { name: '500 credits', price: 2000, credits: { meter: 'credits', units: 500 } },
  },
  features: {
    priority_queue: { description: 'Your strips start drawing first' },
  },
})
