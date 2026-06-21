<script setup lang="ts">
import { useSlots } from 'vue'

/**
 * The workhorse surface. `variant="raised"` (default) is a convex card
 * extruded from the material; `variant="well"` is a concave recess carved
 * into it (for readouts, lists, secondary content). `tone` colors the
 * header tick + label only — depth, not color, carries the structure.
 */
withDefaults(defineProps<{
  label?: string
  title?: string
  tone?: 'accent' | 'ok' | 'warn' | 'err' | 'xp' | 'neutral'
  variant?: 'raised' | 'well'
  flush?: boolean
}>(), { tone: 'neutral', variant: 'raised', flush: false })

const slots = useSlots()
</script>

<template>
  <section
    class="panel"
    :class="[tone, variant]"
  >
    <header
      v-if="label || title || slots.actions || slots.header"
      class="panel-head"
    >
      <slot name="header">
        <div class="panel-headl">
          <span
            v-if="label"
            class="panel-tick"
          />
          <code
            v-if="label"
            class="panel-label"
          >{{ label }}</code>
          <span
            v-if="title"
            class="panel-title"
          >{{ title }}</span>
        </div>
      </slot>
      <div
        v-if="slots.actions"
        class="panel-actions"
      >
        <slot name="actions" />
      </div>
    </header>
    <div
      class="panel-body"
      :class="{ flush }"
    >
      <slot />
    </div>
  </section>
</template>

<style scoped>
.panel {
  position: relative;
  border-radius: var(--r-lg);
}
.panel.raised { background: var(--surface); box-shadow: var(--raise); }
.panel.well   { background: var(--sink);    box-shadow: var(--inset); }

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  padding: 0.62rem 0.95rem;
  margin: 0 0.25rem;
  border-bottom: 1px solid var(--edge);
}
.panel-headl {
  display: flex; align-items: center; gap: 0.5rem; min-width: 0;
}
.panel-tick {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--tone-c, var(--ink-faint));
  box-shadow: 0 0 0 3px var(--tone-dim, transparent);
  flex-shrink: 0;
}
.panel-label {
  font-family: var(--mono);
  font-size: 0.63rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--tone-c, var(--ink-dim));
}
.panel-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.panel-actions {
  display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0;
}
.panel-body { padding: 1rem; }
.panel-body.flush { padding: 0; }

.panel.accent { --tone-c: var(--accent); --tone-dim: var(--accent-dim); }
.panel.ok     { --tone-c: var(--ok);     --tone-dim: var(--ok-dim); }
.panel.warn   { --tone-c: var(--warn);   --tone-dim: var(--warn-dim); }
.panel.err    { --tone-c: var(--err);    --tone-dim: var(--err-dim); }
.panel.xp     { --tone-c: var(--xp);     --tone-dim: var(--xp-dim); }
</style>
