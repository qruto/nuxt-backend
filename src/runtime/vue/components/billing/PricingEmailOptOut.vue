<script setup lang="ts">
import { useLabels } from '../../composables/use-labels'

/**
 * The EU soft opt-in at checkout: one line under the checkout buttons of
 * `<PricingTable>` and `<BillingCheckoutLink>`, with an unticked box that
 * objects. Shown while a topic of the app's has `softOptIn`
 * (`useBilling().softOptIn`): left unticked, the paid order joins those
 * topics; ticked, it joins none. Leaving it unticked is consent to nothing
 * else. Its words are the `pricing` labels `emailNotice` and `emailOptOut`.
 */
defineOptions({ name: 'PricingEmailOptOut' })
const optOut = defineModel<boolean>({ required: true })
const { t } = useLabels('pricing')
</script>

<template>
  <p
    data-pricing="email-opt-out"
    :data-state="optOut ? 'objected' : 'notified'"
  >
    <span data-pricing="email-notice">{{ t('emailNotice') }}</span>
    <label data-pricing="email-opt-out-label">
      <input
        v-model="optOut"
        data-pricing="email-opt-out-box"
        type="checkbox"
      >
      {{ t('emailOptOut') }}
    </label>
  </p>
</template>
