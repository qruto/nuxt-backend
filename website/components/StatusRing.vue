<script setup lang="ts">
/**
 * The signature status element — a colored ring with an inner dot, label in
 * mono. Status is communicated by ring color, never a flat fill (echoing the
 * Draft/Review/Approval/Done ring icons in the reference set). The ring is
 * one of the three signals — ok (green), warn (amber), err (red) — or muted
 * titanium; the label stays neutral ink. Use for email delivery states,
 * connection state, workflow steps, etc.
 */
withDefaults(defineProps<{
  tone?: 'ok' | 'warn' | 'err' | 'muted'
  pulse?: boolean
  size?: 'sm' | 'md'
}>(), { tone: 'muted', pulse: false, size: 'md' })
</script>

<template>
  <span
    class="sr"
    :class="[tone, size]"
  >
    <span
      class="sr-ring"
      :class="{ pulse }"
    />
    <span class="sr-label"><slot /></span>
  </span>
</template>

<style scoped>
.sr {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--mono);
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--ink-dim);
}
.sr.sm { font-size: 0.68rem; gap: 0.4rem; }
.sr-ring {
  position: relative;
  width: 15px; height: 15px;
  border-radius: 50%;
  border: 2px solid var(--c, var(--ink-faint));
  flex-shrink: 0;
  /* The pulse halo is the signal's translucent glow colour. */
  --ring-glow: var(--cglow, transparent);
}
.sr.sm .sr-ring { width: 13px; height: 13px; }
.sr-ring::after {
  content: '';
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  background: var(--c, var(--ink-faint));
}
.sr.sm .sr-ring::after { inset: 2.5px; }
.sr-ring.pulse { animation: pulse-ring 2s infinite; }

.sr.ok    { --c: var(--ok);   --cglow: var(--ok-glow); }
.sr.warn  { --c: var(--warn); --cglow: var(--warn-glow); }
.sr.err   { --c: var(--err);  --cglow: var(--err-glow); }
.sr.muted { --c: var(--ink-faint); --cglow: transparent; }
</style>
