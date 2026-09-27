<script setup lang="ts">
/**
 * An LED: an 8px enamel dot with the signal's glow (`--glow-ok` / `-warn` /
 * `-err`, design §3.3). `pulse` spreads the glow colour as a halo. `muted`
 * is an unlit titanium dot.
 */
withDefaults(defineProps<{
  tone?: 'ok' | 'warn' | 'err' | 'muted'
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
  background: var(--c, var(--ok));
  box-shadow: var(--led, var(--glow-ok));
  --ring-glow: var(--cglow, var(--ok-glow));
}
.dot.ok    { --c: var(--ok);   --led: var(--glow-ok);   --cglow: var(--ok-glow); }
.dot.warn  { --c: var(--warn); --led: var(--glow-warn); --cglow: var(--warn-glow); }
.dot.err   { --c: var(--err);  --led: var(--glow-err);  --cglow: var(--err-glow); }
.dot.muted { --c: var(--ink-faint); --led: none; --cglow: transparent; }
.dot.pulse { animation: pulse-ring 2.1s infinite; }
</style>
