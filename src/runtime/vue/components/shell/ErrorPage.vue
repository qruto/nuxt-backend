<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import type { NuxtError } from '#app'
import NuxtErrorPage from '#app/components/nuxt-error-page.vue'

/**
 * The error page of an app with none of its own (no `error.vue` in the app
 * or a layer): a 403, the page guard's included, shows `<AccessDenied>`;
 * every other error, Nuxt's own page. An app's `error.vue` replaces it.
 *
 * @internal
 */
defineOptions({ name: 'BackendErrorPage' })
const props = defineProps<{
  /** The error Nuxt shows. */
  error: NuxtError
}>()
// Loaded only for a 403: the error page ships in every app's entry.
const AccessDeniedPage = defineAsyncComponent(() => import('./AccessDeniedPage.vue'))
// Decided once, as Nuxt's own page decides: the page goes when the error clears.
const denied = Number(props.error.status) === 403
</script>

<template>
  <AccessDeniedPage
    v-if="denied"
    :error="error"
  />
  <NuxtErrorPage
    v-else
    :error="error"
  />
</template>
