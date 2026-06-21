<script setup lang="ts">
import { computed } from 'vue'

/**
 * A tiny, dependency-free stroke-icon set (24×24, currentColor) tuned for the
 * playground's nav + page headers. Simple geometric forms that read crisply at
 * small sizes and inherit color/size from their parent.
 */
const props = withDefaults(defineProps<{
  name: string
  size?: number | string
}>(), { size: 18 })

const paths: Record<string, string> = {
  overview: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  database: 'M5 6c0-1.1 3.1-2 7-2s7 .9 7 2-3.1 2-7 2-7-.9-7-2zM5 6v12c0 1.1 3.1 2 7 2s7-.9 7-2V6M5 12c0 1.1 3.1 2 7 2s7-.9 7-2',
  mutate: 'M14.5 5.5l4 4M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z',
  pagination: 'M4 6h16M4 12h16M4 18h10',
  connection: 'M7 12a3 3 0 1 0-3-3M17 12a3 3 0 1 1 3 3M7 9l10 6',
  storage: 'M12 3v11M8 7l4-4 4 4M5 16v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  server: 'M4 5h16v5H4zM4 14h16v5H4zM7.5 7.5h.01M7.5 16.5h.01',
  subscription: 'M5 12a7 7 0 0 1 7-7M5 12a7 7 0 0 0 7 7M9 12a3 3 0 0 1 3-3M12 12h.01',
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20a7 7 0 0 1 14 0',
  billing: 'M3 7h18v10H3zM3 11h18M7 15h3',
  features: 'M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z',
  credits: 'M9 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM14.5 8.2a5 5 0 1 1 0 9.6',
  email: 'M3 6h18v12H3zM3 7l9 6 9-6',
  workflows: 'M6 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 22a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 6v8a4 4 0 0 0 4 4h6',
  shield: 'M12 3l7 3v6c0 4.2-2.9 7.5-7 9-4.1-1.5-7-4.8-7-9V6z',
  bolt: 'M13 3L4 14h7l-1 7 9-11h-7z',
  key: 'M15 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM12 9l-8 8v3h3l1-1h2v-2h2l1-1',
  reset: 'M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4',
  send: 'M4 12l16-7-7 16-2.5-6.5z',
  check: 'M5 12l4 4 10-10',
  external: 'M14 4h6v6M20 4l-9 9M19 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5',
  signout: 'M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3M16 17l5-5-5-5M21 12H9',
}

const d = computed(() => paths[props.name] ?? paths.overview)
const px = computed(() => (typeof props.size === 'number' ? `${props.size}px` : props.size))
</script>

<template>
  <svg
    :width="px"
    :height="px"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    class="icon"
  >
    <path :d="d" />
  </svg>
</template>

<style scoped>
.icon { display: block; flex-shrink: 0; }
</style>
