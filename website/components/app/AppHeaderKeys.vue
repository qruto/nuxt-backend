<script setup lang="ts">
/**
 * The site's top-level keys: Docs, Playground with its status LED, Agents
 * and GitHub. A key is down (`aria-current`) while the reader is anywhere
 * in its section, not only on the page it links to.
 */
const route = useRoute()
const { github } = useAppConfig()
const status = usePlaygroundStatus()

const within = (prefix: string) => route.path === prefix || route.path.startsWith(`${prefix}/`)
const current = (active: boolean) => active ? { 'aria-current': 'true' as const } : {}

const LED = { live: 'ok', down: 'err', unknown: 'off' } as const
const SPOKEN = { live: ', live', down: ', unreachable', unknown: '' } as const
</script>

<template>
  <nav
    aria-label="Site"
    class="flex flex-wrap items-center gap-2 lg:flex-nowrap"
  >
    <Key
      to="/docs/start"
      size="nav"
      v-bind="current(within('/docs') && !within('/docs/agents'))"
    >
      Docs
    </Key>
    <Key
      to="/playground"
      size="nav"
      v-bind="current(within('/playground'))"
    >
      <Led
        :tone="LED[status]"
        :pulse="status === 'live'"
      />
      Playground<span class="sr-only">{{ SPOKEN[status] }}</span>
    </Key>
    <Key
      to="/docs/agents"
      size="nav"
      v-bind="current(within('/docs/agents'))"
    >
      Agents
    </Key>
    <Key
      :to="github && github.url"
      size="nav"
      target="_blank"
    >
      <UIcon
        name="i-simple-icons-github"
        class="size-3.5"
      />
      GitHub
    </Key>
  </nav>
</template>
