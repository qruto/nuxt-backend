<script setup lang="ts">
import type { DocsCollectionItem } from '@nuxt/content'

// Docus 5.15.0's DocsAsideRight (test/docs/docus-copies.test.ts pins the
// source), changed: Docus draws the aside's bottom block only under a table
// of contents, so on a page without headings the related pages, "Was this
// helpful?" and the last-updated date never showed. There the block stands
// alone, in the same place.
const props = defineProps<{
  page?: DocsCollectionItem | null
}>()

const links = computed(() => props.page?.body?.toc?.links || [])

const { subNavigationMode } = useSubNavigation()
const appConfig = useAppConfig()
const { t } = useDocusI18n()

const contentTocVariants = useUIConfig('contentToc')
</script>

<template>
  <div>
    <UContentToc
      v-if="links.length"
      :highlight="contentTocVariants.highlight ?? true"
      :highlight-color="contentTocVariants.highlightColor"
      :highlight-variant="contentTocVariants.highlightVariant ?? 'circuit'"
      :color="contentTocVariants.color"
      :title="appConfig.toc?.title || t('docs.toc')"
      :links="links"
      :class="{ 'hidden lg:block': subNavigationMode }"
    >
      <template #bottom>
        <DocsAsideRightBottom />
      </template>
    </UContentToc>

    <div
      v-else
      class="sticky top-(--ui-header-height) hidden max-h-[calc(100vh-var(--ui-header-height))] overflow-y-auto py-8 lg:block"
    >
      <DocsAsideRightBottom standalone />
    </div>

    <LazyDocsAsideMobileBar
      v-if="subNavigationMode"
      :links="links"
    />
  </div>
</template>
