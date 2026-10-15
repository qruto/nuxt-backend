<script setup lang="ts">
import { joinURL } from 'ufo'

// Docus 5.14.0's DocsPageHeaderLinks (test/docs/docus-copies.test.ts pins
// the source), changed: the buttons are keys, and the two MCP items are
// gone: this site's /mcp is the package's OAuth-gated agent surface, not a
// docs server.
const route = useRoute()
const runtimeConfig = useRuntimeConfig()
const appBaseURL = runtimeConfig.app?.baseURL || '/'
const rawPrefix = (runtimeConfig.public.agentDiscovery as { rawPrefix?: string } | undefined)?.rawPrefix || '/raw'

const { t } = useDocusI18n()
const copied = ref(false)

const rawPath = computed(() => `${joinURL(rawPrefix, route.path)}.md`)
const markdownLink = computed(() => import.meta.client ? `${window.location.origin}${joinURL(appBaseURL, rawPath.value)}` : rawPath.value)
const prompt = computed(() => encodeURIComponent(`Read ${markdownLink.value} so I can ask questions about it.`))

async function copy(text: string) {
  await navigator.clipboard.writeText(text)
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 2000)
}

const items = computed(() => [
  { label: t('docs.copy.link'), icon: 'i-lucide-link', onSelect: () => void copy(markdownLink.value) },
  { label: t('docs.copy.view'), icon: 'i-simple-icons:markdown', target: '_blank' as const, to: markdownLink.value },
  { label: t('docs.copy.gpt'), icon: 'i-simple-icons:openai', target: '_blank' as const, to: `https://chatgpt.com/?hints=search&q=${prompt.value}` },
  { label: t('docs.copy.claude'), icon: 'i-simple-icons:anthropic', target: '_blank' as const, to: `https://claude.ai/new?q=${prompt.value}` },
])

async function copyPage() {
  await copy(await $fetch<string>(rawPath.value))
}
</script>

<template>
  <span class="flex items-center gap-1.5">
    <button
      type="button"
      class="k k-xs"
      @click="copyPage"
    >
      <UIcon
        :name="copied ? 'i-lucide-check' : 'i-lucide-copy'"
        class="size-3.5"
      />
      {{ t('docs.copy.page') }}
    </button>
    <UDropdownMenu
      :items="items"
      :content="{ align: 'end', side: 'bottom', sideOffset: 8 }"
    >
      <button
        type="button"
        class="k k-xs"
        aria-label="More ways to read this page"
      >
        <UIcon
          name="i-lucide-chevron-down"
          class="size-3.5"
        />
      </button>
    </UDropdownMenu>
  </span>
</template>
