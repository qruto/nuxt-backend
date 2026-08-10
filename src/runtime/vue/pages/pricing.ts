import { defineComponent, h } from 'vue'
import { PricingTable } from '../components/pricing-table'

/**
 * The ready-made public pricing page, registered by the module at `/pricing`
 * (module option `pages.pricing`). Renders `<PricingTable>` with the catalog
 * from `appConfig.backend.billing`; signed-out visitors get sign-in links
 * instead of checkout actions.
 */
export default defineComponent({
  name: 'BackendPricingPage',
  setup() {
    return () => h('main', { 'data-pricing': 'page' }, [
      h(PricingTable, { title: 'Pricing' }),
    ])
  },
})
