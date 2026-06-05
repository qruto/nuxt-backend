<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  value: unknown
  label?: string
  tone?: 'signal' | 'ok' | 'warn' | 'err' | 'xp' | 'neutral'
}>(), { tone: 'neutral' })

/**
 * JSON view that survives the awkward cases a live Convex state object hits:
 * `Error` instances (which `JSON.stringify` flattens to `{}`), and `undefined`
 * (which it drops entirely). Both matter for showing query result objects.
 */
const UNDEF = '__UNDEFINED__'
const formatted = computed(() => {
  const v = props.value
  if (v === undefined) return 'undefined'
  try {
    const json = JSON.stringify(
      v,
      (_key, val) => {
        if (val instanceof Error) return { name: val.name, message: val.message }
        if (typeof val === 'function') return `[Function ${val.name || 'anonymous'}]`
        if (val === undefined) return UNDEF
        return val
      },
      2,
    )
    return json.split(`"${UNDEF}"`).join('undefined')
  }
  catch {
    return String(v)
  }
})
</script>

<template>
  <div
    class="readout"
    :class="tone"
  >
    <div
      v-if="label"
      class="readout-head"
    >
      <span class="readout-label">{{ label }}</span>
    </div>
    <pre class="readout-body"><code>{{ formatted }}</code></pre>
  </div>
</template>

<style scoped>
.readout {
  border: 1px solid var(--edge);
  border-radius: var(--radius);
  background: #07090e;
  overflow: hidden;
}
.readout.signal { border-color: color-mix(in srgb, var(--signal) 30%, var(--edge)); }
.readout.ok     { border-color: color-mix(in srgb, var(--ok) 28%, var(--edge)); }
.readout.err    { border-color: color-mix(in srgb, var(--err) 32%, var(--edge)); }
.readout.xp     { border-color: color-mix(in srgb, var(--xp) 30%, var(--edge)); }

.readout-head {
  padding: 0.35rem 0.7rem;
  border-bottom: 1px solid var(--edge);
  background: rgba(255, 255, 255, 0.015);
}
.readout-label {
  font-family: var(--mono);
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--ink-dim);
}
.readout-body {
  margin: 0;
  padding: 0.75rem 0.85rem;
  overflow-x: auto;
  font-family: var(--mono);
  font-size: 0.78rem;
  line-height: 1.55;
  color: var(--signal-soft);
  white-space: pre;
}
.readout-body code { font-family: inherit; }
</style>
