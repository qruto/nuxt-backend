<script setup lang="ts">
/**
 * A rotary selector, the `dial` part: a ridged knob whose lit pointer turns
 * to the selected detent, with the detents engraved around it as a radio
 * group. The arrow keys move between detents; clicking the knob turns it
 * to the next one. In a column narrower than the dial (a 320px screen, or
 * 400% zoom) the whole dial scales down, labels and knob together, so it
 * never pans the page sideways and no two labels meet.
 */
const props = defineProps<{
  options: ReadonlyArray<{ value: string, label: string }>
  /** The group's accessible name. */
  label: string
  /** The id of what the dial selects for, such as the display it drives. */
  controls?: string
}>()
const model = defineModel<string>({ required: true })

/** Degrees between the first and the last detent. */
const SPREAD = 150
const angle = (i: number) => props.options.length < 2 ? 0 : -SPREAD / 2 + (SPREAD * i) / (props.options.length - 1)
const index = computed(() => Math.max(0, props.options.findIndex(option => option.value === model.value)))

/** Where a detent's label sits: on a circle around the knob's centre (50%, 66%). */
function place(i: number) {
  const radians = (angle(i) * Math.PI) / 180
  return { left: `${50 + 40 * Math.sin(radians)}%`, top: `${66 - 52 * Math.cos(radians)}%` }
}

const detents = useTemplateRef<HTMLButtonElement[]>('detent')
function select(i: number, focus = false) {
  const count = props.options.length
  const next = (i + count) % count
  model.value = props.options[next]!.value
  if (focus) nextTick(() => detents.value?.[next]?.focus())
}
function onKeydown(event: KeyboardEvent) {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
  if (!step) return
  event.preventDefault()
  select(index.value + step, true)
}
</script>

<template>
  <!-- The container takes the column, up to the dial's width (all of it from
       lg, where the dial's column is sized by its content); in a narrower
       column the dial zooms to fit 240px, which `zoom` (unlike `scale`) also
       gives the layout, so the box it leaves behind shrinks with it. -->
  <div class="@container mx-auto w-full max-w-72 lg:w-72">
    <div
      class="relative mx-auto h-48 w-72 @max-[18rem]:[zoom:0.8333]"
      role="radiogroup"
      :aria-label="props.label"
      :aria-controls="props.controls"
      @keydown="onKeydown"
    >
      <button
        v-for="(option, i) in props.options"
        :key="option.value"
        ref="detent"
        type="button"
        role="radio"
        :aria-checked="option.value === model"
        :tabindex="option.value === model ? 0 : -1"
        class="stamp absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-sm px-1.5 py-1 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus)"
        :class="option.value === model ? 'text-(--ok)!' : 'engr-lt'"
        :style="place(i)"
        @click="select(i)"
      >
        {{ option.label }}
      </button>
      <div
        class="dial absolute top-[66%] left-1/2 size-24 -translate-x-1/2 -translate-y-1/2 cursor-pointer"
        :style="{ '--dial-angle': `${angle(index)}deg` }"
        aria-hidden="true"
        @click="select(index + 1)"
      />
    </div>
  </div>
</template>
