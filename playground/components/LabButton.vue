<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'signal' | 'ghost' | 'danger' | 'xp'
  size?: 'sm' | 'md'
  loading?: boolean
  disabled?: boolean
  /** Default to "button" so a LabButton never submits a form by accident. */
  type?: 'button' | 'submit' | 'reset'
}>(), { variant: 'signal', size: 'md', loading: false, disabled: false, type: 'button' })
</script>

<template>
  <button
    class="lb"
    :type="type"
    :class="[variant, size, { loading }]"
    :disabled="disabled || loading"
  >
    <span
      v-if="loading"
      class="lb-spin"
    />
    <slot />
  </button>
</template>

<style scoped>
.lb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  border-radius: var(--radius);
  border: 1px solid transparent;
  transition: background var(--transition), border-color var(--transition),
    color var(--transition), box-shadow var(--transition), opacity var(--transition),
    transform var(--press) var(--ease-out);
  white-space: nowrap;
}
.lb.md { padding: 0.5rem 0.95rem; font-size: 0.85rem; }
.lb.sm { padding: 0.32rem 0.62rem; font-size: 0.76rem; }
.lb:disabled { opacity: 0.45; cursor: not-allowed; }
/* Tactile press feedback (scale children too). Skill: always 0.96, never <0.95. */
.lb:active:not(:disabled):not(.loading) { transform: scale(0.96); }

.lb.signal {
  background: var(--signal);
  color: var(--on-signal);
  border-color: var(--signal);
}
.lb.signal:not(:disabled):hover {
  background: var(--signal-hover);
  box-shadow: 0 0 0 3px var(--signal-dim);
}

.lb.xp {
  background: var(--xp);
  color: var(--on-xp);
  border-color: var(--xp);
}
.lb.xp:not(:disabled):hover { box-shadow: 0 0 0 3px var(--xp-dim); }

.lb.ghost {
  background: transparent;
  color: var(--ink);
  border-color: var(--edge-hi);
}
.lb.ghost:not(:disabled):hover {
  background: var(--panel-hi);
  border-color: var(--signal);
  color: var(--signal);
}

.lb.danger {
  background: transparent;
  color: var(--err);
  border-color: color-mix(in srgb, var(--err) 40%, transparent);
}
.lb.danger:not(:disabled):hover {
  background: var(--err-dim);
  border-color: var(--err);
}

.lb-spin {
  width: 12px;
  height: 12px;
  border: 1.5px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  opacity: 0.85;
}
</style>
