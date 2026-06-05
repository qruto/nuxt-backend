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
      <span class="tg-track" />
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
.tg-track {
  display: block;
  width: 38px;
  height: 21px;
  background: var(--edge);
  border: 1px solid var(--edge-hi);
  border-radius: 99px;
  transition: background var(--transition), border-color var(--transition);
}
.tg-track::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: var(--ink-dim);
  transition: transform var(--transition), background var(--transition);
}
.tg-sw input:checked ~ .tg-track {
  background: var(--tg-c, var(--signal-dim));
  border-color: var(--tg-c-edge, var(--signal));
}
.tg-sw input:checked ~ .tg-track::after {
  transform: translateX(17px);
  background: var(--tg-c-edge, var(--signal));
}
.tg.signal { --tg-c: var(--signal-dim); --tg-c-edge: var(--signal); }
.tg.xp     { --tg-c: var(--xp-dim);     --tg-c-edge: var(--xp); }
.tg.ok     { --tg-c: var(--ok-dim);     --tg-c-edge: var(--ok); }

.tg-text { display: flex; flex-direction: column; line-height: 1.25; }
.tg-label { font-size: 0.85rem; font-weight: 600; color: var(--ink); }
.tg-hint { font-size: 0.72rem; color: var(--ink-dim); }
</style>
