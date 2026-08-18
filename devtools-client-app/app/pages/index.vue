<script setup lang="ts">
const state = usePanelState()

const findingBadge: Record<string, string> = { pass: 'green', warn: 'orange', fail: 'red' }
const outcomeBadge = (outcome: string) => outcome === 'ok' ? 'green' : outcome === 'duplicate' ? 'blue' : 'orange'

const problems = computed(() => (state.info?.findings ?? []).filter(finding => finding.status !== 'pass'))
const passes = computed(() => (state.info?.findings ?? []).filter(finding => finding.status === 'pass'))

const envGroups = computed(() => {
  const env = state.info?.env
  if (!env) return []
  return [
    { label: 'Required on the deployment', entries: Object.entries(env.required) },
    { label: 'Optional (designed degradation)', entries: Object.entries(env.optional) },
  ]
})

const versions = computed(() => Object.entries(state.info?.versions ?? {}))

const copied = ref<string | null>(null)
async function copyHint(id: string, hint: string) {
  await copyText(hint)
  copied.value = id
  setTimeout(() => copied.value = null, 1200)
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <NPanelGrids v-if="!state.info">
      <NLoading>Connecting to the dev server…</NLoading>
    </NPanelGrids>

    <template v-else>
      <NCard class="p4 flex items-center gap-3 flex-wrap">
        <NBadge
          v-if="state.snapshot?.convexConnected !== null && state.snapshot"
          :n="state.snapshot.convexConnected ? 'green' : 'orange'"
        >
          {{ state.snapshot.convexConnected ? 'Convex connected' : 'Convex disconnected' }}
        </NBadge>
        <span class="font-mono text-xs op65">functions: {{ state.info.functionsDir }}/</span>
        <span class="ml-auto flex gap-3 text-xs op50 font-mono">
          <span
            v-for="[name, version] of versions"
            :key="name"
          >{{ name }}@{{ version }}</span>
        </span>
      </NCard>

      <NCard class="p4 flex flex-col gap-2">
        <div class="op50 text-xs">
          Preflight
        </div>
        <div
          v-for="finding of problems"
          :key="finding.id"
          class="flex flex-col gap-1"
        >
          <div class="flex items-center gap-2">
            <NBadge :n="findingBadge[finding.status]">
              {{ finding.status }}
            </NBadge>
            <span>{{ finding.title }}</span>
            <span class="op65 text-xs">{{ finding.message }}</span>
          </div>
          <div
            v-if="finding.fixHint"
            class="flex items-center gap-2 pl2"
          >
            <code class="font-mono text-xs op65 bg-active rounded px2 py0.5">{{ finding.fixHint }}</code>
            <NButton
              n="xs"
              :icon="copied === finding.id ? 'carbon-checkmark' : 'carbon-copy'"
              title="Copy fix"
              @click="copyHint(finding.id, finding.fixHint)"
            />
          </div>
        </div>
        <div
          v-if="!problems.length"
          class="op50"
        >
          All checks pass.
        </div>
        <div class="flex gap-2 flex-wrap">
          <NBadge
            v-for="finding of passes"
            :key="finding.id"
            n="green"
          >
            {{ finding.title }} ✓
          </NBadge>
        </div>
      </NCard>

      <NCard class="p4 flex flex-col gap-3">
        <div class="op50 text-xs">
          Deployment env (presence only — values never leave the dev server)
        </div>
        <div
          v-for="group of envGroups"
          :key="group.label"
          class="flex flex-col gap-1"
        >
          <div class="text-xs op65">
            {{ group.label }}
          </div>
          <div class="flex gap-2 flex-wrap">
            <NBadge
              v-for="[name, present] of group.entries"
              :key="name"
              :n="present ? 'green' : 'gray'"
            >
              <span class="font-mono">{{ name }}</span>&nbsp;{{ present ? 'set' : 'unset' }}
            </NBadge>
          </div>
        </div>
      </NCard>

      <NCard class="p4 flex flex-col gap-2">
        <div class="op50 text-xs">
          Pages
        </div>
        <div
          v-if="!state.info.options.pagesEnabled"
          class="op50"
        >
          The ready-made page set is disabled (<code>backend.pages: false</code>).
        </div>
        <table
          v-else
          class="text-left text-xs"
        >
          <thead class="op50">
            <tr>
              <th class="py1 pr4 font-normal">
                Page
              </th>
              <th class="py1 pr4 font-normal">
                Path
              </th>
              <th class="py1 font-normal">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="page of state.info.pages"
              :key="page.key"
            >
              <td class="py1 pr4">
                {{ page.key }}
              </td>
              <td class="py1 pr4 font-mono">
                {{ page.path }}
              </td>
              <td class="py1 flex gap-1">
                <NBadge
                  v-if="page.auth"
                  n="blue"
                >
                  auth
                </NBadge>
                <NBadge :n="page.shadowed ? 'orange' : 'green'">
                  {{ page.shadowed ? 'shadowed by app page' : 'mounted' }}
                </NBadge>
              </td>
            </tr>
          </tbody>
        </table>
      </NCard>

      <NCard class="p4 flex flex-col gap-2">
        <div class="op50 text-xs">
          Agents (MCP)
        </div>
        <div
          v-if="state.info.mcp.enabled"
          class="flex items-center gap-2 flex-wrap"
        >
          <NBadge n="green">
            enabled
          </NBadge>
          <span class="font-mono text-xs op65">{{ state.info.mcp.route }}</span>
          <span class="op65 text-xs">{{ state.info.mcp.builtinTools.length }} built-in tools</span>
          <span class="op50 text-xs w-full font-mono">{{ state.info.mcp.builtinTools.join(' · ') }}</span>
        </div>
        <div
          v-else
          class="op50"
        >
          Disabled (<code>backend.mcp: false</code>) — no MCP endpoint, no OAuth discovery routes.
        </div>
      </NCard>

      <NCard class="p4 flex flex-col gap-2">
        <div class="op50 text-xs">
          Recent webhook deliveries
        </div>
        <div
          v-if="!state.snapshot?.webhooks.length"
          class="op50"
        >
          {{ state.bridgeAvailable === false
            ? 'Bridge unavailable — reload the inspected app.'
            : 'None recorded yet (sign in to read the delivery log).' }}
        </div>
        <table
          v-else
          class="text-left text-xs"
        >
          <thead class="op50">
            <tr>
              <th class="py1 pr4 font-normal">
                Service
              </th>
              <th class="py1 pr4 font-normal">
                Type
              </th>
              <th class="py1 pr4 font-normal">
                Outcome
              </th>
              <th class="py1 font-normal">
                Received
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row of state.snapshot.webhooks"
              :key="`${row.service}:${row.deliveryId}:${row.receivedAt}`"
            >
              <td class="py1 pr4">
                {{ row.service }}
              </td>
              <td class="py1 pr4 font-mono">
                {{ row.type ?? '—' }}
              </td>
              <td class="py1 pr4">
                <NBadge :n="outcomeBadge(row.outcome)">
                  {{ row.outcome }}
                </NBadge>
                <span
                  v-if="row.note"
                  class="op50 pl1"
                >{{ row.note }}</span>
              </td>
              <td class="py1 font-mono op65">
                {{ formatTime(row.receivedAt) }}
              </td>
            </tr>
          </tbody>
        </table>
      </NCard>
    </template>
  </div>
</template>
