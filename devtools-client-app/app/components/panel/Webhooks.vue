<script setup lang="ts">
import { outcomeSignal } from '~/utils/signal'

const state = usePanelState()
const panel = usePanel()

const service = ref<'all' | 'billing' | 'email'>('all')
const problemsOnly = ref(false)

// `readable` once an admin's feed answered; WebhookFeedNotice covers the rest.
const feed = computed(() => state.snapshot?.webhookFeed)
const rows = computed(() => state.snapshot?.webhooks ?? [])
const shown = computed(() => rows.value.filter(row =>
  (service.value === 'all' || row.service === service.value)
  && (!problemsOnly.value || outcomeSignal(row.outcome) === 'err' || outcomeSignal(row.outcome) === 'warn')))

// A tally row stands for `count` requests.
const counts = computed(() => {
  const byOutcome = new Map<string, number>()
  for (const row of rows.value) byOutcome.set(row.outcome, (byOutcome.get(row.outcome) ?? 0) + (row.count ?? 1))
  return [...byOutcome.entries()]
})

const lastReceived = computed(() => (['billing', 'email'] as const).map((name) => {
  const latest = rows.value.find(row => row.service === name)
  return { name, at: latest?.receivedAt, outcome: latest?.outcome }
}))

function receivedLabel(at: number | undefined): string {
  if (at) return `last event ${new Date(at).toLocaleString()}`
  if (feed.value === 'readable') return 'no event yet'
  if (feed.value === 'admins-only') return 'hidden: the delivery log is admin-only'
  return feed.value === 'unavailable' ? 'unknown: the delivery log is not exported' : 'loading…'
}

// The last replay asked for, and whether a row is the one it is about.
const replay = computed(() => state.snapshot?.webhookReplay)
const replaying = (row: { service: string, deliveryId: string }) => replay.value?.state === 'pending' && replay.value.service === row.service && replay.value.deliveryId === row.deliveryId

const secrets = computed(() => {
  const env = state.info?.env
  return (['BILLING_WEBHOOK_SECRET', 'EMAIL_WEBHOOK_SECRET'] as const).map((name) => {
    const deployed = env?.deployment?.names ? env.deployment.names.optional[name] === true : null
    return { name, set: deployed ?? env?.visible.optional[name] === true, where: deployed === null ? 'here' : 'on the deployment' }
  })
})
</script>

<template>
  <PanelCard title="Receiving">
    <div
      v-for="entry of lastReceived"
      :key="entry.name"
      class="flex items-center gap-2 text-xs"
    >
      <Led :signal="entry.outcome ? outcomeSignal(entry.outcome) : 'off'" />
      <span class="w-14">{{ entry.name }}</span>
      <span class="op65">{{ receivedLabel(entry.at) }}</span>
      <span class="op50 font-mono ml-auto">/{{ entry.name }}/events</span>
    </div>
    <div
      v-for="secret of secrets"
      :key="secret.name"
      class="flex items-center gap-2 text-xs"
    >
      <Led :signal="secret.set ? 'ok' : 'warn'" />
      <span class="font-mono">{{ secret.name }}</span>
      <span class="op65">{{ secret.set ? `set ${secret.where}` : 'not set: every delivery is rejected (503)' }}</span>
    </div>
  </PanelCard>

  <PanelCard title="Delivery log">
    <template #actions>
      <NSelectTabs
        v-model="service"
        n="xs"
        :options="[{ label: 'All', value: 'all' }, { label: 'Billing', value: 'billing' }, { label: 'Email', value: 'email' }]"
      />
      <NCheckbox
        v-model="problemsOnly"
        n="xs"
      >
        problems only
      </NCheckbox>
    </template>
    <div
      v-if="counts.length"
      class="flex gap-2 flex-wrap text-xs"
    >
      <SignalBadge
        v-for="[outcome, count] of counts"
        :key="outcome"
        :signal="outcomeSignal(outcome)"
      >
        {{ outcome }} · {{ count }}
      </SignalBadge>
    </div>
    <WebhookFeedNotice v-if="feed === 'admins-only' || feed === 'unavailable'" />
    <div
      v-else-if="!shown.length"
      class="op50"
    >
      {{ !feed ? 'Loading…' : rows.length ? 'Nothing matches the filter.' : 'None recorded yet.' }}
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
            Event
          </th>
          <th class="py1 pr4 font-normal">
            Outcome
          </th>
          <th class="py1 pr4 font-normal">
            Received
          </th>
          <th class="py1 font-normal">
            <span class="sr-only">Replay</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row of shown"
          :key="`${row.service}:${row.outcome}:${row.deliveryId}:${row.receivedAt}`"
        >
          <td class="py1 pr4">
            {{ row.service }}
          </td>
          <td class="py1 pr4 font-mono">
            {{ row.type ?? '—' }}
          </td>
          <td class="py1 pr4">
            <SignalBadge :signal="outcomeSignal(row.outcome)">
              {{ row.outcome }}{{ row.count && row.count > 1 ? ` ×${row.count}` : '' }}
            </SignalBadge>
            <span
              v-if="row.note"
              class="op50 pl1"
            >{{ row.note }}</span>
          </td>
          <td class="py1 pr4 font-mono op65">
            {{ new Date(row.receivedAt).toLocaleTimeString() }}
            <span
              v-if="row.replayedAt"
              class="op65 pl1"
            >replayed {{ new Date(row.replayedAt).toLocaleTimeString() }}</span>
          </td>
          <td class="py1">
            <NButton
              v-if="row.count === undefined"
              n="xs"
              icon="carbon-renew"
              :disabled="replaying(row)"
              @click="panel.replayWebhook(row.service, row.deliveryId)"
            >
              {{ replaying(row) ? 'Asking…' : 'Replay' }}
            </NButton>
          </td>
        </tr>
      </tbody>
    </table>
    <div
      v-if="replay && replay.state !== 'pending'"
      class="flex items-center gap-2 text-xs"
    >
      <SignalBadge :signal="replay.state === 'done' ? 'ok' : 'err'">
        {{ replay.state === 'done' ? 'replay asked' : 'replay refused' }}
      </SignalBadge>
      <span class="op65">{{ replay.state === 'done' ? `The ${replay.service} provider sends ${replay.deliveryId} again; it lands here once it arrives.` : replay.message }}</span>
    </div>
    <div class="text-xs op50">
      The last 50 deliveries this deployment verified. A request answered before its signature verified (refused, or a
      duplicate of one already handled) is counted per kind instead, shown at the latest one, and so is each run of
      free-plan deliveries (a $0 subscription's start, renewals and end). Replay asks the provider to send a verified
      delivery again, signed, to the same route; it takes a sign-in from the last ten minutes, which the admin
      console's Webhooks tab can ask for.
    </div>
  </PanelCard>
</template>
