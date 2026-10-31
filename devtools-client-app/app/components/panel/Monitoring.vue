<script setup lang="ts">
import { HEALTH_ROUTE, LOCAL_LOG_ROUTE } from '../../../../src/convex/constants'
import type { CapabilityState } from '../../../../src/capabilities/types'
import type { LocalErrorEntry } from '../../../../src/runtime/monitoring/report'
import { layerSignal, type Signal } from '~/utils/signal'

// The monitoring capability on the dev server: its state as the console reads
// it, the app's health as `/api/backend/health` answers it (the detail, on
// a dev deployment), and the dev server's local error log, which stands
// in for an error-reporting service. The panel is served by the dev server
// itself, so both are same-origin reads of the app's own routes.

interface AppHealth {
  status: 'ok' | 'degraded' | 'failing'
  capabilities: Record<string, CapabilityState>
  detail?: Record<string, { reason: string, missingEnv: string[], top: string | null }>
}

/** How often the open tab reads the log and the health again. */
const POLL_MS = 5000

const state = usePanelState()
const panel = usePanel()

/** The monitoring capability, as the Overview's console shows it. */
const capability = computed(() => state.info?.capabilities.find(entry => entry.name === 'monitoring'))

const health = ref<AppHealth | null>(null)
const entries = ref<LocalErrorEntry[]>([])
const problem = ref<string | null>(null)

const HEALTH_SIGNAL: Record<AppHealth['status'], Signal> = { ok: 'ok', degraded: 'warn', failing: 'err' }

/** Newest first: the panel reads from the top. */
const newestFirst = computed(() => [...entries.value].reverse())

async function refresh() {
  try {
    // fallow-ignore-next-line security-sink -- destinations are the app's own same-origin route constants, never input; verified 2026-10-19
    const [healthResponse, logResponse] = await Promise.all([fetch(HEALTH_ROUTE), fetch(LOCAL_LOG_ROUTE)])
    health.value = await healthResponse.json() as AppHealth
    entries.value = logResponse.ok ? (await logResponse.json() as { entries: LocalErrorEntry[] }).entries : []
    problem.value = null
  }
  catch (error) {
    problem.value = error instanceof Error ? error.message : String(error)
  }
}

async function clear() {
  // fallow-ignore-next-line security-sink -- destination is the app's own same-origin route constant, never input; verified 2026-10-19
  await fetch(LOCAL_LOG_ROUTE, { method: 'DELETE' })
  entries.value = []
}

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  void refresh()
  timer = setInterval(() => void refresh(), POLL_MS)
})
onUnmounted(() => clearInterval(timer))

const time = (at: number) => new Date(at).toLocaleTimeString()
</script>

<template>
  <NCard
    v-if="capability"
    class="p4 flex items-center gap-3 flex-wrap"
  >
    <SignalBadge :signal="layerSignal(capability.state)">
      {{ capability.state }}
    </SignalBadge>
    <span class="flex-1">{{ capability.reason }}</span>
    <NButton
      n="xs"
      icon="carbon-document"
      :to="capability.docsUrl"
      target="_blank"
    >
      Docs
    </NButton>
  </NCard>

  <PanelCard title="Health">
    <template #actions>
      <NButton
        n="xs"
        icon="carbon-renew"
        title="Read the health and the log again"
        @click="refresh()"
      />
    </template>
    <p class="op65">
      What <code>{{ HEALTH_ROUTE }}</code> answers an uptime check: the summary and each capability's state, and for an
      admin (or anyone, on a dev deployment) why.
    </p>
    <NTip
      v-if="problem"
      n="red"
      icon="carbon-warning"
    >
      {{ problem }}
    </NTip>
    <template v-if="health">
      <div class="flex items-center gap-2">
        <SignalBadge :signal="HEALTH_SIGNAL[health.status]">
          {{ health.status }}
        </SignalBadge>
      </div>
      <ol class="flex flex-col gap-1">
        <li
          v-for="(layerState, name) of health.capabilities"
          :key="name"
          class="flex items-start gap-2 py1 border-b n-border-base"
        >
          <Led :signal="layerSignal(layerState)" />
          <span class="font-mono text-xs w-24 shrink-0">{{ name }}</span>
          <span class="text-xs op65 w-20 shrink-0">{{ layerState }}</span>
          <span
            v-if="health.detail?.[name]"
            class="text-xs flex-1"
          >{{ health.detail[name].reason }}</span>
        </li>
      </ol>
    </template>
  </PanelCard>

  <PanelCard title="Local error log">
    <template #actions>
      <NButton
        n="xs"
        icon="carbon-trash-can"
        @click="clear()"
      >
        Clear
      </NButton>
    </template>
    <p class="op65">
      What an error-reporting service would receive from this dev server: failed backend calls from the browser and
      the server, with the function and the error code, and crashes. A refusal (nobody signed in, a missing role) is
      the app working as designed, and is left out.
      <button
        type="button"
        class="underline"
        @click="panel.select('overview')"
      >
        The Overview
      </button>
      shows every capability.
    </p>
    <p
      v-if="entries.length === 0"
      class="op50"
    >
      Nothing captured yet.
    </p>
    <ol
      v-else
      class="flex flex-col gap-1"
    >
      <li
        v-for="entry of newestFirst"
        :key="entry.id"
        class="flex items-start gap-2 py1 border-b n-border-base"
      >
        <Led signal="err" />
        <span class="font-mono text-xs op50 w-20 shrink-0">{{ time(entry.at) }}</span>
        <span class="text-xs op65 w-14 shrink-0">{{ entry.source }}</span>
        <span class="flex-1 min-w-0">
          <span
            v-if="entry.function"
            class="font-mono text-xs"
          >{{ entry.function }} · </span>
          <span class="font-mono text-xs op65">{{ entry.reason ?? entry.code }}</span>
          <span class="block text-xs break-words">{{ entry.message }}</span>
        </span>
      </li>
    </ol>
  </PanelCard>
</template>
