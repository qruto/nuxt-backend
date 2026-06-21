<script setup lang="ts">
withDefaults(defineProps<{
  tone?: 'signal' | 'accent' | 'ok' | 'warn' | 'err' | 'info' | 'xp' | 'muted'
  pulse?: boolean
}>(), { tone: 'ok', pulse: true })
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
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--c, var(--accent));
  box-shadow: 0 0 0 3px var(--cdim, transparent);
  --ring-glow: var(--cglow, var(--accent-glow));
}
.dot.signal, .dot.accent { --c: var(--accent); --cdim: var(--accent-dim); --cglow: var(--accent-glow); }
.dot.ok     { --c: var(--ok);   --cdim: var(--ok-dim);   --cglow: var(--ok-dim); }
.dot.warn   { --c: var(--warn); --cdim: var(--warn-dim); --cglow: var(--warn-dim); }
.dot.err    { --c: var(--err);  --cdim: var(--err-dim);  --cglow: var(--err-dim); }
.dot.info   { --c: var(--info); --cdim: var(--info-dim); --cglow: var(--info-dim); }
.dot.xp     { --c: var(--xp);   --cdim: var(--xp-dim);   --cglow: var(--xp-glow); }
.dot.muted  { --c: var(--ink-faint); --cdim: transparent; box-shadow: none; }
.dot.pulse  { animation: pulse-ring 2.1s infinite; }
</style>
