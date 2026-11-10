<script setup lang="ts">
import GiftForm from '../components/billing/GiftForm.vue'
import GiftList from '../components/billing/GiftList.vue'
import PageFrame from '../components/shell/PageFrame.vue'
import { useLabels } from '../composables/use-labels'
import { usePricing } from '../composables/use-pricing'

/**
 * The ready-made gifts page, registered by the module at `/gifts` (module
 * option `pages.gifts`) behind the page guard. The form that buys a gift
 * (`<GiftForm>`: a credit pack or a plan pass, for whom, with a note and a
 * day), then the gifts a person received, to claim into a workspace they
 * manage, and the gifts they sent, which they can resend, address to
 * someone else, date again or cancel until they are claimed
 * (`<GiftList>`). While billing is not launched on the deployment, it says
 * gifts open with the plans (the `gift.soon` label) and offers no form. An
 * app page at the same path replaces it: place `<GiftForm>` and
 * `<GiftList>` in it, or build it on `useGiftForm()` and `useGiftList()`.
 * The heading and document title are the `gift.title` label.
 */
defineOptions({ name: 'BackendGiftsPage' })

const { t } = useLabels('gift')
const { launched } = usePricing({ actions: false })
</script>

<template>
  <PageFrame
    page="gifts"
    family="gift"
    :title="t('title')"
  >
    <p
      v-if="launched === false"
      data-gift="soon"
      role="status"
    >
      {{ t('soon') }}
    </p>
    <GiftForm v-if="launched !== false" />
    <GiftList />
  </PageFrame>
</template>
