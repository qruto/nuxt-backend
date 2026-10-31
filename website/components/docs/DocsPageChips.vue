<script setup lang="ts">
/**
 * A docs page's chips, beside its trail: what kind of page it is (a landing
 * needs none) and, from `status`, the amber Experimental or the red
 * Deprecated light, linking to what the tier promises, or a release marker
 * linking to the Feature map's statuses (shared/planned.ts): the unlit
 * Planned light, or Changing's amber square.
 */
import { FEATURE_MAP_STATUSES } from '#shared/planned'

const props = defineProps<{
  kind?: string
  status?: string
}>()

const KIND: Record<string, string> = {
  'tutorial': 'Tutorial',
  'how-to': 'How-to',
  'concept': 'Concept',
  'recipe': 'Recipe',
  'reference': 'Reference',
}
const kindLabel = computed(() => props.kind ? KIND[props.kind] : undefined)
</script>

<template>
  <span class="flex flex-wrap items-center gap-2">
    <span
      v-if="kindLabel"
      class="stamp slot slot-xs px-2.5 py-1.5"
    >{{ kindLabel }}</span>
    <NuxtLink
      v-if="props.status === 'experimental'"
      to="/docs/ship/releases/stability#the-experimental-tier"
      class="stamp slot slot-xs inline-flex items-center gap-1.5 px-2.5 py-1.5 text-(--warn)!"
    >
      <Led tone="warn" />
      Experimental
    </NuxtLink>
    <NuxtLink
      v-else-if="props.status === 'planned'"
      :to="FEATURE_MAP_STATUSES"
      class="stamp slot slot-xs inline-flex items-center gap-1.5 px-2.5 py-1.5"
    >
      <Led tone="off" />
      Planned
    </NuxtLink>
    <NuxtLink
      v-else-if="props.status === 'changing'"
      :to="FEATURE_MAP_STATUSES"
      class="stamp slot slot-xs inline-flex items-center gap-1.5 px-2.5 py-1.5 text-(--warn)!"
    >
      <Led
        tone="warn"
        shape="square"
      />
      Changing
    </NuxtLink>
    <NuxtLink
      v-else-if="props.status === 'deprecated'"
      to="/docs/ship/releases/stability#deprecation"
      class="stamp slot slot-xs inline-flex items-center gap-1.5 px-2.5 py-1.5 text-(--err)!"
    >
      <Led tone="err" />
      Deprecated
    </NuxtLink>
  </span>
</template>
