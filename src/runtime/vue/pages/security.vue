<script setup lang="ts">
import { navigateTo } from '#imports'
import PageFrame from '../components/shell/PageFrame.vue'
import { useBackendPagePath } from '../composables/use-backend-page-path'
import { useLabels } from '../composables/use-labels'

/**
 * The ready-made security page, registered by the module at `/security`
 * (module option `pages.security`) behind the page guard: passkeys,
 * sessions, the account's data export and its deletion, then the account's
 * recent activity. Signing out, and deleting the account, go to the sign-in
 * page, with no `?redirect=`: the next person to sign in on this browser is
 * sent nowhere private of the last one's. The heading and document title
 * are the `security.title` label.
 */
defineOptions({ name: 'BackendSecurityPage' })
const { t } = useLabels('security')
const login = useBackendPagePath('login')
const signedOut = () => navigateTo(login.value ?? '/')
</script>

<template>
  <PageFrame
    page="security"
    family="security"
    :title="t('title')"
  >
    <SecuritySettings @signed-out="signedOut" />
    <AccountData @deleted="signedOut" />
    <AuditLog :limit="10" />
  </PageFrame>
</template>
