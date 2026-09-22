import { defineComponent, h } from 'vue'
import { useHead } from '#imports'
import { PricingTable } from '../components/pricing-table'
import { useBackendConfig } from '../composables/use-backend-config'

/**
 * The ready-made public pricing page, registered by the module at `/pricing`
 * (module option `pages.pricing`). Renders `<PricingTable>` with the catalog
 * from `appConfig.backend.billing`; signed-out visitors get sign-in links
 * instead of checkout actions. The heading is `labels.pricing.title` (default
 * "Pricing"), rendered as the page's `h1` and set as the document title.
 */
export default defineComponent({
  name: 'BackendPricingPage',
  setup() {
    const title = useBackendConfig().labels.pricing?.title ?? 'Pricing'
    useHead({ title })
    return () => h('main', { 'data-pricing': 'page' }, [
      h(PricingTable, { title, heading: 'h1' }),
    ])
  },
})
