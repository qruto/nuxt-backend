export default defineAppConfig({
  // The nuxt-backend content layer, the same as the site's: the plan catalog
  // <PricingTable> and <WorkspaceSettings> render. Keys match
  // backend/billing.catalog.ts; names and prices resolve live from billing.
  backend: {
    billing: {
      plans: [
        { key: 'starter', credits: 50, blurb: 'For trying things out.' },
        { key: 'pro', credits: 200, blurb: 'For products finding their feet.', features: ['premium'] },
        { key: 'ultra', credits: 500, blurb: 'Everything, unlocked.', features: ['premium', 'ultra'], highlight: true },
      ],
      packs: [
        { key: 'credits100', credits: 100 },
        { key: 'credits500', credits: 500 },
      ],
    },
    brand: { name: 'Nuxt backend' },
  },
})
