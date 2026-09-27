<script setup lang="ts">
const model = defineModel<boolean>({ required: true })
/**
 * ON fills the track with a signal: green by default (go), amber for an
 * experimental switch (design §5.7). The knob stays a neutral bead.
 */
withDefaults(defineProps<{
  label?: string
  hint?: string
  tone?: 'ok' | 'warn'
}>(), { tone: 'ok' })
</script>

<template>
  <label
    class="tg"
    :class="tone"
  >
    <span class="tg-sw">
      <input
        v-model="model"
        type="checkbox"
      >
      <span class="tg-track">
        <span class="tg-knob" />
      </span>
    </span>
    <span
      v-if="label || hint"
      class="tg-text"
    >
      <span class="tg-label">{{ label }}</span>
      <span
        v-if="hint"
        class="tg-hint"
      >{{ hint }}</span>
    </span>
  </label>
</template>

<style scoped>
.tg {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  cursor: pointer;
  user-select: none;
}
.tg-sw { position: relative; flex-shrink: 0; line-height: 0; }
.tg-sw input { position: absolute; opacity: 0; width: 0; height: 0; }
/* Track = a gently recessed channel; fills with the signal when on. */
.tg-track {
  display: block;
  width: 42px;
  height: 24px;
  background: var(--sink);
  border-radius: 99px;
  box-shadow: var(--inset-sm);
  transition: background var(--transition), box-shadow var(--transition);
}
/* Knob = a crisp white bead riding in the channel. */
.tg-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--surface-hi);
  box-shadow: var(--elev-1);
  transition: transform var(--transition);
}
.tg-sw input:checked ~ .tg-track {
  background: var(--tg-c);
  box-shadow: var(--inset-1), var(--tg-glow);
}
.tg-sw input:checked ~ .tg-track .tg-knob {
  transform: translateX(18px);
}
.tg.ok   { --tg-c: var(--ok);   --tg-glow: var(--glow-ok-soft); }
.tg.warn { --tg-c: var(--warn); --tg-glow: var(--glow-warn-soft); }

.tg-text { display: flex; flex-direction: column; line-height: 1.25; }
.tg-label { font-size: 0.85rem; font-weight: 600; color: var(--ink); }
.tg-hint { font-size: 0.72rem; color: var(--ink-dim); }
</style>
