<script setup lang="ts">
import GiftList from '../components/billing/GiftList.vue'
import PageFrame from '../components/shell/PageFrame.vue'
import { useLabels } from '../composables/use-labels'

/**
 * The ready-made gifts page, registered by the module at `/gifts` (module
 * option `pages.gifts`) behind the page guard. The gifts a person received,
 * to claim into a workspace they manage, and the gifts they sent, which they
 * can resend, address to someone else, date again or cancel until they are
 * claimed. An app page at the same path replaces it: build one on
 * `useGifts()`. The heading and document title are the `gift.title` label.
 */
defineOptions({ name: 'BackendGiftsPage' })

const { t } = useLabels('gift')
</script>

<template>
  <PageFrame
    page="gifts"
    family="gift"
    :title="t('title')"
  >
    <GiftList />
  </PageFrame>
</template>
