<script setup lang="ts">
usePanelState()

const tabs = [
  { to: '/', label: 'Overview', icon: 'carbon-dashboard' },
  { to: '/billing', label: 'Billing', icon: 'carbon-purchase' },
  { to: '/workspace', label: 'Workspace', icon: 'carbon-group' },
]
</script>

<template>
  <div class="h-screen flex of-hidden font-sans text-sm">
    <nav class="w-36 shrink-0 flex flex-col gap-0.5 p2 border-r border-base">
      <NuxtLink
        v-for="tab of tabs"
        :key="tab.to"
        :to="tab.to"
        class="px2 py1.5 rounded flex items-center gap-2 op65 hover:(op100 bg-active)"
        active-class="bg-active op100!"
      >
        <NIcon :icon="tab.icon" />
        {{ tab.label }}
      </NuxtLink>
    </nav>

    <main class="flex-1 of-auto p4">
      <NuxtPage />
    </main>
  </div>
</template>
