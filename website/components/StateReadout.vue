<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  value: unknown
  label?: string
  /** Signal for the JSON ink: ok (green), warn (amber), err (red). */
  tone?: 'ok' | 'warn' | 'err' | 'neutral'
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

// A `slot` milled into the material is the canonical readout. The JSON is
// lettered in the tone's signal, readable on the well.
const INK = { ok: 'text-(--ok)', warn: 'text-(--warn)', err: 'text-(--err)', neutral: 'text-(--ink-dim)' } as const
</script>

<template>
  <div class="slot overflow-hidden">
    <div
      v-if="label"
      class="px-[0.85rem] pt-1.5 pb-1"
    >
      <span class="stamp leading-[1.35]! [overflow-wrap:anywhere]">{{ label }}</span>
    </div>
    <pre
      class="m-0 overflow-x-auto px-[0.95rem] pt-2 pb-[0.85rem] font-mono text-[0.78rem] leading-[1.55] whitespace-pre"
      :class="INK[tone]"
    ><code>{{ formatted }}</code></pre>
  </div>
</template>
