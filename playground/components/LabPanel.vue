<script setup lang="ts">
import { useSlots } from 'vue'

withDefaults(defineProps<{
  label?: string
  title?: string
  tone?: 'signal' | 'ok' | 'warn' | 'err' | 'xp' | 'neutral'
  flush?: boolean
}>(), { tone: 'neutral', flush: false })

const slots = useSlots()
</script>

<template>
  <section
    class="panel"
    :class="tone"
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
  background: var(--panel);
  border: 1px solid var(--edge);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

/* subtle corner marks for instrument feel, hidden in light */
.panel::before,
.panel::after {
  content: '';
  position: absolute;
  width: 8px;
  height: 8px;
  pointer-events: none;
  opacity: 0.35;
}
.panel::before {
  top: 6px; left: 6px;
  border-top: 1px solid var(--edge-hi);
  border-left: 1px solid var(--edge-hi);
}
.panel::after {
  bottom: 6px; right: 6px;
  border-bottom: 1px solid var(--edge-hi);
  border-right: 1px solid var(--edge-hi);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  padding: 0.52rem 0.78rem;
  border-bottom: 1px solid var(--edge);
  background: color-mix(in srgb, var(--panel-2) 55%, transparent);
}
.panel-headl {
  display: flex; align-items: center; gap: 0.45rem; min-width: 0;
}
.panel-tick {
  width: 5px; height: 5px; border-radius: 1px;
  background: var(--tone-c, var(--edge-hi));
  box-shadow: 0 0 5px var(--tone-c, transparent);
  flex-shrink: 0;
}
.panel-label {
  font-family: var(--mono);
  font-size: 0.63rem;
  font-weight: 600;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: var(--tone-c, var(--ink-dim));
}
.panel-title {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.panel-actions {
  display: flex; align-items: center; gap: 0.35rem; flex-shrink: 0;
}
.panel-body { padding: 0.9rem; }
.panel-body.flush { padding: 0; }

/* tone accents */
.panel.signal { --tone-c: var(--signal); }
.panel.ok     { --tone-c: var(--ok); }
.panel.warn   { --tone-c: var(--warn); }
.panel.err    { --tone-c: var(--err); }
.panel.xp     { --tone-c: var(--xp); }
.panel.signal { border-color: color-mix(in srgb, var(--signal) 22%, var(--edge)); }
.panel.xp     { border-color: color-mix(in srgb, var(--xp) 22%, var(--edge)); }
.panel.err    { border-color: color-mix(in srgb, var(--err) 26%, var(--edge)); }
.panel.ok     { border-color: color-mix(in srgb, var(--ok) 22%, var(--edge)); }
</style>
