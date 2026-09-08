<script setup lang="ts">
/**
 * A recessed chip carved into the material; the tone lives in the LED + the
 * label (the `-soft` shade — the readable signal on a well).
 */
withDefaults(defineProps<{
  tone?: 'ok' | 'warn' | 'err' | 'muted'
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
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 0.22rem 0.6rem;
  border-radius: 99px;
  color: var(--p-c, var(--ink-dim));
  background: var(--sink);
  box-shadow: var(--inset-sm);
}
.pill.ok    { --p-c: var(--ok-soft); }
.pill.warn  { --p-c: var(--warn-soft); }
.pill.err   { --p-c: var(--err-soft); }
.pill.muted { --p-c: var(--ink-dim); }
</style>
