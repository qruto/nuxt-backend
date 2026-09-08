<script setup lang="ts">
/**
 * A raised metric tile: mono label, big display number, optional unit + hint.
 * The convex card lifts the live value off the material.
 */
withDefaults(defineProps<{
  label: string
  value?: string | number | null
  unit?: string
  hint?: string
  tone?: 'accent' | 'ok' | 'warn' | 'err' | 'info' | 'neutral'
  loading?: boolean
}>(), { tone: 'neutral', loading: false })
</script>

<template>
  <div
    class="mc"
    :class="tone"
  >
    <div class="mc-label">
      {{ label }}
    </div>
    <div class="mc-value">
      <span
        v-if="loading"
        class="mc-skeleton"
      />
      <template v-else>
        <span class="mc-num embossed-sm">{{ value ?? '—' }}</span>
        <span
          v-if="unit"
          class="mc-unit"
        >{{ unit }}</span>
      </template>
    </div>
    <div
      v-if="hint || $slots.hint"
      class="mc-hint"
    >
      <slot name="hint">
        {{ hint }}
      </slot>
    </div>
  </div>
</template>

<style scoped>
.mc {
  background: var(--grad-plaque);
  border-radius: var(--r-lg);
  box-shadow: var(--plaque);
  padding: 0.95rem 1.05rem;
  min-width: 0;
}
.mc-label {
  font-family: var(--mono);
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-dim);
}
.mc-value {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
  margin-top: 0.5rem;
}
.mc-num {
  font-family: var(--display);
  font-size: 1.85rem;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0;
  color: var(--ink);
  /* Stamped counter via `.embossed-sm` (neutral numerals only; toned values
     below keep plain color — scoped specificity wins over the utility). */
}
.mc.accent .mc-num, .mc.ok .mc-num, .mc.warn .mc-num,
.mc.err .mc-num, .mc.info .mc-num { text-shadow: none; }
.mc-unit { font-size: 0.78rem; font-weight: 600; color: var(--ink-dim); }
.mc-hint { margin-top: 0.4rem; font-size: 0.74rem; color: var(--ink-faint); }

.mc.accent .mc-num { color: var(--accent-soft); }
.mc.ok   .mc-num { color: var(--ok); }
.mc.warn .mc-num { color: var(--warn); }
.mc.err  .mc-num { color: var(--err); }
.mc.info .mc-num { color: var(--info); }

.mc-skeleton {
  display: inline-block;
  width: 3ch; height: 1.5rem;
  border-radius: 6px;
  background: var(--sink);
  box-shadow: var(--inset-sm);
  animation: blink 1.4s ease-in-out infinite;
}
</style>
