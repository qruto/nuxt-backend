<script setup lang="ts">
/**
 * The LCD, the `lcd` part: backlit dark glass in a bezel, in both themes.
 * Put `lcd-row` lines in it, each a `pxled` and `px` glyphs (both take the
 * LED signals: `px led-warn`). `label` names the display for assistive
 * technology; set `live` when its lines change while the page is open.
 */
const props = withDefaults(defineProps<{
  label: string
  live?: boolean
}>(), { live: false })
</script>

<template>
  <div
    class="lcd grid gap-2 p-5 font-mono text-sm"
    role="group"
    :aria-label="props.label"
    :aria-live="props.live ? 'polite' : undefined"
  >
    <slot />
  </div>
</template>
