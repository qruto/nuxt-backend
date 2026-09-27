<script setup lang="ts">
defineProps<{ title?: string }>()
</script>

<template>
  <NCard class="p4 flex flex-col gap-2">
    <div
      v-if="title || $slots.actions"
      class="flex items-center gap-2"
    >
      <span class="op50 text-xs">{{ title }}</span>
      <span class="ml-auto flex gap-1">
        <slot name="actions" />
      </span>
    </div>
    <slot />
  </NCard>
</template>
