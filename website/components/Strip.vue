<script setup lang="ts">
/**
 * A tritium strip, the `strip` part: a lit tube in one of the three
 * signals. It lies flat unless `vertical`; size it with width and height
 * classes. Always decorative: say what it signals in text next to it.
 */
const props = withDefaults(defineProps<{
  tone?: 'ok' | 'warn' | 'err'
  vertical?: boolean
}>(), { tone: 'ok', vertical: false })

const TONE = { ok: 'strip-ok', warn: 'strip-warn', err: 'strip-err' } as const
</script>

<template>
  <span
    class="strip"
    :class="[TONE[props.tone], { 'strip-v': props.vertical }]"
    aria-hidden="true"
  />
</template>
