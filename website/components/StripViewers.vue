<script setup lang="ts">
// Who else in the workspace has this strip open, as they come and go
// (backend/presence.ts). The status line stays mounted, so a screen reader
// hears who arrives; it is empty while the reader is alone.
const props = defineProps<{ stripId: string }>()
const { others } = useRoomPresence(() => `strip:${props.stripId}`)
</script>

<template>
  <p
    role="status"
    class="muted"
  >
    <template v-if="others.length">
      Also looking: {{ others.map(person => person.name ?? 'Someone').join(', ') }}
    </template>
  </p>
</template>
