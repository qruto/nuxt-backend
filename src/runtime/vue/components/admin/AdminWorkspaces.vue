<script setup lang="ts">
import { computed, useId } from 'vue'
import { reloadNuxtApp } from '#imports'
import { formatBillingDate } from '../../composables/billing-format'
import { useAdmin } from '../../composables/use-admin'
import { useLabels, type BackendLabels, type LabelOverrides } from '../../composables/use-labels'
import { useReauthentication } from '../../composables/use-reauthentication'
import { usePageTurns } from '../../utils/page-turns'
import AdminListTail from './AdminListTail.vue'
import { type AdminWorkspacesSlotContext, type AdminWorkspacesSlots, provideAdminWorkspacesView, useAdminList } from './admin'

/**
 * Every workspace of the app, read-only, for its administrators: a search
 * by name, a page at a time (`AdminWorkspacesTable`), and a drawer with one
 * workspace's members and open invitations (`AdminWorkspaceDrawer`). An
 * administrator acts inside a workspace only by impersonating a member
 * ("Impersonate" on their row), which opens the visit in that workspace and
 * takes a recent sign-in; a member who is an administrator offers none.
 *
 * `data-admin` attributes, a slot for every region, and its copy from the
 * `admin` labels. Renders nothing for a caller who is no administrator.
 * Built on `useAdmin({ list: 'workspaces' })`.
 *
 * @example
 * ```vue
 * <AdminWorkspaces landing="/dashboard" />
 * ```
 */
defineOptions({ name: 'AdminWorkspaces' })

const props = withDefaults(defineProps<{
  /** Workspaces per page, at most 100. Default 20. */
  limit?: number
  /** Where an impersonation lands: the app reloads there as the member. Default `/`. */
  landing?: string
  /** Copy for this component, over `appConfig.backend.labels.admin` and the translations. */
  labels?: LabelOverrides<BackendLabels['admin']>
}>(), { limit: undefined, landing: '/', labels: undefined })

const emit = defineEmits({
  impersonated: (_userId: string, _workspaceId: string) => true,
  error: (_message: string) => true,
})
const slots = defineSlots<AdminWorkspacesSlots>()

const labels = useLabels('admin', () => props.labels)
const { t, errorMessage, locale } = labels
const { withReauthentication } = useReauthentication()
const id = useId()
const list = useAdminList({ labels, onError: message => emit('error', message) })
const { selected } = list
const admin = useAdmin({ list: 'workspaces', search: list.search, limit: () => props.limit, workspaceId: selected })
const items = computed(() => admin.workspaces.value ?? [])

/** Act inside a workspace by impersonating a member: the visit opens there, then the app reloads as them. */
async function impersonate(userId: string, workspaceId: string): Promise<void> {
  // The visit has begun once this resolves, even when the workspace could
  // not be made active (useAdmin keeps that in `error`).
  const done = await list.act(userId, async () => {
    await withReauthentication(() => admin.impersonate(userId, { workspaceId }))
  })
  if (!done) return
  emit('impersonated', userId, workspaceId)
  reloadNuxtApp({ path: props.landing, force: true })
}

const context = computed<AdminWorkspacesSlotContext>(() => ({
  admin,
  items: items.value,
  isLoading: admin.isLoading.value,
  error: admin.error.value ? errorMessage(admin.error.value) : null,
  view: list.open,
}))
const pages = usePageTurns(admin, 'admin')

const view = provideAdminWorkspacesView({
  ...list,
  labels,
  context,
  slots,
  id,
  pages,
  date: value => formatBillingDate(value, { dateStyle: 'medium' }, locale.value),
  impersonate,
})

const drawn = computed(() => items.value.find(workspace => workspace.id === selected.value) ?? admin.workspace.value?.workspace ?? null)
const busyList = computed(() => admin.isLoading.value || pages.turning.value !== null)
</script>

<template>
  <section
    v-if="!admin.isRefused.value"
    data-admin="workspaces"
    :aria-busy="busyList ? 'true' : undefined"
  >
    <slot
      name="header"
      v-bind="context"
    >
      <h2 data-admin="title">
        {{ t('workspaces.title') }}
      </h2>
    </slot>
    <p data-admin="read-only-note">
      {{ t('workspaces.readOnly') }}
    </p>
    <AdminWorkspacesTable :admin="admin" />
    <AdminListTail
      :view="view as never"
      :admin="admin"
      :open="Boolean(selected)"
    />
    <AdminWorkspaceDrawer
      v-if="selected && drawn"
      :admin="admin"
      :workspace="drawn"
    />
    <ReauthenticateDialog />
  </section>
</template>
