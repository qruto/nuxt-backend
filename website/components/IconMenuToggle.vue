<script setup lang="ts">
/**
 * The header's menu toggle, in place of Docus's (test/docs/docus-copies.test.ts
 * pins its source): the same three bars folding into a cross, drawn with CSS
 * transitions instead of motion-v, so no animation library loads with a
 * docs page. Reduced motion stills it (app.css).
 */
const props = defineProps<{
  open: boolean
}>()

const BAR = 'origin-center transition-[transform,opacity] duration-200 ease-out [transform-box:view-box] motion-reduce:transition-none'
</script>

<template>
  <UButton
    size="sm"
    variant="ghost"
    color="neutral"
    class="-me-1.5"
    square
    :aria-label="props.open ? 'Close menu' : 'Open menu'"
    :aria-expanded="props.open"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="size-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <line
        x1="4"
        y1="6"
        x2="20"
        y2="6"
        :class="[BAR, props.open && '[transform:rotate(45deg)_translateY(6px)]']"
      />
      <line
        x1="4"
        y1="12"
        x2="20"
        y2="12"
        :class="[BAR, props.open && 'opacity-0']"
      />
      <line
        x1="4"
        y1="18"
        x2="20"
        y2="18"
        :class="[BAR, props.open && '[transform:rotate(-45deg)_translateY(-6px)]']"
      />
    </svg>
  </UButton>
</template>
