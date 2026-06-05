<script setup lang="ts">
withDefaults(defineProps<{
  tone?: 'signal' | 'ok' | 'warn' | 'err' | 'xp' | 'muted'
  pulse?: boolean
}>(), { tone: 'signal', pulse: true })
</script>

<template>
  <span
    class="dot"
    :class="[tone, { pulse }]"
  />
</template>

<style scoped>
.dot {
  display: inline-block;
  width: 6.5px;
  height: 6.5px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--c, var(--signal));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--c, var(--signal)) 25%, transparent);
}
.dot.signal { --c: var(--signal); }
.dot.ok     { --c: var(--ok); }
.dot.warn   { --c: var(--warn); }
.dot.err    { --c: var(--err); }
.dot.xp     { --c: var(--xp); }
.dot.muted  { --c: var(--ink-faint); box-shadow: none; }
.dot.pulse  { animation: pulse-dot 2.1s infinite; }
</style>
