<script setup lang="ts">
/**
 * Raised at rest, pressed-in on :active — the button literally depresses
 * into the material when you click it. `primary` is the green enamel fill
 * (go — the one primary action); `secondary` is a neutral raised control;
 * `danger` (red, destructive) and `warn` (amber, experimental) recolor the
 * label only. One signal per control, never engraved.
 */
withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'danger' | 'warn'
  size?: 'sm' | 'md'
  loading?: boolean
  disabled?: boolean
  /** Default to "button" so a LabButton never submits a form by accident. */
  type?: 'button' | 'submit' | 'reset'
}>(), { variant: 'primary', size: 'md', loading: false, disabled: false, type: 'button' })
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
  background: var(--grad-surface);
  color: var(--ink);
  box-shadow: var(--raise-sm);
  transition: color var(--transition), background var(--transition),
    box-shadow var(--transition), opacity var(--transition),
    transform var(--press) var(--ease-out);
  white-space: nowrap;
}
/* Hover rises one notch toward the user (design §5.2). */
.lb:not(:disabled):not(.loading):hover { box-shadow: var(--elev-2); }
.lb.md { padding: 0.52rem 1rem; font-size: 0.85rem; }
.lb.sm { padding: 0.34rem 0.7rem; font-size: 0.76rem; }
.lb:disabled { opacity: 0.5; cursor: not-allowed; }
/* Tactile press: the control sinks into the material. */
.lb:active:not(:disabled):not(.loading) { box-shadow: var(--inset-sm); transform: translateY(0.5px); }

/* Primary — green enamel under `--on-ok` lettering with a resting glow. */
.lb.primary {
  background: var(--ok);
  color: var(--on-ok);
  box-shadow: var(--elev-1), var(--glow-ok-soft);
}
.lb.primary:not(:disabled):not(.loading):hover {
  background: var(--ok-press);
  color: var(--on-ok);
  box-shadow: var(--elev-2), var(--glow-ok-soft);
}
.lb.primary:active:not(:disabled):not(.loading) { box-shadow: var(--inset-sm); }
.lb.primary:disabled { box-shadow: var(--raise-sm); }

/* Secondary — titanium; hover only sharpens the ink. */
.lb.secondary:not(:disabled):not(.loading):hover { color: var(--ink); }

/* Warn — amber label (experimental / attention). */
.lb.warn { color: var(--warn); }
.lb.warn:not(:disabled):not(.loading):hover { color: var(--warn); background: var(--surface-hi); }

/* Danger — red label (destructive). */
.lb.danger { color: var(--err); }
.lb.danger:not(:disabled):not(.loading):hover { color: var(--err); background: var(--surface-hi); }

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
