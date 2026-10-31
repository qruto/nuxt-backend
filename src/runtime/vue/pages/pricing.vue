<script setup lang="ts">
import { useHead, useRuntimeConfig, useSeoMeta } from '#imports'
import PageFrame from '../components/shell/PageFrame.vue'
import { useLabels } from '../composables/use-labels'
import { usePricing } from '../composables/use-pricing'
import { pricingStructuredData } from '../utils/pricing-seo'

/**
 * The ready-made public pricing page, registered by the module at `/pricing`
 * (module option `pages.pricing`) and rendered on the server with its prices
 * in the HTML: `<PricingTable>` with the live pricing and the copy from
 * `appConfig.backend.billing`; signed-out visitors get sign-in links instead
 * of checkout actions. The heading is the `pricing.title` label, rendered as
 * the table's `h1` and set as the document title; the meta description is
 * the `pricing.description` label. With an SEO module installed the page
 * also carries Open Graph tags and its plans and packs as schema.org
 * `Product` / `Offer` data.
 */
defineOptions({ name: 'BackendPricingPage' })

const { t } = useLabels('pricing')
const pricing = usePricing({ actions: false })
const seo = useRuntimeConfig().public.backend?.seo === true
useSeoMeta({
  description: () => t('description'),
  ...(seo ? { ogTitle: () => t('title'), ogDescription: () => t('description'), ogType: 'website' as const } : {}),
})
if (seo) {
  useHead({
    script: [{
      key: 'backend-pricing',
      type: 'application/ld+json',
      // An object: the head manager serializes it, and escapes what could end the script early.
      innerHTML: () => (pricing.plans.value && pricing.packs.value
        ? pricingStructuredData({ plans: pricing.plans.value, packs: pricing.packs.value })
        : ''),
    }],
  })
}
</script>

<template>
  <PageFrame
    page="pricing"
    family="pricing"
    :title="t('title')"
    :heading="false"
  >
    <PricingTable
      :title="t('title')"
      heading="h1"
    />
  </PageFrame>
</template>
