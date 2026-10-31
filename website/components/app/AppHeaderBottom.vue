<script setup lang="ts">
import type { ContentNavigationItem } from '@nuxt/content'
import type { NavBadge } from '~/utils/nav-badges'

// Docus 5.15.0's AppHeaderBottom (test/docs/docus-copies.test.ts pins the
// source), changed: a tab whose every page carries the same badge
// (Experimental or Planned) carries it too (utils/nav-badges.ts).
const navigation = inject<Ref<ContentNavigationItem[]>>('navigation')
const { sections } = useSubNavigation()

const navMenuVariants = useUIConfig('navigationMenu')

const badges = computed(() => new Map(hoistBadges(navigation?.value ?? []).map(item => [getFirstPagePath(item), item.badge as NavBadge | undefined])))
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
