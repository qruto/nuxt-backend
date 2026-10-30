<script setup lang="ts">
const model = defineModel<boolean>({ required: true })
/**
 * A switch: a `slot slot-pill` channel milled into the material with a
 * neutral bead riding in it. ON fills the channel with a signal, green by
 * default (go), amber for an experimental switch. The checkbox stays the
 * control (`role="switch"`), so the label, the keyboard, the checked state
 * and the focus ring are native; `disabled` reaches it too.
 */
const props = withDefaults(defineProps<{
  label?: string
  hint?: string
  tone?: 'ok' | 'warn'
  disabled?: boolean
}>(), { tone: 'ok', disabled: false })

// The channel is the slot with a shallow depth and a hairline in
// `--ink-faint`, which clears 3:1 on the plaque and the ground in both
// themes (WCAG 1.4.11): the slot's own shading alone does not. Checked, the
// signal fills it and the hairline gives way to the signal's glow. Spelled
// out, so Tailwind's scan finds every class it must emit.
const TRACK = {
  ok: 'peer-checked:bg-(--ok)! peer-checked:[--slot-depth:var(--inset-1),var(--glow-ok-soft)]',
  warn: 'peer-checked:bg-(--warn)! peer-checked:[--slot-depth:var(--inset-1),var(--glow-warn-soft)]',
} as const
</script>

<template>
  <label
    class="flex touch-manipulation items-center gap-2.5 select-none"
    :class="props.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'"
  >
    <span class="relative shrink-0 leading-none">
      <input
        v-model="model"
        type="checkbox"
        role="switch"
        :disabled="props.disabled"
        class="peer absolute size-0 opacity-0"
      >
      <span
        class="slot slot-pill block h-6 w-[42px] [--slot-depth:var(--inset-1),inset_0_0_0_1px_var(--ink-faint)] [transition:background_var(--transition),box-shadow_var(--transition)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-(--focus)"
        :class="TRACK[props.tone]"
      />
      <span class="absolute top-[3px] left-[3px] size-[18px] rounded-full bg-(--surface-hi) shadow-(--elev-1) [transition:translate_var(--transition)] peer-checked:translate-x-[18px]" />
    </span>
    <span
      v-if="props.label || props.hint"
      class="flex flex-col leading-tight"
    >
      <span class="text-[0.85rem] font-semibold text-(--ink)">{{ props.label }}</span>
      <span
        v-if="props.hint"
        class="text-[0.72rem] text-(--ink-dim)"
      >{{ props.hint }}</span>
    </span>
  </label>
</template>
