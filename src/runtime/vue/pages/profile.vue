<script setup lang="ts">
import PageFrame from '../components/shell/PageFrame.vue'
import { useLabels } from '../composables/use-labels'

/**
 * The ready-made profile page, registered by the module at `/profile`
 * (module option `pages.profile`) behind the page guard. The heading and
 * document title are the `profile.title` label.
 */
defineOptions({ name: 'BackendProfilePage' })
const { t } = useLabels('profile')
</script>

<template>
  <PageFrame
    page="profile"
    family="profile"
    :title="t('title')"
  >
    <ProfileSettings />
  </PageFrame>
</template>
