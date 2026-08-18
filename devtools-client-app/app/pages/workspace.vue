<script setup lang="ts">
const state = usePanelState()

const identity = computed(() => state.snapshot?.identity)
const workspace = computed(() => state.snapshot?.workspace)
const features = computed(() => state.snapshot?.features)

const identityBadge = computed(() => {
  if (!identity.value?.available || identity.value.isLoading) return { n: 'gray', text: 'Loading' }
  return identity.value.isAuthenticated
    ? { n: 'green', text: 'Authenticated' }
    : { n: 'gray', text: 'Unauthenticated' }
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <NTip
      v-if="state.bridgeAvailable === false"
      n="orange"
      icon="carbon-warning"
    >
      No backend bridge found in this app — live identity and workspace state
      are unavailable. Reload the inspected page (the bridge attaches from a
      dev-only plugin).
    </NTip>

    <NCard class="p4 flex items-center gap-3 flex-wrap">
      <NBadge :n="identityBadge.n">
        {{ identityBadge.text }}
      </NBadge>
      <template v-if="identity?.isAuthenticated">
        <span>{{ identity.name ?? '—' }}</span>
        <span class="op65 font-mono text-xs">{{ identity.email }}</span>
        <span class="op50 font-mono text-xs">id: {{ identity.id }}</span>
      </template>
      <span
        v-else
        class="op50"
      >Sign in to the inspected app to see identity and workspace state.</span>
      <NButton
        n="xs"
        icon="carbon-launch"
        title="Open auth.ts in editor"
        class="ml-auto"
        @click="openBackendFile('auth.ts')"
      >
        auth.ts
      </NButton>
    </NCard>

    <NCard class="p4 flex flex-col gap-2">
      <div class="op50 text-xs">
        Active workspace
      </div>
      <div
        v-if="workspace?.available"
        class="flex flex-col gap-1"
      >
        <div class="flex items-center gap-2">
          <span>{{ workspace.name }}</span>
          <span class="op50 font-mono text-xs">{{ workspace.id }}</span>
        </div>
        <div class="op65 text-xs">
          {{ workspace.members ?? 0 }} member{{ (workspace.members ?? 0) === 1 ? '' : 's' }}
          · {{ workspace.pendingInvitations ?? 0 }} pending invitation{{ (workspace.pendingInvitations ?? 0) === 1 ? '' : 's' }}
        </div>
      </div>
      <div
        v-else
        class="op50"
      >
        No active workspace — one is activated automatically on sign-in.
      </div>
    </NCard>

    <NCard class="p4 flex flex-col gap-2">
      <div class="op50 text-xs">
        Feature grants
      </div>
      <div
        v-if="features?.keys.length"
        class="flex gap-2 flex-wrap"
      >
        <NBadge
          v-for="key of features.keys"
          :key="key"
          n="blue"
        >
          {{ key }}
        </NBadge>
      </div>
      <div
        v-else
        class="op50"
      >
        No granted benefits — grants arrive via billing webhooks after a purchase.
      </div>
    </NCard>
  </div>
</template>
