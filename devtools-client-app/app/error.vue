<script setup lang="ts">
import type { NuxtError } from '#app'

// Stands in for Nuxt's default 404/500 pages, which the panel never needs: it
// is one page inside the DevTools iframe.
defineProps<{ error: NuxtError }>()
</script>

<template>
  <NPanelGrids class="h-screen">
    <span class="op50">{{ error.statusCode }} · {{ error.message }}</span>
  </NPanelGrids>
</template>
