<script setup lang="ts">
import { pageKeys, type PageKeyFields } from '~~/shared/page-keys'

/**
 * A docs page's keys, from its frontmatter: Try live (with the playground's
 * light), API and Source. modules/docs-pages.ts writes the same keys into
 * the page's Markdown for agents.
 */
const props = defineProps<{
  page: PageKeyFields
}>()

const keys = computed(() => pageKeys(props.page))
const status = usePlaygroundStatus()

const LED = { live: 'ok', down: 'err', unknown: 'off' } as const
const ICON = { api: 'i-lucide-book-open', source: 'i-simple-icons-github' } as const
</script>

<template>
  <Key
    v-for="key in keys"
    :key="key.name"
    :to="key.to"
    size="xs"
    v-bind="key.external ? { target: '_blank' } : {}"
  >
    <Led
      v-if="key.name === 'playground'"
      :tone="LED[status]"
      :pulse="status === 'live'"
    />
    <UIcon
      v-else
      :name="ICON[key.name]"
      class="size-3.5"
    />
    {{ key.label }}
  </Key>
</template>
