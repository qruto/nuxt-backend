<script setup lang="ts">
import { provide } from 'vue'
import { IN_FRAME } from './connection-status'

/**
 * The status every ready-made page's frame shows: a `<ConnectionStatus>`
 * that says nothing while the app shows one of its own, in a layout around
 * the page, so a drop is not announced twice.
 *
 * @internal
 */
defineOptions({ name: 'FrameConnectionStatus' })
provide(IN_FRAME, true)
</script>

<template>
  <ConnectionStatus />
</template>
