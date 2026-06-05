<script setup lang="ts">
withDefaults(defineProps<{
  tone?: 'signal' | 'ok' | 'warn' | 'err' | 'xp' | 'muted'
  dot?: boolean
}>(), { tone: 'muted', dot: true })
</script>

<template>
  <span
    class="pill"
    :class="tone"
  >
    <SignalDot
      v-if="dot"
      :tone="tone"
      :pulse="false"
    />
    <slot />
  </span>
</template>

<style scoped>
.pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-family: var(--mono);
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 0.2rem 0.55rem;
  border-radius: 99px;
  border: 1px solid var(--p-edge, var(--edge));
  color: var(--p-c, var(--ink-dim));
  background: var(--p-bg, transparent);
}
.pill.signal { --p-c: var(--signal); --p-bg: var(--signal-dim); --p-edge: color-mix(in srgb, var(--signal) 30%, transparent); }
.pill.ok     { --p-c: var(--ok);     --p-bg: var(--ok-dim);     --p-edge: color-mix(in srgb, var(--ok) 30%, transparent); }
.pill.warn   { --p-c: var(--warn);   --p-bg: var(--warn-dim);   --p-edge: color-mix(in srgb, var(--warn) 30%, transparent); }
.pill.err    { --p-c: var(--err);    --p-bg: var(--err-dim);    --p-edge: color-mix(in srgb, var(--err) 32%, transparent); }
.pill.xp     { --p-c: var(--xp);     --p-bg: var(--xp-dim);     --p-edge: color-mix(in srgb, var(--xp) 32%, transparent); }
.pill.muted  { --p-c: var(--ink-dim); --p-bg: rgba(255,255,255,0.02); --p-edge: var(--edge); }
</style>
