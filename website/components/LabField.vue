<script setup lang="ts">
/**
 * A labeled form field. Wraps any control (use the global `.input` class on
 * the slotted input/textarea/select for the concave-well look). Surfaces a
 * mono label, optional hint, and an error message.
 */
withDefaults(defineProps<{
  label?: string
  hint?: string
  error?: string | null
}>(), { error: null })
</script>

<template>
  <label class="field">
    <span
      v-if="label"
      class="field-label"
    >{{ label }}</span>
    <slot />
    <span
      v-if="error"
      class="field-error"
    >{{ error }}</span>
    <span
      v-else-if="hint"
      class="field-hint"
    >{{ hint }}</span>
  </label>
</template>

<style scoped>
.field { display: flex; flex-direction: column; gap: 0.4rem; }
.field-label {
  font-family: var(--mono);
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-dim);
}
.field-hint { font-size: 0.72rem; color: var(--ink-faint); }
.field-error { font-size: 0.72rem; color: var(--err); font-weight: 500; }
</style>
