<script setup lang="ts">
import { SIGNAL_LED, type Signal } from '~/utils/signal'

defineProps<{ signal: Signal }>()
</script>

<template>
  <span
    class="inline-block w-2 h-2 rounded-full shrink-0"
    :class="SIGNAL_LED[signal]"
    aria-hidden="true"
  />
</template>
