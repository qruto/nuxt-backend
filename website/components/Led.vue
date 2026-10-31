<script setup lang="ts">
/**
 * An LED, the `led` part: a lit dome in one of the three signals, or off.
 * `pulse` lets a live light breathe; `size="lg"` is the larger lamp;
 * `shape="square"` gives a second meaning a shape of its own, so it never
 * differs from a round light by colour alone. It is decorative unless it
 * gets a `label`, which becomes its accessible name.
 */
const props = withDefaults(defineProps<{
  tone?: 'ok' | 'warn' | 'err' | 'off'
  size?: 'md' | 'lg'
  shape?: 'round' | 'square'
  pulse?: boolean
  label?: string
}>(), { tone: 'ok', size: 'md', shape: 'round', pulse: false, label: undefined })

// Spelled out, so Tailwind's scan finds every class it must emit.
const TONE = { ok: 'led-ok', warn: 'led-warn', err: 'led-err', off: 'led-off' } as const
</script>

<template>
  <span
    class="led"
    :class="[TONE[props.tone], { 'led-lg': props.size === 'lg', 'led-square': props.shape === 'square', 'led-pulse': props.pulse }]"
    :role="props.label ? 'img' : undefined"
    :aria-label="props.label"
    :aria-hidden="props.label ? undefined : 'true'"
  />
</template>
