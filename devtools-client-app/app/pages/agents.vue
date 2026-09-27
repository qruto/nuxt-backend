<script setup lang="ts">
const state = usePanelState()

const mcp = computed(() => state.info?.mcp)
const origin = window.location.origin

const discovery = computed(() => mcp.value?.enabled
  ? [
      `${origin}/.well-known/oauth-protected-resource`,
      `${origin}/.well-known/oauth-authorization-server`,
    ]
  : [])
const connect = computed(() => mcp.value?.enabled ? `claude mcp add --transport http nuxt-backend ${origin}${mcp.value.route}` : '')

const copied = ref<string | null>(null)
async function copy(text: string) {
  await copyText(text)
  copied.value = text
  setTimeout(() => copied.value = null, 1200)
}
</script>

<template>
  <PanelCard
    v-if="!mcp?.enabled"
    title="Agent endpoint"
  >
    <div class="op50">
      Off (<code>backend.mcp: false</code>): no MCP endpoint and no OAuth discovery routes.
    </div>
  </PanelCard>

  <template v-else>
    <NCard class="p4 flex items-center gap-3 flex-wrap">
      <SignalBadge signal="ok">
        endpoint on
      </SignalBadge>
      <span class="font-mono text-xs">{{ origin }}{{ mcp.route }}</span>
      <span class="op50 text-xs">token exchange at {{ mcp.exchangePath }}</span>
    </NCard>

    <PanelCard title="Connect a client">
      <div class="flex items-center gap-2">
        <code class="font-mono text-xs op65 bg-active rounded px2 py0.5 flex-1">{{ connect }}</code>
        <NButton
          n="xs"
          :icon="copied === connect ? 'carbon-checkmark' : 'carbon-copy'"
          title="Copy"
          @click="copy(connect)"
        />
      </div>
      <div class="text-xs op50">
        The client signs in as one of your users and asks for scopes; the user consents on your site. A client on another
        machine needs a public URL for this dev server (a tunnel).
      </div>
    </PanelCard>

    <PanelCard title="Built-in tools">
      <table class="text-left text-xs">
        <thead class="op50">
          <tr>
            <th class="py1 pr4 font-normal">
              Tool
            </th>
            <th class="py1 pr4 font-normal">
              Scope
            </th>
            <th class="py1 font-normal">
              State
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="tool of mcp.tools"
            :key="tool.name"
          >
            <td class="py1 pr4 font-mono">
              {{ tool.name }}
            </td>
            <td class="py1 pr4 font-mono op65">
              {{ tool.scope }}
            </td>
            <td class="py1">
              <span class="flex items-center gap-1.5">
                <Led :signal="tool.enabled ? 'ok' : 'off'" />{{ tool.enabled ? 'on' : 'off in backend.mcp.tools.builtin' }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="text-xs op50">
        Scopes a client can be granted: <span class="font-mono">{{ mcp.scopes.join(' · ') }}</span>
      </div>
    </PanelCard>

    <PanelCard title="Discovery">
      <div
        v-for="url of discovery"
        :key="url"
        class="flex items-center gap-2"
      >
        <code class="font-mono text-xs op65 flex-1">{{ url }}</code>
        <NButton
          n="xs"
          :icon="copied === url ? 'carbon-checkmark' : 'carbon-copy'"
          title="Copy"
          @click="copy(url)"
        />
      </div>
    </PanelCard>
  </template>
</template>
