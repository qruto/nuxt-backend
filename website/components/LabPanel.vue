<script setup lang="ts">
import { useSlots } from 'vue'

/**
 * The workhorse surface. `variant="raised"` (default) is a `plaque`, a
 * convex card extruded from the material; `variant="well"` is a `slot`
 * milled into it (for readouts, lists, secondary content). `tone` colors
 * the header's LED and label only — depth, not color, carries the
 * structure. Tones are the three signals: ok (green), warn (amber), err
 * (red).
 */
const props = withDefaults(defineProps<{
  label?: string
  title?: string
  tone?: 'ok' | 'warn' | 'err' | 'neutral'
  variant?: 'raised' | 'well'
  flush?: boolean
}>(), { tone: 'neutral', variant: 'raised', flush: false })

const slots = useSlots()

// Spelled out, so Tailwind's scan finds every class it must emit.
const VARIANT = { raised: 'plaque', well: 'slot [--slot-r:var(--r-lg)]' } as const
const INK = { ok: 'text-(--ok)!', warn: 'text-(--warn)!', err: 'text-(--err)!', neutral: '' } as const
</script>

<template>
  <section
    class="relative"
    :class="VARIANT[props.variant]"
  >
    <header
      v-if="props.label || props.title || slots.actions || slots.header"
      class="mx-1 flex flex-wrap items-center justify-between gap-x-2.5 gap-y-2 border-b border-(--edge) px-[0.95rem] py-2.5"
    >
      <slot name="header">
        <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Led
            v-if="props.label"
            :tone="props.tone === 'neutral' ? 'off' : props.tone"
          />
          <code
            v-if="props.label"
            class="stamp min-w-0 leading-[1.35]!"
            :class="INK[props.tone]"
          >{{ props.label }}</code>
          <span
            v-if="props.title"
            class="min-w-0 text-[0.85rem] font-semibold text-(--ink)"
          >{{ props.title }}</span>
        </div>
      </slot>
      <div
        v-if="slots.actions"
        class="flex shrink-0 items-center gap-1.5"
      >
        <slot name="actions" />
      </div>
    </header>
    <div :class="props.flush ? 'p-0' : 'p-4'">
      <slot />
    </div>
  </section>
</template>
