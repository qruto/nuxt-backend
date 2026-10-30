<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, ref, resolveComponent, useId, watch, type Component } from 'vue'
import { useRuntimeConfig } from '#imports'
import { type BackendLabels, type LabelKey, useLabels } from '../../composables/use-labels'
import { ADMIN_TABS, sortAdminTabs, type AdminAppTab } from './admin-tabs'
import { hasBackend, panelLoading } from './admin-views'

/**
 * The admin console: the tabs of `ADMIN_TABS` the app has (accounts,
 * workspaces, the whole activity trail, flags, launch access, the waitlist,
 * the job queue, the app's health) and the app's own, in one tab bar
 * by `order`, one panel at a time. A WAI-ARIA tab list: the selected tab is
 * the one stop in the list, the arrow keys move between tabs and select
 * them, Home and End go to the first and the last. A built-in panel is
 * loaded the first time its tab opens. An app's tab is a page of the app
 * (`adminTab` in its page meta), which the page frame passes in the default
 * slot: selecting it asks the page to navigate (`open`).
 *
 * @internal
 */
defineOptions({ name: 'AdminConsole' })

const props = withDefaults(defineProps<{
  /** The built-in tab to show, by key (the page's `?tab=`). Default: the first. */
  tab?: string
  /** The app's tabs, from the pages that name `adminTab`. */
  appTabs?: readonly AdminAppTab[]
  /** Whether a page of the app shows in the panel (the default slot) instead of a built-in tab. */
  page?: boolean
  /** The `key` of the app tab that page belongs to; none for a page the bar does not list. */
  pageTab?: string
  /** An account the Users tab opens in its drawer, by id (the page's `?user=`). */
  userId?: string
}>(), { tab: undefined, appTabs: () => [], page: false, pageTab: undefined, userId: undefined })
const emit = defineEmits({
  'update:tab': (_key: string) => true,
  'open': (_path: string) => true,
})
defineSlots<{
  /** The app page the console is on, when it is not one of the built-in tabs. */
  default: () => unknown
}>()

// The registered components a tab shows, resolved by name the way a tag is,
// so an app's own `AdminUsers` replaces the packaged one here too.
const registered: Record<string, Component | string> = {
  AdminUsers: resolveComponent('AdminUsers'),
  AdminWorkspaces: resolveComponent('AdminWorkspaces'),
  AuditLog: resolveComponent('AuditLog'),
}
// The built-in tabs this app has: one that reads a backend file of its own
// (`needs`, or a view's of `anyOf`) shows once the app has it, one that
// needs a setting (`when`, the Queue tab's job queue) once the public
// runtime config says so.
const config = (useRuntimeConfig().public.backend ?? {}) as Record<string, unknown>
const tabs = ADMIN_TABS.filter(entry => hasBackend(entry) && (entry.when?.(config) ?? true))

const { t } = useLabels('admin')

/** Each other tab's panel, made once and loaded the first time the tab opens; it says so while its code loads. */
const panels = new Map<string, Component>()
const loadingComponent = panelLoading(() => t('loading'))
function panelOf(key: string): Component | string | null {
  const tab = tabs.find(entry => entry.key === key)
  if (!tab) return null
  if (tab.component) return registered[tab.component] ?? null
  let panel = panels.get(key)
  if (!panel && tab.panel) panels.set(key, panel = defineAsyncComponent({ loader: tab.panel as () => Promise<Component>, loadingComponent }))
  return panel ?? null
}
const id = useId()
const tabLabel = (key: string) => t(`tabs.${key}` as LabelKey<BackendLabels['admin']>)

/** One tab of the bar: a built-in tab, or an app's page (`path`). */
interface BarTab {
  key: string
  label: string
  order: number
  icon?: string
  path?: string
}
const bar = computed<BarTab[]>(() => sortAdminTabs<BarTab>([
  ...tabs.map(entry => ({ key: entry.key, label: tabLabel(entry.key), order: entry.order })),
  ...props.appTabs.map(entry => ({ key: entry.key, label: entry.label, order: entry.order, icon: entry.icon, path: entry.path })),
]))

// The tab picked here shows at once; the address follows (`update:tab`),
// and a later change of the address (a link, back and forward) wins.
const chosen = ref<string | null>(null)
watch(() => props.tab, () => {
  chosen.value = null
})
/** The selected tab's key; `null` on a page of the app that the bar does not list. */
const current = computed<string | null>(() => {
  if (props.page) return props.pageTab && props.appTabs.some(entry => entry.key === props.pageTab) ? props.pageTab : null
  const wanted = chosen.value ?? props.tab
  return tabs.some(entry => entry.key === wanted) ? wanted! : tabs[0]!.key
})
const currentTab = computed(() => tabs.find(entry => entry.key === current.value))
const list = ref<HTMLElement | null>(null)
/** The tab that takes the keyboard's one stop: the selected one, or the first on a page the bar does not list. */
const stop = computed(() => current.value ?? bar.value[0]!.key)

async function select(entry: BarTab, focus = false): Promise<void> {
  if (entry.path) emit('open', entry.path)
  else {
    chosen.value = entry.key
    emit('update:tab', entry.key)
  }
  if (!focus) return
  await nextTick()
  list.value?.querySelector<HTMLElement>(`[data-admin-tab="${entry.key}"]`)?.focus()
}
function keydown(event: KeyboardEvent): void {
  const tabs = bar.value
  const at = tabs.findIndex(entry => entry.key === stop.value)
  const moves: Record<string, number> = {
    ArrowRight: (at + 1) % tabs.length,
    ArrowLeft: (at - 1 + tabs.length) % tabs.length,
    Home: 0,
    End: tabs.length - 1,
  }
  const to = Object.hasOwn(moves, event.key) ? moves[event.key]! : null
  if (to === null) return
  event.preventDefault()
  void select(tabs[to]!, true)
}
</script>

<template>
  <div data-admin="console">
    <div
      ref="list"
      data-admin="tabs"
      role="tablist"
      :aria-label="t('tabsLabel')"
      @keydown="keydown"
    >
      <button
        v-for="entry in bar"
        :id="`${id}-tab-${entry.key}`"
        :key="entry.key"
        data-admin="tab"
        :data-admin-tab="entry.key"
        :data-state="entry.key === current ? 'active' : 'inactive'"
        type="button"
        role="tab"
        :aria-selected="entry.key === current ? 'true' : 'false'"
        :aria-controls="`${id}-panel`"
        :tabindex="entry.key === stop ? 0 : -1"
        @click="select(entry)"
      >
        <span
          v-if="entry.icon"
          data-admin="tab-icon"
          :class="entry.icon"
          aria-hidden="true"
        />
        {{ entry.label }}
      </button>
    </div>
    <div
      :id="`${id}-panel`"
      data-admin="panel"
      role="tabpanel"
      :aria-labelledby="current ? `${id}-tab-${current}` : undefined"
      :aria-label="current ? undefined : t('title')"
      tabindex="0"
    >
      <slot v-if="page" />
      <component
        :is="panelOf(currentTab.key)!"
        v-else-if="currentTab && panelOf(currentTab.key)"
        :key="currentTab.key"
        v-bind="currentTab.key === 'users' && userId ? { ...currentTab.props, userId } : currentTab.props"
      />
    </div>
  </div>
</template>
