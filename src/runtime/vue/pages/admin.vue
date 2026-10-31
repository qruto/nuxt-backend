<script setup lang="ts">
import { computed } from 'vue'
import { navigateTo, useRoute, useRouter } from '#imports'
import AdminConsole from '../components/admin/AdminConsole.vue'
import { activeAppTab, adminAppTabs } from '../components/admin/admin-tabs'
import PageFrame from '../components/shell/PageFrame.vue'
import { useLabels } from '../composables/use-labels'

/**
 * The ready-made admin console, registered by the module at `/admin`
 * (module option `pages.admin`) for the app-wide `admin` role: it is a hidden
 * page, so the page guard answers a signed-out visitor and anyone without the
 * role with the 404 of a page that does not exist. Its built-in tabs are
 * accounts, workspaces (read-only), the whole activity trail and the app's
 * health; the open one is the address's `?tab=`. The app's own tabs are its
 * pages below the console's path with `adminTab` in their page meta (the
 * module nests them as this page's children): their rules guard them too,
 * the bar lists them beside the built-in ones, and the open one shows in the
 * console's panel. The heading and document title are the `admin.title`
 * label.
 */
defineOptions({ name: 'BackendAdminPage' })
const { t } = useLabels('admin')
const route = useRoute()
const router = useRouter()
// This page's own record, the first one matched: its path is the console's
// wherever the app mounts it (`pages.admin`, a locale prefix).
const adminPath = computed(() => route.matched[0]?.path ?? route.path)
const appTabs = computed(() => adminAppTabs(router.getRoutes(), adminPath.value))
const onPage = computed(() => route.matched.length > 1)
const pageTab = computed(() => activeAppTab(appTabs.value, route.path)?.key)
const tab = computed(() => (typeof route.query.tab === 'string' ? route.query.tab : undefined))
// An account the Users tab opens (`?tab=users&user=<id>`, the Reports tab's link to an author).
const userId = computed(() => (typeof route.query.user === 'string' && route.query.user ? route.query.user : undefined))
/** Another tab: the account a link opened stays behind. */
const select = (key: string) => {
  const { user: _user, ...query } = route.query
  return navigateTo(
    { path: adminPath.value, query: onPage.value ? { tab: key } : { ...query, tab: key } },
    { replace: !onPage.value },
  )
}
</script>

<template>
  <PageFrame
    page="admin"
    family="admin"
    :title="t('title')"
  >
    <AdminConsole
      :tab="tab"
      :app-tabs="appTabs"
      :page="onPage"
      :page-tab="pageTab"
      :user-id="userId"
      @update:tab="select"
      @open="navigateTo($event)"
    >
      <NuxtPage />
    </AdminConsole>
  </PageFrame>
</template>
