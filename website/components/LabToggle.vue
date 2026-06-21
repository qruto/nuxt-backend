<script setup lang="ts">
const model = defineModel<boolean>({ required: true })
withDefaults(defineProps<{
  label?: string
  hint?: string
  tone?: 'signal' | 'xp' | 'ok'
}>(), { tone: 'signal' })
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
/* Track = a gently recessed channel; fills with the tone when on. */
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
  box-shadow: 0 1px 2px rgb(20 27 45 / 0.25), 0 0 0 0.5px rgb(20 27 45 / 0.06);
  transition: transform var(--transition);
}
.tg-sw input:checked ~ .tg-track {
  background: var(--tg-c, var(--accent));
  box-shadow: inset 0 1px 2px rgb(20 27 45 / 0.18);
}
.tg-sw input:checked ~ .tg-track .tg-knob {
  transform: translateX(18px);
}
.tg.signal { --tg-c: var(--accent); --tg-dim: var(--accent-dim); }
.tg.xp     { --tg-c: var(--xp);     --tg-dim: var(--xp-dim); }
.tg.ok     { --tg-c: var(--ok);     --tg-dim: var(--ok-dim); }

.tg-text { display: flex; flex-direction: column; line-height: 1.25; }
.tg-label { font-size: 0.85rem; font-weight: 600; color: var(--ink); }
.tg-hint { font-size: 0.72rem; color: var(--ink-dim); }
</style>
