import type { CommerceConfig } from 'nuxt-backend/billing'

// What Panels sells at Stripe Managed Payments, Dodo Payments or Creem, the
// providers `BILLING_PROVIDER` can name besides Polar. `billing sync` writes
// Polar's products only, so create Panels' products in that provider's
// dashboard and put their ids here, by catalog key: Studio's monthly price
// under `studio`, its yearly one under `studio:year`, and each pack under its
// key. On Stripe the id is the price's (`price_…`), on Dodo and Creem the
// product's. The free plan needs none. Polar ignores this file: its ids are in
// billing.generated.ts. https://nuxt-backend.dev/docs/services/merchants
export const products: CommerceConfig['products'] = {
  sandbox: {
    // 'studio': 'price_…',
    // 'studio:year': 'price_…',
    // 'credits100': 'price_…',
    // 'credits500': 'price_…',
  },
  production: {},
}
