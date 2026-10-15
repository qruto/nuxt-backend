<script setup lang="ts">
import type { ContentNavigationItem } from '@nuxt/content'

// Docus 5.14.0's AppHeaderBottom (test/docs/docus-copies.test.ts pins the
// source), changed: a tab whose every page is experimental carries the
// Experimental badge (utils/nav-badges.ts).
const navigation = inject<Ref<ContentNavigationItem[]>>('navigation')
const { sections } = useSubNavigation()

const navMenuVariants = useUIConfig('navigationMenu')

const badges = computed(() => new Map(hoistExperimental(navigation?.value ?? []).map(item => [getFirstPagePath(item), item.badge as typeof EXPERIMENTAL_BADGE | undefined])))
const items = computed(() => sections.value.map(section => ({ ...section, badge: badges.value.get(section.to) })))
</script>

<template>
  <USeparator class="hidden lg:flex" />

  <UContainer class="hidden items-center justify-between lg:flex">
    <UNavigationMenu
      :items="items"
      :highlight="navMenuVariants.highlight ?? true"
      :highlight-color="navMenuVariants.highlightColor"
      :variant="navMenuVariants.variant ?? 'pill'"
      :color="navMenuVariants.color"
      class="-mx-2.5 -mb-px"
    />

    <AppHeaderBottomRight />
  </UContainer>
</template>
