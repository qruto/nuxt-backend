<script setup lang="ts">
import { computed } from 'vue'
import { busyAttributes } from '../../a11y'
import type { AdminWorkspaceMember } from '../../composables/use-admin'
import { valueLabel } from '../../composables/use-labels'
import type { AdminWorkspaceDrawerProps } from '../../parts'
import AdminDrawerFrame from './AdminDrawerFrame.vue'
import { useAdminWorkspacesView } from './admin'

/**
 * One workspace, read-only, in a native modal dialog named by the
 * workspace: its members, each with "Impersonate" unless an administrator,
 * and its open invitations. It takes focus on its close button and closes
 * on Escape or "Close".
 */
defineOptions({ name: 'AdminWorkspaceDrawer' })
const props = defineProps<AdminWorkspaceDrawerProps>()
const view = useAdminWorkspacesView('AdminWorkspaceDrawer')
const { labels } = view
const { t } = labels
const detail = computed(() => props.admin.workspace.value)
const role = (key: string) => valueLabel(labels, 'admin', 'workspaceRoles', key)
/** A member as the list names them: their name, else their address. */
const nameOf = (member: AdminWorkspaceMember) => member.name || member.email
</script>

<template>
  <AdminDrawerFrame
    :view="view as never"
    :detail="detail"
    :title="detail?.workspace.name ?? t('workspaces.workspace')"
    :subtitle="detail?.workspace.slug ?? null"
    :not-found="t('workspaces.notFound')"
  >
    <template v-if="detail">
      <p data-admin="read-only-note">
        {{ t('workspaces.readOnly') }}
      </p>
      <section data-admin="section-members">
        <h3 data-admin="section-title">
          {{ t('workspaces.members') }}
        </h3>
        <ul data-admin="member-list">
          <li
            v-for="member in detail.members"
            :key="member.userId"
            data-admin="member"
          >
            <span data-admin="member-name">{{ t('workspaces.member', { name: nameOf(member), role: role(member.role) }) }}</span>
            <span
              v-if="member.name"
              data-admin="member-email"
            >{{ member.email }}</span>
            <span
              v-if="member.administrator"
              data-admin="badge"
            >{{ t('workspaces.administrator') }}</span>
            <span
              v-if="member.banned"
              data-admin="badge"
            >{{ t('workspaces.banned') }}</span>
            <button
              v-if="!member.administrator"
              data-admin="impersonate"
              type="button"
              v-bind="busyAttributes(view.running.value === member.userId)"
              :aria-label="view.running.value === member.userId ? undefined : t('user.impersonateNamed', { name: nameOf(member) })"
              @click="view.impersonate(member.userId, detail.workspace.id)"
            >
              {{ view.running.value === member.userId ? t('user.impersonating') : t('user.impersonate') }}
            </button>
          </li>
        </ul>
      </section>
      <section data-admin="section-invitations">
        <h3 data-admin="section-title">
          {{ t('workspaces.invitations') }}
        </h3>
        <p
          v-if="detail.invitations.length === 0"
          data-admin="invitations-empty"
        >
          {{ t('workspaces.noInvitations') }}
        </p>
        <ul
          v-else
          data-admin="invitation-list"
        >
          <li
            v-for="invitation in detail.invitations"
            :key="invitation.id"
            data-admin="invitation"
          >
            {{ t('workspaces.invitation', { email: invitation.email, role: role(invitation.role) }) }}
          </li>
        </ul>
      </section>
      <p
        v-if="detail.truncated"
        data-admin="truncated"
      >
        {{ t('truncated', { count: 100 }) }}
      </p>
    </template>
  </AdminDrawerFrame>
</template>
