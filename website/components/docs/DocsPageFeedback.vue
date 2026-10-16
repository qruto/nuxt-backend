<script setup lang="ts">
/**
 * "Was this helpful?" in a page's aside. Nothing is sent anywhere: a yes is
 * thanked, and a no opens a GitHub discussion with the page already filled
 * in, where the reader says what was missing. The keys stay once pressed,
 * so keyboard focus stays on the one the reader chose, and the answer is
 * said once, in a status line that is always in the page. The label's id is
 * this copy's own: on a phone the "On this page" drawer holds a second one.
 */
const props = defineProps<{
  title: string
}>()

const route = useRoute()
const site = useSiteConfig()
const { github } = useAppConfig()
const answer = ref<'yes' | 'no'>()
const labelId = useId()

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
    :aria-labelledby="labelId"
  >
    <p
      :id="labelId"
      class="stamp mb-3"
    >
      Was this helpful?
    </p>
    <div class="flex gap-2">
      <Key
        size="xs"
        :pressed="answer === 'yes'"
        @click="answer = 'yes'"
      >
        Yes
      </Key>
      <Key
        size="xs"
        :pressed="answer === 'no'"
        @click="answer = 'no'"
      >
        No
      </Key>
    </div>
    <p
      class="text-sm text-muted"
      :class="{ 'mt-3': answer }"
      role="status"
    >
      <template v-if="answer === 'yes'">
        Good to hear.
      </template>
      <template v-else-if="answer === 'no'">
        Tell us what was missing in
        <ULink
          :to="discussion"
          target="_blank"
          class="text-default underline underline-offset-3"
        >a discussion</ULink>
        that starts with this page filled in.
      </template>
    </p>
  </div>
</template>
