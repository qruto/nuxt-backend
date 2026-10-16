<script setup lang="ts">
/**
 * "Was this helpful?" under a page's table of contents. Nothing is sent
 * anywhere: a yes is thanked, and a no opens a GitHub discussion with the
 * page already filled in, where the reader says what was missing.
 */
const props = defineProps<{
  title: string
}>()

const route = useRoute()
const site = useSiteConfig()
const { github } = useAppConfig()
const answer = ref<'yes' | 'no'>()

const discussion = computed(() => {
  if (!github) return undefined
  const url = new URL(`${github.url}/discussions/new`)
  url.searchParams.set('category', 'general')
  url.searchParams.set('title', `Docs: ${props.title}`)
  url.searchParams.set('body', `Page: ${site.url}${route.path}\n\nWhat was missing or unclear?\n`)
  return url.toString()
})
</script>

<template>
  <div
    role="group"
    aria-labelledby="page-feedback"
  >
    <p
      id="page-feedback"
      class="stamp mb-3"
    >
      Was this helpful?
    </p>
    <div
      v-if="!answer"
      class="flex gap-2"
    >
      <button
        type="button"
        class="k k-xs"
        @click="answer = 'yes'"
      >
        Yes
      </button>
      <button
        type="button"
        class="k k-xs"
        @click="answer = 'no'"
      >
        No
      </button>
    </div>
    <p
      v-else-if="answer === 'yes'"
      class="text-sm text-muted"
      role="status"
    >
      Good to hear.
    </p>
    <p
      v-else
      class="text-sm text-muted"
      role="status"
    >
      Tell us what was missing in
      <ULink
        :to="discussion"
        target="_blank"
        class="text-default underline underline-offset-3"
      >a discussion</ULink>
      that starts with this page filled in.
    </p>
  </div>
</template>
