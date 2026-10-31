<script setup lang="ts">
import type { AdminWorkspacesTableProps } from '../../parts'
import { VNodes } from '../../utils/vnodes'
import AdminListFrame from './AdminListFrame.vue'
import { useAdminWorkspacesView } from './admin'

/** `<AdminWorkspaces>`' list: the search in a `search` landmark, the workspaces as a table, each with its "View", and the pager. */
defineOptions({ name: 'AdminWorkspacesTable' })
defineProps<AdminWorkspacesTableProps>()
const view = useAdminWorkspacesView('AdminWorkspacesTable')
const { t } = view.labels
</script>

<template>
  <AdminListFrame
    :view="view as never"
    :admin="admin"
    :rows="admin.workspaces.value"
    :search-label="t('workspaces.search')"
    :empty-text="t('workspaces.empty')"
  >
    <table data-admin="table">
      <thead data-admin="table-head">
        <tr data-admin="table-row">
          <th
            data-admin="column"
            scope="col"
          >
            {{ t('workspaces.workspace') }}
          </th>
          <th
            data-admin="column"
            scope="col"
          >
            {{ t('created') }}
          </th>
          <th
            data-admin="column"
            scope="col"
          >
            <span data-admin="visually-hidden">{{ t('workspaces.view') }}</span>
          </th>
        </tr>
      </thead>
      <tbody data-admin="table-body">
        <tr
          v-for="workspace in admin.workspaces.value"
          :key="workspace.id"
          data-admin="workspace"
        >
          <VNodes
            v-if="view.slots.workspace"
            :nodes="view.slots.workspace({ ...view.context.value, workspace }) as never"
          />
          <template v-else>
            <th
              data-admin="workspace-name"
              scope="row"
            >
              <span data-admin="workspace-title">{{ workspace.name }}</span>
              <span data-admin="workspace-slug">{{ workspace.slug }}</span>
            </th>
            <td data-admin="workspace-created">
              {{ view.date(workspace.createdAt) }}
            </td>
            <td data-admin="workspace-actions">
              <button
                data-admin="view"
                type="button"
                :aria-label="t('workspaces.viewNamed', { name: workspace.name })"
                aria-haspopup="dialog"
                @click="view.context.value.view(workspace.id)"
              >
                {{ t('workspaces.view') }}
              </button>
            </td>
          </template>
        </tr>
      </tbody>
    </table>
  </AdminListFrame>
</template>
