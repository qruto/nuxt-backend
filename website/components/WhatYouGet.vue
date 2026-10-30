<!-- A tab landing's "What you get", embeddable from markdown:
     ::what-you-get{area="billing"}
     ::
     Everything the package ships that carries the area's tag, by
     kind, each linked to its own reference entry. The rows come from
     shared/what-you-get.json, which `pnpm docs:lookups` writes from the code;
     the agent Markdown prints the same rows (shared/agent-markdown.ts), and
     test/docs/docs-lookups.test.ts holds every page's area to a key of
     the file. -->
<script setup lang="ts">
import WHAT_YOU_GET from '#shared/what-you-get.json'

type Area = keyof typeof WHAT_YOU_GET

const props = defineProps<{
  /** The area to list (`auth`, `billing`, …), `first-run`, or `reference` for the totals. */
  area: Area
}>()

const groups = computed(() => {
  const found = WHAT_YOU_GET[props.area] as Array<{ kind: string, items: Array<{ name: string, to: string, label?: string }> }> | undefined
  if (!found) throw new Error(`::what-you-get: no area "${props.area}" in shared/what-you-get.json; run pnpm docs:lookups, or use one of ${Object.keys(WHAT_YOU_GET).join(', ')}`)
  return found
})
</script>

<template>
  <dl class="plaque my-6 grid gap-x-6 gap-y-4 rounded-xl p-5 sm:grid-cols-[11rem_1fr]">
    <template
      v-for="group in groups"
      :key="group.kind"
    >
      <dt class="stamp pt-1 text-xs text-muted">
        {{ group.kind }}
      </dt>
      <dd class="m-0 flex flex-wrap gap-x-3 gap-y-1.5">
        <NuxtLink
          v-for="item in group.items"
          :key="item.name"
          :to="item.to"
          :aria-label="item.label"
          class="font-mono text-sm text-highlighted underline decoration-dotted underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {{ item.name }}
        </NuxtLink>
      </dd>
    </template>
  </dl>
</template>
