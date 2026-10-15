<script setup lang="ts">
// What the panel shows in place of the delivery log when it cannot be read:
// the log is admin-only, so for anyone else it says who may read it and how
// to become that on the dev deployment.
const state = usePanelState()

const feed = computed(() => state.snapshot?.webhookFeed)
const account = computed(() => state.snapshot?.identity)

// The scaffolded functions.ts exports setUserRole, the first-admin bootstrap.
const command = computed(() =>
  `npx convex run functions:setUserRole '${JSON.stringify({ email: account.value?.email ?? 'you@example.com', role: 'admin' })}'`)

const copied = ref(false)
async function copyCommand() {
  await copyText(command.value)
  copied.value = true
  setTimeout(() => copied.value = false, 1200)
}
</script>

<template>
  <div
    v-if="feed === 'admins-only'"
    class="flex flex-col gap-2 text-xs"
  >
    <div class="flex items-center gap-2 flex-wrap">
      <SignalBadge signal="warn">
        admins only
      </SignalBadge>
      <span>{{ account?.isAuthenticated ? `${account.email ?? 'This account'} is not an admin.` : 'Sign in to the inspected app as an admin.' }}</span>
    </div>
    <span class="op65">
      The log holds every account's deliveries, so <code>getWebhookDeliveries</code> answers only an account with the
      <code>admin</code> role, or one your <code>requireAdmin</code> in <code>billing.ts</code> admits. To make an
      account an admin on the dev deployment, run this, then sign in again:
    </span>
    <div class="flex items-center gap-2">
      <code class="font-mono op65 n-bg-active rounded px2 py0.5">{{ command }}</code>
      <NButton
        n="xs"
        :icon="copied ? 'carbon-checkmark' : 'carbon-copy'"
        title="Copy"
        @click="copyCommand()"
      />
    </div>
  </div>
  <div
    v-else-if="feed === 'unavailable'"
    class="op50"
  >
    <code>billing.ts</code> does not export <code>getWebhookDeliveries</code>, so the log cannot be read. Re-export it
    from <code>billing.functions</code>.
  </div>
</template>
