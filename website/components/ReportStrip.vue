<script setup lang="ts">
import { api } from '#backend/api'

// Moderation misses things: a report reaches the admin console's Reports tab.
const props = defineProps<{ stripId: string }>()
const report = useMutation(api.admin.reportContent)
const sent = ref(false)

async function send() {
  await report({ subject: { table: 'strips', id: props.stripId }, reason: 'abuse' })
  sent.value = true
}
</script>

<template>
  <p v-if="sent">
    Thanks. Our team will look at it.
  </p>
  <button
    v-else
    type="button"
    @click="send"
  >
    Report this strip
  </button>
</template>
