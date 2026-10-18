<script setup lang="ts">
import type { ContentNavigationItem } from '@nuxt/content'

// Docus 5.15.0's AppHeaderBody (test/docs/docus-copies.test.ts pins the
// source), changed: the drawer below lg carries the header's keys and the
// version chip above the ten tabs, and lists the tabs on every page, each
// linking to its first page, with the Experimental badge of a tab whose
// every page is experimental.
const navigation = inject<Ref<ContentNavigationItem[]>>('navigation')

const contentNavVariants = useUIConfig('contentNavigation')

const tabs = computed<ContentNavigationItem[]>(() => hoistExperimental(navigation?.value || []).map(({ children, ...item }) => ({
  ...item,
  path: children?.length ? getFirstPagePath({ ...item, children }) : item.path,
})))
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-center gap-2">
      <AppHeaderKeys />
      <AppHeaderVersion />
    </div>

    <nav aria-labelledby="drawer-tabs">
      <p
        id="drawer-tabs"
        class="stamp mb-3"
      >
        Docs
      </p>
      <UContentNavigation
        :collapsible="false"
        :highlight="contentNavVariants.highlight ?? true"
        :highlight-color="contentNavVariants.highlightColor"
        :variant="contentNavVariants.variant ?? 'link'"
        :color="contentNavVariants.color"
        :navigation="tabs"
      />
    </nav>
  </div>
</template>
