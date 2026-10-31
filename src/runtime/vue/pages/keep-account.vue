<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from '#imports'
import KeepAccount from '../components/account/KeepAccount.vue'
import PageFrame from '../components/shell/PageFrame.vue'
import { useLabels } from '../composables/use-labels'

/**
 * The ready-made "keep my account" page, registered by the module at
 * `/account/keep` (module option `pages.keepAccount`), public: the link in
 * the email of a scheduled deletion opens it, signed in or not. One button
 * cancels the deletion the link's `?token=` names; opening the page changes
 * nothing. An app page at the same path replaces it: call
 * `cancelAccountDeletion({ token })` from `backend/account.ts` yourself.
 */
defineOptions({ name: 'KeepAccountPage' })
const route = useRoute()
const { t } = useLabels('deletion')
const token = computed(() => (typeof route.query.token === 'string' && route.query.token ? route.query.token : undefined))
</script>

<template>
  <PageFrame
    page="keepAccount"
    family="deletion"
    :title="t('title')"
    noindex
  >
    <KeepAccount :token="token" />
  </PageFrame>
</template>
