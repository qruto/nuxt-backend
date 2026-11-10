<script setup lang="ts">
import WaitlistStatus from '../components/auth/WaitlistStatus.vue'
import PageFrame from '../components/shell/PageFrame.vue'
import { useLabels } from '../composables/use-labels'

/**
 * The ready-made waitlist page, registered by the module at `/waitlist`
 * (module option `pages.waitlist`): a status link opens it with the signed
 * token in its fragment, and it shows the person's place in the line, live,
 * with the link to share and a way to leave, asking for no sign-in code.
 * Without one, in early access, it is the join (`<WaitlistForm>`). The
 * token leaves the address on arrival and the tab keeps it, with a join's,
 * through a reload. It follows the launch phase and a signed-in visitor. A
 * status link is a key to one person's place, so the page stays out of
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
