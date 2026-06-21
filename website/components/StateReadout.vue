<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  value: unknown
  label?: string
  tone?: 'signal' | 'accent' | 'ok' | 'warn' | 'err' | 'xp' | 'neutral'
}>(), { tone: 'neutral' })

/**
 * JSON view that survives the awkward cases a live Convex state object hits:
 * `Error` instances (which `JSON.stringify` flattens to `{}`), and `undefined`
 * (which it drops entirely). Both matter for showing query result objects.
 */
const UNDEF = '__UNDEFINED__'
function functionLabel(fn: { name?: string }): string {
  return `[Function ${fn.name || 'anonymous'}]`
}
const formatted = computed(() => {
  const v = props.value
  if (v === undefined) return 'undefined'
  try {
    const json = JSON.stringify(
      v,
      (_key, val) => {
        if (val instanceof Error) return { name: val.name, message: val.message }
        if (typeof val === 'function') return functionLabel(val)
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
/* A concave well carved into the material — the canonical "readout". */
.readout {
  border-radius: var(--r);
  background: var(--sink);
  box-shadow: var(--inset);
  overflow: hidden;
  --rc: var(--ink-dim);
}
.readout.signal, .readout.accent { --rc: var(--accent-soft); }
.readout.ok  { --rc: var(--ok); }
.readout.err { --rc: var(--err); }
.readout.xp  { --rc: var(--xp); }

.readout-head {
  padding: 0.4rem 0.85rem 0.25rem;
}
.readout-label {
  font-family: var(--mono);
  font-size: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-faint);
}
.readout-body {
  margin: 0;
  padding: 0.5rem 0.95rem 0.85rem;
  overflow-x: auto;
  font-family: var(--mono);
  font-size: 0.78rem;
  line-height: 1.55;
  color: var(--rc);
  white-space: pre;
}
.readout-body code { font-family: inherit; }
</style>
