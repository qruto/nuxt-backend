<script setup lang="ts">
import type { ContentNavigationItem } from '@nuxt/content'

// Docus 5.15.0's DocsAsideLeftBody (test/docs/docus-copies.test.ts pins the
// source), changed: groups collapse, and the one holding the page opens;
// a group's name is a stamped section label, and an amber light marks
// where an experimental surface starts (utils/nav-badges.ts): the sidebar
// has no room for the word.
// Moving to a page in a closed group redraws the tree with that group open;
// within a group the reader's own toggles stay. Closed groups keep their
// links in the page, so every route stays one crawl away.
const route = useRoute()
const appConfig = useAppConfig()
const navigation = inject<Ref<ContentNavigationItem[]>>('navigation')
const { sidebarNavigation } = useSubNavigation(computed(() => hoistExperimental(navigation?.value ?? [])))

const contentNavVariants = useUIConfig('contentNavigation')

const holds = (item: ContentNavigationItem, path: string): boolean =>
  item.path === path || !!item.children?.some(child => holds(child, path))
const openGroup = computed(() => sidebarNavigation.value.find(item => item.children?.length && holds(item, route.path))?.path)
</script>

<template>
  <UContentNavigation
    :key="openGroup"
    default-open
    :unmount-on-hide="false"
    :highlight="contentNavVariants.highlight ?? true"
    :highlight-color="contentNavVariants.highlightColor"
    :variant="contentNavVariants.variant ?? 'link'"
    :color="contentNavVariants.color"
    :navigation="sidebarNavigation"
  >
    <template #link-title="{ link }">
      <span :class="link.children?.length ? 'stamp engr-lt block text-start leading-normal whitespace-normal' : undefined">{{ link.title }}</span>
    </template>
    <template #link-trailing="{ link, ui }">
      <Led
        v-if="link.badge"
        tone="warn"
        label="Experimental"
      />
      <UIcon
        v-if="link.children?.length"
        :name="appConfig.ui.icons.chevronDown"
        :class="ui.linkTrailingIcon()"
      />
    </template>
  </UContentNavigation>
</template>
