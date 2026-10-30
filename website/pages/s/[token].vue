<script setup lang="ts">
import { api } from '#backend/api'

// A shared strip, for anyone with the link: read on the server, so the
// first HTML already holds it. Kept out of search results, and the token
// out of the Referer header of every link the page holds.
const route = useRoute()
const { data: strip } = await useAsyncQuery(api.strips.shared, { token: route.params.token as string })
useSeoMeta({ title: () => strip.value?.idea ?? 'Panels', robots: 'noindex', referrer: 'no-referrer' })
</script>

<template>
  <div class="page">
    <article v-if="strip">
      <h1>{{ strip.idea }}</h1>
      <figure
        v-for="panel in strip.panels"
        :key="panel.caption"
      >
        <img
          v-if="panel.url"
          :src="panel.url"
          :alt="panel.caption"
          width="480"
        >
        <figcaption>{{ panel.caption }}</figcaption>
      </figure>
      <AiLabel />
    </article>
    <p v-else>
      This link no longer works. Ask the author for a new one.
    </p>
  </div>
</template>
