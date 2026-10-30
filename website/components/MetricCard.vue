<script setup lang="ts">
/**
 * A metric tile on a `plaque`: a `stamp` label, a big number, an optional
 * unit and hint. A neutral number is lifted off the metal (`emb-sm`); a
 * toned one is one crisp signal (green / amber / red), never relief.
 */
const props = withDefaults(defineProps<{
  label: string
  value?: string | number | null
  unit?: string
  hint?: string
  tone?: 'ok' | 'warn' | 'err' | 'neutral'
  loading?: boolean
}>(), { tone: 'neutral', loading: false })

const NUMBER = { ok: 'text-(--ok)', warn: 'text-(--warn)', err: 'text-(--err)', neutral: 'emb-sm' } as const
</script>

<template>
  <div class="plaque min-w-0 px-[1.05rem] py-[0.95rem]">
    <div class="stamp">
      {{ props.label }}
    </div>
    <div class="mt-2 flex items-baseline gap-1.5">
      <span
        v-if="props.loading"
        class="slot slot-xs inline-block h-6 w-[3ch] animate-pulse"
      />
      <template v-else>
        <span
          class="text-[1.85rem] leading-none font-semibold"
          :class="NUMBER[props.tone]"
        >{{ props.value ?? '—' }}</span>
        <span
          v-if="props.unit"
          class="text-[0.78rem] font-semibold text-(--ink-dim)"
        >{{ props.unit }}</span>
      </template>
    </div>
    <div
      v-if="props.hint || $slots.hint"
      class="mt-1.5 text-[0.74rem] text-(--ink-faint)"
    >
      <slot name="hint">
        {{ props.hint }}
      </slot>
    </div>
  </div>
</template>
