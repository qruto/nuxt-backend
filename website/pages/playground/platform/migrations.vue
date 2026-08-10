<script setup lang="ts">
import { ref } from 'vue'
import { api } from '#backend/api'

definePageMeta({ middleware: 'auth' })

// Online, batched schema migrations — status reads the migration component's
// own state (live), runs can start from here or the CLI.
const status = useQuery(api.migrations.status)
const messageCount = useCount(api.aggregates.countMessages)
const totalCharacters = useAggregate(api.aggregates.totalCharacters)
const runBackfill = useAction(api.migrations.runBackfill)

const MIGRATIONS = ['backfillMessagesCount', 'backfillMessagesSize'] as const
const pending = ref<string | null>(null)
const errorMsg = ref<string | null>(null)

async function run(name: (typeof MIGRATIONS)[number], dryRun = false) {
  errorMsg.value = null
  pending.value = dryRun ? `${name}:dry` : name
  try {
    await runBackfill({ name, dryRun })
  }
  catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Failed'
  }
  finally {
    pending.value = null
  }
}

function stateTone(state: string): 'ok' | 'warn' | 'err' | 'signal' {
  if (state === 'success') return 'ok'
  if (state === 'failed') return 'err'
  if (state === 'inProgress') return 'signal'
  return 'warn'
}
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="migrations.getStatus · runOne"
      title="Migrations"
      live
    >
      Online, batched backfills over live data. The aggregates on this page
      only track writes made after their trigger registered — the backfills
      bring pre-existing rows into the count and character sum.
    </PageHeader>

    <div class="grid-auto">
      <MetricCard
        label="messages counted"
        :value="messageCount"
        tone="accent"
        hint="messagesCount aggregate"
      />
      <MetricCard
        label="characters stored"
        :value="totalCharacters"
        tone="accent"
        hint="messagesSize aggregate · sum"
      />
    </div>

    <LabPanel
      label="runner"
      title="Run backfills"
      tone="accent"
    >
      <div
        v-for="name in MIGRATIONS"
        :key="name"
        class="row run-row"
      >
        <span class="mono run-name">{{ name }}</span>
        <LabButton
          variant="signal"
          size="sm"
          :loading="pending === name"
          @click="run(name)"
        >
          Run
        </LabButton>
        <LabButton
          variant="ghost"
          size="sm"
          :loading="pending === `${name}:dry`"
          @click="run(name, true)"
        >
          Dry run
        </LabButton>
      </div>
      <p class="hint">
        The ops path works too:
        <code>npx convex run migrations:run '{"fn":"migrations:backfillMessagesCount"}'</code>
        — runs started there appear in the status table below.
      </p>
      <p
        v-if="errorMsg"
        class="msg err"
      >
        {{ errorMsg }}
      </p>
    </LabPanel>

    <LabPanel
      label="component state · live"
      title="Migration status"
      variant="well"
    >
      <p
        v-if="!status?.length"
        class="hint"
      >
        No migrations have run yet — start one above.
      </p>
      <div
        v-else
        class="rows"
      >
        <div
          v-for="entry in status"
          :key="entry.name"
          class="status-row"
        >
          <StatusPill
            :tone="stateTone(entry.state)"
            dot
          >
            {{ entry.state }}
          </StatusPill>
          <span class="mono status-name">{{ entry.name }}</span>
          <span class="status-meta mono">{{ entry.processed ?? 0 }} processed</span>
          <SignalDot
            v-if="entry.state === 'inProgress'"
            tone="accent"
            pulse
          />
        </div>
      </div>
    </LabPanel>
  </div>
</template>

<style scoped>
.run-row { gap: 0.7rem; margin-bottom: 0.5rem; }
.run-name { font-size: 0.8rem; flex: 1; }

.rows { display: flex; flex-direction: column; gap: 0.45rem; }
.status-row {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.55rem 0.7rem; border-radius: var(--r-sm);
  background: var(--surface); box-shadow: var(--raise-sm);
  font-size: 0.82rem;
}
.status-name { flex: 1; }
.status-meta { color: var(--ink-faint); font-size: 0.7rem; }

.msg { margin: 0.6rem 0 0; font-size: 0.8rem; }
.msg.err { color: var(--err); }
.hint code { font-size: 0.7rem; }
</style>
