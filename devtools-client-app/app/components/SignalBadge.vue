<script setup lang="ts">
import { SIGNAL_COLOR, type Signal } from '~/utils/signal'

defineProps<{ signal: Signal }>()
</script>

<template>
  <!-- A class, not the kit's `n` attribute: a bound attribute value is
       invisible to UnoCSS, while the n-<color> classes are safelisted. -->
  <NBadge :class="`n-${SIGNAL_COLOR[signal]}`">
    <slot />
  </NBadge>
</template>
