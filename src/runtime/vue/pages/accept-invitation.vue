<script setup lang="ts">
import PageFrame from '../components/shell/PageFrame.vue'
import { useLabels } from '../composables/use-labels'

/**
 * The ready-made invitation accept page, registered by the module at
 * `/accept-invitation` (module option `pages.acceptInvitation`) behind the
 * page guard — so an emailed accept link signs the invitee in (or up) and
 * lands here. An app page at the same path replaces it. The heading and
 * document title are the `invitation.title` label.
 */
defineOptions({ name: 'AcceptInvitationPage' })
const { t } = useLabels('invitation')
</script>

<template>
  <PageFrame
    page="acceptInvitation"
    family="invitation"
    :title="t('title')"
  >
    <AcceptInvitation />
  </PageFrame>
</template>
