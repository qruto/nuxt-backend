<script setup lang="ts">
import type { ContentNavigationItem } from '@nuxt/content'

// Docus 5.15.0's DocsAsideRightBottom (test/docs/docus-copies.test.ts pins
// the source), changed: the page's related links, "Was this helpful?" and
// its last-updated date come before the ecosystem links, and "Explain with
// AI" shows only once the assistant is grounded in these docs
// (`assistant.explainWithAi: true` in app.config, which Ask AI sets). On a
// page without a table of contents the block stands alone (`standalone`,
// DocsAsideRight and DocsAsideMobileBar), and opens without a separator.
const props = defineProps<{
  standalone?: boolean
}>()

const route = useRoute()

const pageUrl = route.path
const appConfig = useAppConfig()
const { t } = useDocusI18n()
const { isEnabled, isStudioExpanded, open } = useAssistant()
const page = inject(DOCS_PAGE, ref(null))
const navigation = inject<Ref<ContentNavigationItem[]>>('navigation')

const related = computed(() => {
  const pages = flattenNavigation(navigation?.value)
  return (page.value?.related ?? []).map(path => ({
    label: pages.find(item => item.path === path)?.title ?? path,
    to: path,
    icon: 'i-lucide-arrow-right',
  }))
})

const showExplainWithAi = computed(() => {
  return isEnabled.value && appConfig.assistant?.explainWithAi === true && !isStudioExpanded.value
})

const explainIcon = computed(() => appConfig.assistant?.icons?.explain || 'i-lucide-brain')

/** The groups the block shows, in order; each opens with a separator, but a standalone block's first. */
const groups = computed(() => [
  related.value.length ? 'related' : undefined,
  page.value ? 'page' : undefined,
  appConfig.toc?.bottom?.links?.length ? 'ecosystem' : undefined,
  showExplainWithAi.value ? 'assistant' : undefined,
].filter(Boolean))
const separated = (group: string) => !(props.standalone && groups.value[0] === group)
</script>

<template>
  <div class="space-y-6">
    <template v-if="related.length">
      <USeparator
        v-if="separated('related')"
        type="dashed"
      />

      <UPageLinks
        title="Related"
        :links="related"
      />
    </template>

    <template v-if="page">
      <USeparator
        v-if="separated('page')"
        type="dashed"
      />

      <DocsPageFeedback :title="page.title" />

      <p
        v-if="page.modifiedAt"
        class="text-xs text-muted"
      >
        Updated <time :datetime="page.modifiedAt">{{ formatUpdated(page.modifiedAt) }}</time>
      </p>
    </template>

    <template v-if="appConfig.toc?.bottom?.links?.length">
      <USeparator
        v-if="separated('ecosystem')"
        type="dashed"
      />

      <UPageLinks
        :title="appConfig.toc?.bottom?.title || t('docs.links')"
        :links="appConfig.toc?.bottom?.links"
      />
    </template>

    <template v-if="showExplainWithAi">
      <USeparator
        v-if="separated('assistant')"
        type="dashed"
      />

      <UButton
        :icon="explainIcon"
        :label="t('assistant.explainWithAi')"
        size="sm"
        variant="link"
        class="p-0 text-sm"
        color="neutral"
        @click="open(`Explain the page ${pageUrl}`, true)"
      />
    </template>
  </div>
</template>
