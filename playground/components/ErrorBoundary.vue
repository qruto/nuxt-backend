<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue'

/**
 * Catches errors thrown by descendants (e.g. a `useQuery`/`useQuery_experimental`
 * with `throwOnError: true`, which throws from a `watchEffect`). Mirrors React's
 * `<ErrorBoundary>` — the Vue port's positional throwers are designed to be
 * caught exactly like this.
 */
const emit = defineEmits<{ captured: [Error] }>()
const error = ref<Error | null>(null)

function reset() {
  error.value = null
}

onErrorCaptured((err) => {
  error.value = err as Error
  emit('captured', err as Error)
  return false // stop propagation — keep the rest of the page alive
})

defineExpose({ reset })
</script>

<template>
  <slot
    v-if="!error"
  />
  <slot
    v-else
    name="fallback"
    :error="error"
    :reset="reset"
  />
</template>
