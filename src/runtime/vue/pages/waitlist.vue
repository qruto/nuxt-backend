<script setup lang="ts">
import WaitlistStatus from '../components/auth/WaitlistStatus.vue'
import PageFrame from '../components/shell/PageFrame.vue'
import { useLabels } from '../composables/use-labels'

/**
 * The ready-made page a waitlist status link opens, registered by the module
 * at `/waitlist` (module option `pages.waitlist`): it reads the signed token
 * from the link's fragment and shows the person's place in the line, live,
 * with the link to share and a way to leave. It asks for no sign-in code.
 * A status link is a key to one person's place, so the page stays out of
 * search results. An app page at the same path replaces it; build one with
 * `useWaitlist`.
 */
defineOptions({ name: 'WaitlistPage' })
const { t } = useLabels('waitlist')
</script>

<template>
  <PageFrame
    page="waitlist"
    family="waitlist"
    :title="t('page.title')"
    noindex
  >
    <WaitlistStatus />
  </PageFrame>
</template>
