<script setup lang="ts">
import { outcomeSignal } from '~/utils/signal'

const state = usePanelState()

const service = ref<'all' | 'billing' | 'email'>('all')
const problemsOnly = ref(false)

const rows = computed(() => state.snapshot?.webhooks ?? [])
const shown = computed(() => rows.value.filter(row =>
  (service.value === 'all' || row.service === service.value)
  && (!problemsOnly.value || outcomeSignal(row.outcome) === 'err' || outcomeSignal(row.outcome) === 'warn')))

const counts = computed(() => {
  const byOutcome = new Map<string, number>()
  for (const row of rows.value) byOutcome.set(row.outcome, (byOutcome.get(row.outcome) ?? 0) + 1)
  return [...byOutcome.entries()]
})

const lastReceived = computed(() => (['billing', 'email'] as const).map((name) => {
  const latest = rows.value.find(row => row.service === name)
  return { name, at: latest?.receivedAt, outcome: latest?.outcome }
}))

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
      <span class="op65">{{ entry.at ? `last event ${new Date(entry.at).toLocaleString()}` : 'no event yet' }}</span>
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
    <div
      v-if="!shown.length"
      class="op50"
    >
      {{ rows.length ? 'Nothing matches the filter.' : 'None recorded yet. Sign in to the inspected app to read the delivery log.' }}
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
          <th class="py1 font-normal">
            Received
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row of shown"
          :key="`${row.service}:${row.deliveryId}:${row.receivedAt}`"
        >
          <td class="py1 pr4">
            {{ row.service }}
          </td>
          <td class="py1 pr4 font-mono">
            {{ row.type ?? '—' }}
          </td>
          <td class="py1 pr4">
            <SignalBadge :signal="outcomeSignal(row.outcome)">
              {{ row.outcome }}
            </SignalBadge>
            <span
              v-if="row.note"
              class="op50 pl1"
            >{{ row.note }}</span>
          </td>
          <td class="py1 font-mono op65">
            {{ new Date(row.receivedAt).toLocaleTimeString() }}
          </td>
        </tr>
      </tbody>
    </table>
    <div class="text-xs op50">
      The last 50 deliveries this deployment verified or refused. To send one again, replay it from the provider's
      dashboard.
    </div>
  </PanelCard>
</template>
