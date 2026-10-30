<script setup lang="ts">
import type { AdminUsersTableProps } from '../../parts'
import { VNodes } from '../../utils/vnodes'
import AdminListFrame from './AdminListFrame.vue'
import { useAdminUsersView } from './admin'

/** `<AdminUsers>`' list: the search in a `search` landmark, the accounts as a table, each with its "View", and the pager. */
defineOptions({ name: 'AdminUsersTable' })
defineProps<AdminUsersTableProps>()
const view = useAdminUsersView('AdminUsersTable')
const { t } = view.labels
const nameOf = (user: { name?: string | null, email: string }) => user.name || user.email
</script>

<template>
  <AdminListFrame
    :view="view as never"
    :admin="admin"
    :rows="admin.users.value"
    :search-label="t('users.search')"
    :empty-text="t('users.empty')"
  >
    <table data-admin="table">
      <thead data-admin="table-head">
        <tr data-admin="table-row">
          <th
            data-admin="column"
            scope="col"
          >
            {{ t('users.account') }}
          </th>
          <th
            data-admin="column"
            scope="col"
          >
            {{ t('users.role') }}
          </th>
          <th
            data-admin="column"
            scope="col"
          >
            {{ t('users.status') }}
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
            <span data-admin="visually-hidden">{{ t('users.view') }}</span>
          </th>
        </tr>
      </thead>
      <tbody data-admin="table-body">
        <tr
          v-for="user in admin.users.value"
          :key="user.id"
          data-admin="user"
          :data-banned="user.banned || undefined"
        >
          <VNodes
            v-if="view.slots.user"
            :nodes="view.slots.user({ ...view.context.value, user }) as never"
          />
          <template v-else>
            <th
              data-admin="user-account"
              scope="row"
            >
              <span data-admin="user-name">{{ nameOf(user) }}</span>
              <span
                v-if="user.name"
                data-admin="user-email"
              >{{ user.email }}</span>
              <span
                v-if="view.own(user)"
                data-admin="badge"
              >{{ t('users.you') }}</span>
            </th>
            <td data-admin="user-role">
              {{ view.roleWord(user.role) }}
            </td>
            <td data-admin="user-status">
              {{ view.status(user) }}
            </td>
            <td data-admin="user-created">
              {{ view.date(user.createdAt) }}
            </td>
            <td data-admin="user-actions">
              <button
                data-admin="view"
                type="button"
                :aria-label="t('users.viewNamed', { name: nameOf(user) })"
                aria-haspopup="dialog"
                @click="view.context.value.view(user.id)"
              >
                {{ t('users.view') }}
              </button>
            </td>
          </template>
        </tr>
      </tbody>
    </table>
  </AdminListFrame>
</template>
