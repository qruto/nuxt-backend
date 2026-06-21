<script setup lang="ts">
/**
 * Raised at rest, pressed-in on :active — the button literally depresses
 * into the material when you click it. `signal` is the accent primary;
 * `ghost` is a neutral raised control; `danger`/`xp` recolor the label.
 */
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
  gap: 0.45rem;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  border-radius: var(--r-sm);
  border: 0;
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--raise-sm);
  transition: color var(--transition), background var(--transition),
    box-shadow var(--transition), opacity var(--transition),
    transform var(--press) var(--ease-out);
  white-space: nowrap;
}
.lb.md { padding: 0.52rem 1rem; font-size: 0.85rem; }
.lb.sm { padding: 0.34rem 0.7rem; font-size: 0.76rem; }
.lb:disabled { opacity: 0.5; cursor: not-allowed; }
/* Tactile press: the control sinks into the material. */
.lb:active:not(:disabled):not(.loading) { box-shadow: var(--inset-sm); transform: translateY(0.5px); }

.lb.signal {
  background: var(--accent);
  color: var(--on-accent);
  box-shadow: var(--raise-accent);
}
.lb.signal:not(:disabled):hover { background: var(--accent-press); }

.lb.xp { color: var(--xp); }
.lb.xp:not(:disabled):hover { color: var(--xp); background: var(--surface-hi); }

.lb.ghost:not(:disabled):hover { color: var(--accent); }

.lb.danger { color: var(--err); }
.lb.danger:not(:disabled):hover { color: var(--err); background: var(--surface-hi); }

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
