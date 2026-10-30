<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from '#imports'
import EmailUnsubscribe from '../components/account/EmailUnsubscribe.vue'
import PageFrame from '../components/shell/PageFrame.vue'
import { useBackendPagePath } from '../composables/use-backend-page-path'
import { useLabels } from '../composables/use-labels'

/**
 * The ready-made unsubscribe page, registered by the module at
 * `/unsubscribe` (module option `pages.unsubscribe`), public: a topic
 * email's unsubscribe link (`?token=`) and a double opt-in's confirmation
 * link (`?confirm=`) open it, signed in or not. One press leaves the topic,
 * or every topic, or confirms; opening the page changes nothing. An app
 * page at the same path replaces it: call `getEmailLink`,
 * `unsubscribeByLink` and `confirmEmailTopic` from `backend/email.ts`.
 */
defineOptions({ name: 'UnsubscribePage' })
const route = useRoute()
const { t } = useLabels('preferences')
const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined)
const link = computed(() => ({ token: text(route.query.token), confirm: text(route.query.confirm) }))
const profile = useBackendPagePath('profile')
</script>

<template>
  <PageFrame
    page="unsubscribe"
    family="unsubscribe"
    :title="link.confirm ? t('confirm.title') : t('unsubscribe.title')"
    noindex
  >
    <EmailUnsubscribe
      :link="link"
      :manage-to="profile ?? undefined"
    />
  </PageFrame>
</template>
