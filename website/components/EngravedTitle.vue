<script setup lang="ts">
/**
 * Display type engraved into the metal, the `cut` part. The text is a prop
 * so it can also ride in `data-text`, from which the part draws the lighter
 * floor of each letter. `size="sm"` is the `cut-sm` part: the same ink,
 * a lighter cut and no floor. Use it at 24px and up: the engraved ink only
 * clears the large-text bar.
 */
const props = withDefaults(defineProps<{
  text: string
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'div'
  size?: 'display' | 'sm'
}>(), { as: 'h2', size: 'display' })
</script>

<template>
  <component
    :is="props.as"
    :class="props.size === 'sm' ? 'cut-sm' : 'cut'"
    :data-text="props.size === 'sm' ? undefined : props.text"
  >
    {{ props.text }}
  </component>
</template>
