<script setup lang="ts">
// Who else in the workspace has this strip open, as they come and go
// (backend/presence.ts). Hidden while the reader is alone.
const props = defineProps<{ stripId: string }>()
const { others } = useRoomPresence(() => `strip:${props.stripId}`)
</script>

<template>
  <p
    v-if="others.length"
    class="muted"
  >
    Also looking: {{ others.map(person => person.name ?? 'Someone').join(', ') }}
  </p>
</template>
