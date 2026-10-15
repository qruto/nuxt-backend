<script setup lang="ts">
/**
 * This page's Convex connection, for a block inside <DeferredBackend>: the
 * slot gets `connected`, whether the WebSocket is up right now.
 */
const state = useConvexConnectionState()
</script>

<template>
  <slot :connected="state.isWebSocketConnected" />
</template>
