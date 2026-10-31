<script setup lang="ts">
import { computed } from 'vue'
import type { NuxtError } from '#app'
import DocsError from 'docus/app/error.vue'

// The site's error page: Docus's own, except for the page guard's 403
// (definePageMeta({ auth: { role } }) on a playground page), which renders
// the packaged <AccessDenied> the way the docs tell an app's error.vue to
// (Auth › Access › Protect pages), on the sign-in page's plaque.
//
// Nuxt imports the error page with the entry, on every page of the site:
// <AccessDenied> loads lazily, so the auth client it reads the session
// from stays out of the docs' entry (website/modules/deferred-backend-client).
const props = defineProps<{ error: NuxtError }>()

const denied = computed(() => props.error.status === 403)

useHead({
  title: () => (denied.value ? 'No access' : undefined),
  htmlAttrs: { lang: 'en' },
})
</script>

<template>
  <UApp v-if="denied">
    <main class="pg-shell bk-depth grid min-h-dvh place-items-center px-4 py-8">
      <div class="plaque grid w-full max-w-[32rem] gap-4 p-6">
        <Nameplate sub="access" />
        <LazyAccessDenied
          :error="error"
          home="/playground"
          class="max-w-none p-0 [&_[data-access=home]]:k [&_[data-access=home]]:k-xs [&_[data-access=switch-workspace]]:k [&_[data-access=switch-workspace]]:k-xs [&_[data-access=switch-account]]:k [&_[data-access=switch-account]]:k-xs [&_[data-access=title]]:font-display"
        />
      </div>
    </main>
  </UApp>
  <DocsError
    v-else
    :error="error"
  />
</template>
