<script setup lang="ts">
import type { DevtoolsActivityEvent, DevtoolsActivityKind } from '../../../../src/runtime/devtools/types'
import type { Signal } from '~/utils/signal'

const state = usePanelState()

/** Newest first: the panel reads from the top. */
const events = computed(() => [...(state.snapshot?.activity ?? [])].reverse())

const KIND_LABEL: Record<DevtoolsActivityKind, string> = {
  auth: 'Account',
  workspace: 'Workspace',
  billing: 'Billing',
  features: 'Features',
  credits: 'Credits',
  webhook: 'Webhooks',
  email: 'Email',
  connection: 'Connection',
}

const LEVEL_SIGNAL: Record<DevtoolsActivityEvent['level'], Signal> = { info: 'ok', warn: 'warn', error: 'err' }

const time = (at: number) => new Date(at).toLocaleTimeString()
</script>

<template>
  <PanelCard title="Activity">
    <p class="op65 mb3">
      What changed while this page was open: sign-ins, workspace and plan changes, granted
      features, credit balances, webhook deliveries, email status and the connection. The same
      entries go to the <code>Backend</code> layer of the Vue DevTools timeline.
    </p>
    <p
      v-if="events.length === 0"
      class="op50"
    >
      Nothing yet. Sign in, buy a plan or spend credits in the inspected app, and it shows up here.
    </p>
    <ol
      v-else
      class="flex flex-col gap-1"
    >
      <li
        v-for="event of events"
        :key="event.id"
        class="flex items-start gap-2 py1 border-b n-border-base"
      >
        <Led :signal="LEVEL_SIGNAL[event.level]" />
        <span class="font-mono text-xs op50 w-20 shrink-0">{{ time(event.at) }}</span>
        <span class="text-xs op65 w-22 shrink-0">{{ KIND_LABEL[event.kind] }}</span>
        <span class="flex-1">
          {{ event.title }}
          <span
            v-if="event.detail"
            class="op65"
          >— {{ event.detail }}</span>
        </span>
      </li>
    </ol>
  </PanelCard>
</template>
