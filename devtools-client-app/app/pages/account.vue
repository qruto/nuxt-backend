<script setup lang="ts">
import type { Signal } from '~/utils/signal'

const state = usePanelState()
const panel = usePanel()

// Sessions and passkeys load when this page opens, and again from its buttons.
function loadLists() {
  panel.request('sessions')
  panel.request('passkeys')
}
onMounted(loadLists)
watch(() => state.bridge, bridge => bridge === 'attached' && loadLists())

const identity = computed(() => state.snapshot?.identity)
const workspace = computed(() => state.snapshot?.workspace)
const sessions = computed(() => state.snapshot?.sessions)
const passkeys = computed(() => state.snapshot?.passkeys)

const identityState = computed<{ signal: Signal, text: string }>(() => {
  if (!identity.value?.available || identity.value.isLoading) return { signal: 'off', text: 'Loading' }
  return identity.value.isAuthenticated
    ? { signal: 'ok', text: 'Signed in' }
    : { signal: 'off', text: 'Signed out' }
})

const plural = (count: number | undefined, word: string) => `${count ?? 0} ${word}${count === 1 ? '' : 's'}`
const day = (time: number | undefined) => time ? new Date(time).toLocaleDateString() : '—'
</script>

<template>
  <NCard class="p4 flex items-center gap-3 flex-wrap">
    <SignalBadge :signal="identityState.signal">
      {{ identityState.text }}
    </SignalBadge>
    <template v-if="identity?.isAuthenticated">
      <span>{{ identity.name ?? '—' }}</span>
      <span class="op65 font-mono text-xs">{{ identity.email }}</span>
      <span class="op50 font-mono text-xs">id: {{ identity.id }}</span>
    </template>
    <span
      v-else
      class="op50"
    >Sign in to the inspected app to see the account, its sessions and its workspace.</span>
    <span class="ml-auto flex gap-1">
      <NButton
        n="xs"
        icon="carbon-launch"
        title="Open auth.ts in the editor"
        @click="openBackendFile('auth.ts')"
      >
        auth.ts
      </NButton>
      <NButton
        n="xs"
        icon="carbon-launch"
        title="Open functions.ts in the editor"
        @click="openBackendFile('functions.ts')"
      >
        functions.ts
      </NButton>
    </span>
  </NCard>

  <PanelCard title="Active workspace">
    <div
      v-if="!state.info?.options.workspaces"
      class="op50"
    >
      Workspaces are off (<code>backend.workspaces: false</code>).
    </div>
    <div
      v-else-if="workspace?.available"
      class="flex flex-col gap-1"
    >
      <div class="flex items-center gap-2 flex-wrap">
        <span>{{ workspace.name }}</span>
        <span class="op50 font-mono text-xs">{{ workspace.id }}</span>
        <SignalBadge
          v-if="workspace.role"
          signal="off"
        >
          {{ workspace.role }}
        </SignalBadge>
      </div>
      <div class="op65 text-xs">
        {{ plural(workspace.members, 'member') }} · {{ plural(workspace.pendingInvitations, 'pending invitation') }} ·
        {{ plural(workspace.workspaces, 'workspace') }} in total
      </div>
    </div>
    <div
      v-else
      class="op50"
    >
      No active workspace. One is created and activated on the first sign-in.
    </div>
  </PanelCard>

  <PanelCard title="Sessions">
    <template #actions>
      <NButton
        n="xs"
        icon="carbon-renew"
        title="Load again"
        @click="panel.request('sessions')"
      />
    </template>
    <div
      v-if="sessions?.error"
      class="op65 text-xs"
    >
      {{ sessions.error }}
    </div>
    <div
      v-else-if="!sessions || (sessions.isLoading && !sessions.items.length)"
      class="op50"
    >
      Loading…
    </div>
    <div
      v-else-if="!sessions.items.length"
      class="op50"
    >
      No sessions (signed out).
    </div>
    <div
      v-for="(session, index) of sessions?.items ?? []"
      :key="index"
      class="flex items-center gap-2 text-xs"
    >
      <Led :signal="session.current ? 'ok' : 'off'" />
      <span>{{ session.device }}</span>
      <span
        v-if="session.current"
        class="op65"
      >this browser</span>
      <span class="op50 ml-auto">since {{ day(session.createdAt) }}</span>
    </div>
  </PanelCard>

  <PanelCard title="Passkeys">
    <template #actions>
      <NButton
        n="xs"
        icon="carbon-renew"
        title="Load again"
        @click="panel.request('passkeys')"
      />
    </template>
    <div
      v-if="passkeys?.error"
      class="op65 text-xs"
    >
      {{ passkeys.error }}
    </div>
    <div
      v-else-if="passkeys && !passkeys.isLoading && !passkeys.items.length"
      class="op50"
    >
      No passkeys yet. Sign-in falls back to an email code; the security page adds one.
    </div>
    <div
      v-for="(passkey, index) of passkeys?.items ?? []"
      :key="index"
      class="flex items-center gap-2 text-xs"
    >
      <Led signal="ok" />
      <span>{{ passkey.name ?? 'Unnamed passkey' }}</span>
      <span class="op65">{{ passkey.deviceType === 'multiDevice' ? 'synced' : 'this device only' }}</span>
      <span class="op50 ml-auto">added {{ day(passkey.createdAt) }}</span>
    </div>
  </PanelCard>
</template>
