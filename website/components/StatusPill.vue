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
/* A recessed chip carved into the material; tone lives in the dot + label. */
.pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-family: var(--mono);
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 0.22rem 0.6rem;
  border-radius: 99px;
  color: var(--p-c, var(--ink-dim));
  background: var(--sink);
  box-shadow: var(--inset-sm);
}
.pill.signal { --p-c: var(--accent-soft); }
.pill.ok     { --p-c: var(--ok); }
.pill.warn   { --p-c: var(--warn); }
.pill.err    { --p-c: var(--err); }
.pill.xp     { --p-c: var(--xp); }
.pill.muted  { --p-c: var(--ink-dim); }
</style>
