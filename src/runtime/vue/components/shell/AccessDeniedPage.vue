<script setup lang="ts">
import { useHead } from '#imports'
import { useLabels } from '../../composables/use-labels'

/**
 * `<AccessDenied>` as a whole page, with the document's title and language:
 * the module's error page renders it for a 403 in an app with no
 * `error.vue` of its own.
 *
 * @internal
 */
defineOptions({ name: 'AccessDeniedPage' })
defineProps<{
  /** The error page's `error`. */
  error: { data?: unknown, url?: string }
}>()
const { t, locale } = useLabels('access')
useHead({ title: () => t('title'), htmlAttrs: { lang: () => locale.value ?? 'en' } })
</script>

<template>
  <main>
    <AccessDenied :error="error" />
  </main>
</template>
