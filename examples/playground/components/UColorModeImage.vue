<script setup lang="ts">
// A stand-in for Nuxt UI's <UColorModeImage>, the one Nuxt UI component the
// synced playground layout uses: the light image, swapped for the dark one
// when the system is in dark mode. The site switches on its colour-mode
// toggle; this app has no toggle and follows the system.
defineOptions({ inheritAttrs: false })
defineProps<{ light: string, dark: string }>()
</script>

<template>
  <picture>
    <source
      :srcset="dark"
      media="(prefers-color-scheme: dark)"
    >
    <img
      :src="light"
      v-bind="$attrs"
    >
  </picture>
</template>
