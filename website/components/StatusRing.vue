<script setup lang="ts">
/**
 * The signature status element — a colored ring with an inner dot, label in
 * mono. Status is communicated by ring color, never a flat fill (echoing the
 * Draft/Review/Approval/Done ring icons in the reference set). Use for email
 * delivery states, connection state, workflow steps, etc.
 */
withDefaults(defineProps<{
  tone?: 'accent' | 'ok' | 'warn' | 'err' | 'info' | 'xp' | 'muted'
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
  --ring-glow: var(--cdim, transparent);
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

.sr.accent { --c: var(--accent); --cdim: var(--accent-dim); color: var(--accent-soft); }
.sr.ok   { --c: var(--ok);   --cdim: var(--ok-dim); }
.sr.warn { --c: var(--warn); --cdim: var(--warn-dim); }
.sr.err  { --c: var(--err);  --cdim: var(--err-dim); }
.sr.info { --c: var(--info); --cdim: var(--info-dim); }
.sr.xp   { --c: var(--xp);   --cdim: var(--xp-dim); color: var(--xp); }
.sr.muted { --c: var(--ink-faint); --cdim: transparent; }
</style>
