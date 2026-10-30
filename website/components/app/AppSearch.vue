<script setup lang="ts">
// Docus's AppSearch (app/components/app/AppSearch.vue), with the full-text
// search (`search.fts` in app.config.ts) ranked for this site: a section
// written by hand outranks one the reference generates from the code
// (shared/search-ranking.ts). It asks for ten times the results it shows,
// ranks them again by weight, and keeps the best.
import type { ContentNavigationItem, PageCollections } from '@nuxt/content'
import { rankByWeight } from '#shared/search-ranking'

const props = defineProps<{
  navigation?: ContentNavigationItem[]
}>()

const appConfig = useAppConfig()
const { forced: forcedColorMode } = useDocusColorMode()
const { locale, isEnabled } = useDocusI18n()

/** Docus's collection key for a locale (its utils/locale.ts): lower-cased, `-` as `_`. */
const getLocaleKey = (code: string) => code.toLowerCase().replace(/-/g, '_')

const collectionName = computed(() => (isEnabled.value ? `docs_${getLocaleKey(locale.value)}` : 'docs') as keyof PageCollections)
const useFts = appConfig.search.fts

const { data: files } = useFts
  ? { data: ref(null) }
  : useLazyAsyncData(`search_${collectionName.value}`, () => queryCollectionSearchSections(collectionName.value), {
      server: false,
      watch: [locale],
    })

const { search: searchSections, status: searchStatus, init } = useFts
  ? useSearchCollection(collectionName, { immediate: false, ignoredTags: ['style'] })
  : { search: undefined, status: ref(undefined), init: () => {} }

type Search = NonNullable<typeof searchSections>

/** The full-text search, its results re-ranked by where each section comes from. */
const search: Search | undefined = searchSections && (async (query, options) => {
  const limit = options?.limit ?? 20
  return rankByWeight(await searchSections(query, { ...options, limit: limit * 10 }), limit)
})

if (useFts) {
  const { open } = useContentSearch()
  watch(open, (value) => {
    if (value && searchStatus.value === 'idle') {
      init()
    }
  })
}

const links = computed(() => useFts
  ? props.navigation?.filter(item => item.children?.length).map(item => ({
      label: item.title,
      icon: item.icon,
      to: item.children![0]!.path,
    }))
  : undefined,
)
</script>

<template>
  <LazyUContentSearch
    :files="files"
    :search="search"
    :search-status="searchStatus"
    :links="links"
    :navigation="navigation"
    :color-mode="!forcedColorMode"
  />
</template>
