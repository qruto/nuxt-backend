<script setup lang="ts">
import { PANEL_PAGES } from '~/nav'

const state = usePanelState()
</script>

<template>
  <div class="h-screen flex of-hidden font-sans text-sm">
    <nav class="w-36 shrink-0 flex flex-col gap-0.5 p2 border-r border-base">
      <NuxtLink
        v-for="page of PANEL_PAGES"
        :key="page.to"
        :to="page.to"
        class="px2 py1.5 rounded flex items-center gap-2 op65 hover:(op100 bg-active)"
        active-class="bg-active op100!"
      >
        <NIcon :icon="page.icon" />
        {{ page.label }}
      </NuxtLink>
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
      <NuxtPage />
    </main>
  </div>
</template>
