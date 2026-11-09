import { defineBillingCatalog } from 'nuxt-backend/billing'

// Panels' pricing as code: a `credits` meter, a free plan with a few credits
// a month, a Studio plan whose `priority_queue` feature gives its strips a
// head start in the queue (jobs.ts), and two packs. A strip costs 30
// credits, so the free plan draws one strip a month. Prices are in cents.
// Push it with `npx nuxt-backend billing sync`, which writes the ids to
// billing.generated.ts.
export default defineBillingCatalog({
  // US dollars and euros, a native price in each on the same product: the
  // pricing page offers both, and a visitor in any other currency pays in US
  // dollars. The organization's default currency needs a price too, since
  // the provider makes no product without one: billing sync refuses a
  // catalog that leaves it out, so add yours if it is neither.
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
      prices: { usd: { month: 1200, year: 12000 }, eur: { month: 1200, year: 12000 } },
      credits: { meter: 'credits', units: 400 },
      features: ['priority_queue'],
    },
  },
  packs: {
    credits100: { name: '100 credits', price: { usd: 500, eur: 500 }, credits: { meter: 'credits', units: 100 } },
    credits500: { name: '500 credits', price: { usd: 2000, eur: 2000 }, credits: { meter: 'credits', units: 500 } },
  },
  features: {
    priority_queue: { description: 'Your strips start drawing first' },
  },
})
