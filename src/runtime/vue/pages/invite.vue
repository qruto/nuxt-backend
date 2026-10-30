<script setup lang="ts">
import InviteRedeem from '../components/auth/InviteRedeem.vue'
import PageFrame from '../components/shell/PageFrame.vue'
import { useLabels } from '../composables/use-labels'

/**
 * The ready-made page an access link opens, registered by the module at
 * `/invite` (module option `pages.invite`): it reads the token from the
 * link's fragment, strips it from the address, checks it, and sends the
 * person on to sign in, the token kept for the tab. An app page at the same
 * path replaces it; build one with `useInvite`.
 */
defineOptions({ name: 'InvitePage' })
const { t } = useLabels('auth')
</script>

<template>
  <PageFrame
    page="invite"
    family="auth"
    :title="t('invitePage.title')"
    noindex
  >
    <InviteRedeem />
  </PageFrame>
</template>
