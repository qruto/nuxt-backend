<script setup lang="ts">
/**
 * The console, the `unit` part laid out as artboard 08 draws it: the
 * display, the dial and the keys side by side from 1024px, stacked below.
 * Each slot is optional; the display takes the width that is left.
 */
</script>

<template>
  <section class="unit grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
    <div class="min-w-0">
      <slot name="display" />
    </div>
    <div v-if="$slots.dial">
      <slot name="dial" />
    </div>
    <div
      v-if="$slots.keys"
      class="flex flex-wrap gap-3"
    >
      <slot name="keys" />
    </div>
  </section>
</template>
