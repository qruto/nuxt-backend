<script setup lang="ts">
import { kebabCase } from 'scule'
import type { Collections, ContentNavigationItem, DocsCollectionItem } from '@nuxt/content'
import { findPageHeadline } from '@nuxt/content/utils'

// Docus 5.15.0's docs page (test/docs/docus-copies.test.ts pins the
// source), changed: the header carries the page's trail (and its
// BreadcrumbList), its kind and stability chips, and its Try live, API and
// Source keys, always under the title; the page reaches the aside through
// DOCS_PAGE. One locale, so the i18n branches are gone.
definePageMeta({
  layout: 'docs',
})

const route = useRoute()
const { t } = useDocusI18n()
const { isOpen } = useAssistant()
const appConfig = useAppConfig()
const navigation = inject<Ref<ContentNavigationItem[]>>('navigation')

const [{ data: page }, { data: surround }] = await Promise.all([
  useAsyncData(kebabCase(route.path), () => queryCollection('docs' as keyof Collections).path(route.path).first() as Promise<DocsCollectionItem | null>),
  useAsyncData(`${kebabCase(route.path)}-surround`, () => {
    return queryCollectionItemSurroundings('docs' as keyof Collections, route.path, {
      fields: ['description'],
    })
  }),
])

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
}

provide(DOCS_PAGE, page)

const title = page.value.seo?.title || page.value.title
const description = page.value.seo?.description || page.value.description

const headline = ref(findPageHeadline(navigation?.value, page.value?.path))
const trail = computed(() => pageTrail(navigation?.value, page.value?.path || ''))
const crumbs = computed(() => trail.value.map((step, index) => ({
  label: step.title,
  to: step.page && index < trail.value.length - 1 ? step.path : undefined,
})))

useSeo({
  title,
  description,
  type: 'article',
  modifiedAt: page.value.modifiedAt,
  // Only steps a page answers at: a crawler follows every item.
  breadcrumbs: computed(() => trail.value.filter(step => step.page)),
})
watch(() => navigation?.value, () => {
  headline.value = findPageHeadline(navigation?.value, page.value?.path) || headline.value
})

// Docus names it 'Docs', which the og-image types do not list.
defineOgImage('Docs.takumi', {
  headline: headline.value,
  title: formatOgTitle(title),
  description: formatOgDescription(title, description),
})

const github = computed(() => appConfig.github ? appConfig.github : null)

const editLink = computed(() => {
  if (!github.value) {
    return
  }

  return [
    github.value.url,
    'edit',
    github.value.branch,
    github.value.rootDir,
    'content',
    `${page.value?.stem}.${page.value?.extension}`,
  ].filter(Boolean).join('/')
})
</script>

<template>
  <UPage
    v-if="page"
    :ui="isOpen ? { center: 'lg:col-span-10' } : undefined"
  >
    <UPageHeader
      :title="page.title"
      :description="page.description"
      :ui="{
        headline: 'flex w-full flex-wrap items-center justify-between gap-3',
        // The keys sit under the title at every width: beside it, they wrapped
        // under it once the display face loaded, and the page jumped.
        wrapper: 'flex-col lg:flex-col items-start lg:items-start gap-4',
      }"
    >
      <template #headline>
        <UBreadcrumb :items="crumbs" />
        <DocsPageChips
          :kind="page.kind"
          :status="page.status"
        />
      </template>

      <template #links>
        <DocsPageKeys :page="page" />
        <LazyDocsPageHeaderLinks hydrate-on-idle />
      </template>
    </UPageHeader>

    <UPageBody>
      <ContentRenderer
        v-if="page"
        :value="page"
      />

      <USeparator v-if="github">
        <div
          class="flex items-center gap-2 text-sm text-muted"
        >
          <UButton
            variant="link"
            color="neutral"
            :to="editLink"
            target="_blank"
            icon="i-lucide-pen"
            :ui="{ leadingIcon: 'size-4' }"
          >
            {{ t('docs.edit') }}
          </UButton>
          <template v-if="github?.url">
            <span>{{ t('common.or') }}</span>
            <UButton
              variant="link"
              color="neutral"
              :to="`${github.url}/issues/new/choose`"
              target="_blank"
              icon="i-lucide-alert-circle"
              :ui="{ leadingIcon: 'size-4' }"
            >
              {{ t('docs.report') }}
            </UButton>
          </template>
        </div>
      </USeparator>
      <LazyUContentSurround
        :surround="surround"
        hydrate-on-visible
      />
    </UPageBody>

    <template
      v-if="!isOpen"
      #right
    >
      <DocsAsideRight
        :page="page"
      />
    </template>
  </UPage>
</template>
