<script setup lang="ts">
/**
 * A chip milled into the material, `slot slot-pill` around a `stamp`
 * label; the tone lives in the LED and the label, lettered in the signal.
 */
const props = withDefaults(defineProps<{
  tone?: 'ok' | 'warn' | 'err' | 'muted'
  dot?: boolean
}>(), { tone: 'muted', dot: true })

const INK = { ok: 'text-(--ok)!', warn: 'text-(--warn)!', err: 'text-(--err)!', muted: '' } as const
</script>

<template>
  <span
    class="stamp slot slot-pill inline-flex items-center gap-1.5 px-2.5 py-1"
    :class="INK[props.tone]"
  >
    <Led
      v-if="props.dot"
      :tone="props.tone === 'muted' ? 'off' : props.tone"
    />
    <slot />
  </span>
</template>
