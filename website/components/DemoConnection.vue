<!-- Illustrative live demo embedded in the docs: the real Convex WebSocket state.
     Styled with Nuxt UI so it matches the docs theme (not the playground shell). -->
<script setup lang="ts">
// Client-only: subscribing during SSR/prerender opens a Convex WebSocket (the
// lazy `.sync` client) that keeps the build process alive. The chip reflects the
// browser's live connection, so it only needs to run on the client.
const conn = import.meta.client ? useConvexConnectionState() : null
const isConnected = computed(() => !!conn?.value.isWebSocketConnected)
</script>

<template>
  <UCard
    variant="subtle"
    class="my-4"
  >
    <div class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-2">
        <span class="relative flex size-2.5">
          <span
            v-if="isConnected"
            class="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60"
          />
          <span
            class="relative inline-flex size-2.5 rounded-full"
            :class="isConnected ? 'bg-primary' : 'bg-error'"
          />
        </span>
        <span class="font-medium">{{ isConnected ? 'Convex live' : 'Offline' }}</span>
      </div>
      <code class="text-xs text-muted">useConvexConnectionState()</code>
    </div>
    <p class="mt-2 text-sm text-muted">
      This reflects the real WebSocket connection from your browser to Convex —
      toggle your network to watch it flip live.
    </p>
  </UCard>
</template>
