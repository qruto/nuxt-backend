<script setup lang="ts">
import PageFrame from '../components/shell/PageFrame.vue'
import { useBilling } from '../composables/use-billing'
import { useLabels } from '../composables/use-labels'

/**
 * The ready-made settings page, registered by the module at `/settings`
 * (module option `pages.settings`) behind the page guard. Workspaces, the
 * plan in whatever state its subscription is in, and credits in one place —
 * the billing entity is the active workspace — then the history: past
 * charges with their invoices for whoever manages the billing, and the
 * metered usage for every member, and the workspace's activity for its
 * owners and admins. The heading and document title are the
 * `settings.title` label.
 */
defineOptions({ name: 'BackendSettingsPage' })

const { t } = useLabels('settings')
const billing = useBilling()
</script>

<template>
  <PageFrame
    page="settings"
    family="settings"
    :title="t('title')"
  >
    <WorkspaceSettings />
    <!-- Charges and invoices are the billing managers' to read: the server refuses anyone else. -->
    <BillingHistory v-if="billing.canManage.value" />
    <UsageHistory />
    <!-- The workspace's activity is its owners' and admins' to read: for anyone else it renders nothing. -->
    <AuditLog
      scope="workspace"
      :limit="10"
    />
  </PageFrame>
</template>
