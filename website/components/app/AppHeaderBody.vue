<script setup lang="ts">
import type { ContentNavigationItem } from '@nuxt/content'

// Docus 5.15.0's AppHeaderBody (test/docs/docus-copies.test.ts pins the
// source), changed: the drawer below lg carries the header's keys and the
// version chip, then the package-manager picker (components/PmChoice.vue,
// in the tab row from lg up), above the six tabs, and lists the tabs on
// every page, each linking to its first page, with the badge of a tab
// whose every page carries it (Experimental or Planned, utils/nav-badges.ts).
const navigation = inject<Ref<ContentNavigationItem[]>>('navigation')

const contentNavVariants = useUIConfig('contentNavigation')

const tabs = computed<ContentNavigationItem[]>(() => hoistBadges(navigation?.value || []).map(({ children, ...item }) => ({
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

    <div>
      <p
        id="drawer-pm"
        class="stamp mb-3"
      >
        Commands
      </p>
      <PmChoice
        labelledby="drawer-pm"
        labels
      />
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
