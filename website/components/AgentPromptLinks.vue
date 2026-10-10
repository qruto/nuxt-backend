<!-- Under the agent install prompt, embeddable from markdown:
     :agent-prompt-links
     A tab per agent and, under the chosen one, a key for every app that opens
     it with the prompt typed in. The links come from shared/agent-prompt.ts. -->
<script setup lang="ts">
import { AGENT_PROVIDERS } from '#shared/agent-prompt'

// The reader's agent is kept in localStorage: SSR renders the first one, the
// stored one is applied on mount.
const STORAGE_KEY = 'nb-agent'
const agent = useState(STORAGE_KEY, () => AGENT_PROVIDERS[0]!.agent)

onMounted(() => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (AGENT_PROVIDERS.some(provider => provider.agent === stored)) agent.value = stored!
  }
  catch {
    // Private mode or blocked storage: the first agent stands.
  }
})

// The tab's value is a slug of the agent's name: Reka builds the tab's and the
// panel's ids from it, and a space ("Claude Code") makes both invalid.
const slug = (name: string) => name.toLowerCase().replaceAll(' ', '-')

function choose(value: string | number) {
  const provider = AGENT_PROVIDERS.find(entry => slug(entry.agent) === value)
  if (!provider) return
  agent.value = provider.agent
  try {
    localStorage.setItem(STORAGE_KEY, agent.value)
  }
  catch {
    // The choice lasts for this visit only.
  }
}

// Seven named tabs need ~39rem. Narrower, the tabs are marks only except the
// chosen one, and below ~21.5rem (a phone) that one is a mark too; the raised
// tab still says which is chosen, and the names stay for screen readers.
const items = computed(() => AGENT_PROVIDERS.map(provider => ({
  label: provider.agent,
  value: slug(provider.agent),
  icon: provider.icon,
  provider,
  ui: { label: provider.agent === agent.value ? '@max-[21.5rem]:sr-only' : '@max-2xl:sr-only' },
})))
</script>

<template>
  <div class="@container my-4">
    <p class="mb-2.5 text-sm text-muted">
      Or open it in your agent with the prompt typed in. Nothing runs until you press send.
    </p>
    <UTabs
      :model-value="slug(agent)"
      :items="items"
      color="neutral"
      size="sm"
      :ui="{
        root: 'gap-3',
        list: 'slot rounded-full',
        indicator: 'plaque rounded-full',
        trigger: 'rounded-full data-[state=active]:text-highlighted',
      }"
      @update:model-value="choose"
    >
      <template #content="{ item }">
        <ul class="m-0 flex list-none flex-wrap gap-2 p-0">
          <li
            v-for="link in item.provider.links"
            :key="link.href"
            class="m-0 p-0"
          >
            <a
              :href="link.href"
              :aria-label="`Open the prompt in ${item.provider.agent}, ${link.app}`"
              class="plaque flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium text-highlighted no-underline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <UIcon
                :name="link.icon"
                class="size-4 shrink-0 text-toned"
              />
              {{ link.app }}
            </a>
          </li>
        </ul>
      </template>
    </UTabs>
  </div>
</template>

<style scoped>
/* Server-rendered, the tabs have no indicator yet, and Nuxt UI paints the
   chosen tab's ::before instead, white in its neutral colour, under a label
   that is light here. Give it the plaque face the indicator gets once the
   page hydrates. */
:deep([data-slot="trigger"][data-state="active"])::before {
  background: var(--grad-plaque);
  box-shadow: var(--plaque);
}
</style>
