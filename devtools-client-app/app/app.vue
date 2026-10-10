<script setup lang="ts">
import { PANEL_TABS, type PanelTabId } from '~/nav'

const state = usePanelState()
const active = ref<PanelTabId>('overview')

/** New problems since the Activity tab was last looked at. */
const unseenProblems = computed(() => state.snapshot?.activity.filter(event => event.level !== 'info' && event.id > state.activitySeen).length ?? 0)

// On the way in and on the way out: what arrived while the tab was open
// was seen too.
watch(active, (tab, previous) => {
  if (tab === 'activity' || previous === 'activity') usePanel().markActivitySeen()
})
</script>

<template>
  <div class="h-screen flex of-hidden font-sans text-sm">
    <nav class="w-36 shrink-0 flex flex-col gap-0.5 p2 border-r n-border-base">
      <button
        v-for="tab of PANEL_TABS"
        :key="tab.id"
        type="button"
        class="px2 py1.5 rounded flex items-center gap-2 text-left op65 hover:(op100 n-bg-active)"
        :class="{ 'n-bg-active op100!': active === tab.id }"
        :aria-current="active === tab.id ? 'page' : undefined"
        @click="active = tab.id"
      >
        <NIcon :icon="tab.icon" />
        {{ tab.label }}
        <NBadge
          v-if="tab.id === 'activity' && unseenProblems > 0 && active !== 'activity'"
          n="amber"
          class="ml-auto"
        >
          {{ unseenProblems }}
        </NBadge>
      </button>
    </nav>

    <main class="flex-1 of-auto p4 flex flex-col gap-4">
      <NTip
        v-if="state.bridge === 'missing'"
        n="amber"
        icon="carbon-warning"
      >
        No backend bridge in the inspected app, so live state is unavailable.
        Reload the page: the bridge attaches from a dev-only plugin once the
        app has a backend URL.
      </NTip>
      <NTip
        v-else-if="state.bridge === 'outdated'"
        n="amber"
        icon="carbon-warning"
      >
        The inspected page was loaded before an upgrade of nuxt-backend. Reload it
        to see live state.
      </NTip>
      <PanelOverview v-if="active === 'overview'" />
      <PanelAccount v-else-if="active === 'account'" />
      <PanelBilling v-else-if="active === 'billing'" />
      <PanelEmail v-else-if="active === 'email'" />
      <PanelWebhooks v-else-if="active === 'webhooks'" />
      <PanelAgents v-else-if="active === 'agents'" />
      <PanelActivity v-else />
    </main>
  </div>
</template>
